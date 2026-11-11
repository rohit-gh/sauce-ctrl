import { readdir, realpath, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'

/**
 * Background discovery of git repositories on this machine.
 *
 * Phases run in order so the folders people actually keep code in show up
 * first: common folders (Documents, Desktop, Downloads, …) → the rest of the
 * home directory → other locations on disk (external volumes, /opt, …).
 *
 * Only one scan runs at a time; starting a new one cancels the previous. The
 * last *full* scan is cached in SQLite so results survive an app restart.
 */

export type ScanPhase = 'common' | 'home' | 'system' | 'folder'

export interface FoundRepo {
  path: string
  name: string
  /** ms epoch of the last git activity we can cheaply detect (index/HEAD mtime). */
  lastActivity: number | null
  phase: ScanPhase
}

export interface ScanStatus {
  running: boolean
  /** 'computer' = full scan; 'folder' = scan limited to `roots`. */
  scope: 'computer' | 'folder'
  roots: string[]
  phase: ScanPhase | null
  phases: ScanPhase[]
  scannedDirs: number
  currentDir: string | null
  found: FoundRepo[]
  startedAt: number | null
  finishedAt: number | null
  cancelled: boolean
  /**
   * Folders the OS refused to list (EPERM) — on macOS, privacy protection for
   * Documents/Desktop/Downloads/external drives when access was denied.
   */
  blocked: string[]
  home: string
}

const CACHE_KEY = 'repo-scan:last'
const CONCURRENCY = 8
const MAX_DEPTH = 12
const MAX_BLOCKED = 50

/** Folders in $HOME scanned first, in this order (missing ones are ignored). */
const COMMON_HOME_DIRS = [
  'Documents',
  'Desktop',
  'Downloads',
  'Developer',
  'Projects',
  'projects',
  'Code',
  'code',
  'dev',
  'src',
  'repos',
  'workspace',
  'GitHub',
  'git',
  'Sites',
  'work',
]

/** Directory names never worth descending into (deps, build output, caches). */
const SKIP_NAMES = new Set([
  'node_modules',
  'bower_components',
  'Pods',
  'DerivedData',
  '__pycache__',
  'site-packages',
  'venv',
  'Backups.backupdb',
  'lost+found',
  '$RECYCLE.BIN',
  'System Volume Information',
])

/**
 * macOS: `Library` folders hold app data, never repos. Reading other apps' data
 * there triggers privacy prompts, so skip them everywhere (other users' homes,
 * external drives with a macOS install, Unity's `Library` cache, …).
 */
const SKIP_LIBRARY = process.platform === 'darwin'

/** Bundle-like folders on macOS (apps, photo libraries) — opaque, never repos. */
const SKIP_SUFFIXES = ['.app', '.photoslibrary', '.musiclibrary', '.tvlibrary', '.framework', '.bundle', '.xcarchive']

/**
 * Top-level $HOME folders skipped during the "rest of home" phase. On macOS
 * these hold app data/media and touching them triggers privacy prompts.
 */
const HOME_SKIP = new Set(['Library', 'Pictures', 'Music', 'Movies', 'Applications', 'Public'])

/** Top-level system folders skipped during the "other locations" phase. */
const ROOT_SKIP_DARWIN = new Set([
  'System', 'Library', 'private', 'usr', 'bin', 'sbin', 'dev', 'cores', 'etc', 'var', 'tmp', 'Applications', 'opt/homebrew',
  // autofs mount points — listing them can block on network lookups.
  'Network', 'net', 'home',
])
const ROOT_SKIP_LINUX = new Set([
  'proc', 'sys', 'dev', 'run', 'boot', 'lib', 'lib32', 'lib64', 'libx32', 'usr', 'bin', 'sbin', 'etc', 'var', 'tmp', 'snap', 'nix',
])

interface Job {
  status: ScanStatus
  cancelled: boolean
}

let job: Job | null = null

function home(): string {
  return process.env.HOME || homedir()
}

function emptyStatus(): ScanStatus {
  return {
    running: false,
    scope: 'computer',
    roots: [],
    phase: null,
    phases: [],
    scannedDirs: 0,
    currentDir: null,
    found: [],
    startedAt: null,
    finishedAt: null,
    cancelled: false,
    blocked: [],
    home: home(),
  }
}

/**
 * Current (or last) scan status. With `scope`, only a scan of that kind is
 * returned — so a one-off folder scan never hides the last whole-computer
 * results, which are restored from the cache after a restart.
 */
export function getScanStatus(scope?: ScanStatus['scope']): ScanStatus {
  if (job && (!scope || job.status.scope === scope)) return job.status
  if (scope === 'folder') return { ...emptyStatus(), scope: 'folder' }
  const cached = getCache<ScanStatus>(CACHE_KEY)
  return cached ? { ...cached, blocked: cached.blocked ?? [], running: false, currentDir: null, home: home() } : emptyStatus()
}

/**
 * Mark a job stopped right away. In-flight directory reads may take a while to
 * settle (slow mounts, OS permission prompts); the UI shouldn't wait on them.
 */
function stop(j: Job) {
  j.cancelled = true
  j.status.running = false
  j.status.cancelled = true
  j.status.phase = null
  j.status.currentDir = null
  j.status.finishedAt = Date.now()
  // Partial results (usually the common folders) are still worth keeping.
  if (j.status.scope === 'computer') setCache(CACHE_KEY, j.status)
}

export function cancelScan() {
  if (job?.status.running) stop(job)
  return getScanStatus()
}

/**
 * Start a scan. With `roots`, only those folders are scanned (e.g. a folder the
 * user picked that isn't itself a repository). Without, the whole computer.
 */
export function startScan(roots?: string[]): ScanStatus {
  if (job?.status.running) stop(job)

  const scope = roots?.length ? 'folder' : 'computer'
  const status: ScanStatus = {
    ...emptyStatus(),
    running: true,
    scope,
    roots: roots ?? [],
    phases: scope === 'folder' ? ['folder'] : ['common', 'home', 'system'],
    startedAt: Date.now(),
  }
  const current: Job = { status, cancelled: false }
  job = current

  run(current).catch((err) => {
    console.error('[repo-scan] failed:', err)
  }).finally(() => {
    if (current.cancelled) return
    current.status.running = false
    current.status.phase = null
    current.status.currentDir = null
    current.status.finishedAt = Date.now()
    if (current.status.scope === 'computer' && !current.cancelled) {
      setCache(CACHE_KEY, current.status)
    }
  })

  return status
}

async function safeRealpath(p: string): Promise<string | null> {
  try {
    return await realpath(p)
  } catch {
    return null
  }
}

async function run(current: Job) {
  const s = current.status
  const seen = new Set<string>()

  if (s.scope === 'folder') {
    s.phase = 'folder'
    const roots = (await Promise.all(s.roots.map(safeRealpath))).filter((r): r is string => !!r)
    await walk(current, roots, new Set(), seen)
    return
  }

  const h = (await safeRealpath(home())) ?? home()

  // Phase 1 — common folders, in priority order (dedupe case-insensitive dupes).
  s.phase = 'common'
  const common: string[] = []
  for (const name of COMMON_HOME_DIRS) {
    const p = join(h, name)
    if (!existsSync(p)) continue
    const real = await safeRealpath(p)
    if (real && !common.includes(real)) common.push(real)
  }
  await walk(current, common, new Set(), seen)
  if (current.cancelled) return

  // Phase 2 — everything else in $HOME.
  s.phase = 'home'
  const homeSkip = new Set(common)
  if (process.platform === 'darwin') {
    for (const n of HOME_SKIP) homeSkip.add(join(h, n))
  }
  await walk(current, [h], homeSkip, seen)
  if (current.cancelled) return

  // Phase 3 — other places on disk (external volumes, /opt, /srv, other mounts).
  if (process.platform === 'win32') return
  s.phase = 'system'
  const rootSkipNames = process.platform === 'darwin' ? ROOT_SKIP_DARWIN : ROOT_SKIP_LINUX
  const rootSkip = new Set<string>([h, '/usr/local', '/home/linuxbrew'])
  for (const n of rootSkipNames) rootSkip.add(`/${n}`)
  await walk(current, ['/'], rootSkip, seen)
}

/** Depth-first walk of `roots` with a small worker pool. */
async function walk(current: Job, roots: string[], skip: Set<string>, seen: Set<string>) {
  const stack: { dir: string; depth: number }[] = roots
    .filter((r) => !seen.has(r))
    .reverse()
    .map((dir) => ({ dir, depth: 0 }))
  let active = 0

  const worker = async () => {
    while (!current.cancelled) {
      const next = stack.pop()
      if (!next) {
        if (active === 0) return
        await new Promise((r) => setTimeout(r, 5))
        continue
      }
      active++
      try {
        await visit(current, next.dir, next.depth, stack, skip, seen)
      } finally {
        active--
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
}

async function visit(
  current: Job,
  dir: string,
  depth: number,
  stack: { dir: string; depth: number }[],
  skip: Set<string>,
  seen: Set<string>,
) {
  if (seen.has(dir)) return
  seen.add(dir)

  const s = current.status
  if (current.cancelled) return
  s.scannedDirs++
  s.currentDir = dir

  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (err: any) {
    // EPERM is the OS saying "not allowed" (macOS privacy protection) — worth
    // telling the user. EACCES (plain Unix permissions) / ENOENT are expected.
    if (err?.code === 'EPERM' && s.blocked.length < MAX_BLOCKED) s.blocked.push(dir)
    return
  }

  // A `.git` directory (normal clone) or file (worktree/submodule) marks a repo.
  // Don't descend further: nested repos are almost always submodules or vendored.
  // A scan root is the exception (e.g. a dotfiles repo at ~): list it, but keep
  // going, or everything beneath it would be missed.
  if (current.cancelled) return
  if (entries.some((e) => e.name === '.git' && (e.isDirectory() || e.isFile()))) {
    s.found.push({
      path: dir,
      name: basename(dir) || dir,
      lastActivity: await lastActivity(dir),
      phase: s.phase ?? 'folder',
    })
    if (depth > 0) return
  }

  if (depth >= MAX_DEPTH) return

  const children: string[] = []
  for (const e of entries) {
    // Never follow symlinks: avoids cycles and double-counting the same repo.
    if (!e.isDirectory() || e.isSymbolicLink()) continue
    const name = e.name
    // Hidden folders are tool-managed (~/.nvm, ~/.cargo, editor plugins…).
    if (name.startsWith('.')) continue
    if (SKIP_NAMES.has(name)) continue
    if (SKIP_LIBRARY && name === 'Library') continue
    if (SKIP_SUFFIXES.some((suf) => name.endsWith(suf))) continue
    const child = join(dir, name)
    if (skip.has(child) || seen.has(child)) continue
    children.push(child)
  }
  // Push in reverse so the stack pops them in alphabetical order.
  children.sort((a, b) => b.localeCompare(a))
  for (const c of children) stack.push({ dir: c, depth: depth + 1 })
}

async function lastActivity(repo: string): Promise<number | null> {
  for (const f of ['.git/index', '.git/HEAD', '.git']) {
    try {
      return (await stat(join(repo, f))).mtimeMs
    } catch {
      // try next
    }
  }
  return null
}
