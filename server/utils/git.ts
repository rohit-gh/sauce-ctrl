import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'

const execFileAsync = promisify(execFile)

export interface GitResult {
  stdout: string
  stderr: string
}

/**
 * Guard against argument (option) injection: a user-supplied ref, hash, or
 * branch name that begins with "-" would be parsed by git as a flag. None of
 * these values legitimately start with "-", so reject those outright.
 */
function assertNotOption(value: string, label = 'value'): string {
  const v = value.trim()
  if (!v) throw new Error(`${label} is required`)
  if (v.startsWith('-')) throw new Error(`Invalid ${label}: must not start with "-"`)
  return v
}

/**
 * Run a git command inside `cwd`. Throws an Error with the git stderr on failure.
 */
export async function runGit(cwd: string, args: string[]): Promise<GitResult> {
  if (!existsSync(cwd)) {
    throw new Error(`Directory does not exist: ${cwd}`)
  }
  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd,
      maxBuffer: 1024 * 1024 * 64,
      env: {
        ...process.env,
        // Never block on an interactive prompt: the app cannot service them,
        // so a prompt would hang the request forever. GIT_TERMINAL_PROMPT
        // covers git's own prompts; GIT_SSH_COMMAND forces ssh to fail fast
        // instead of asking for a key passphrase or host-key confirmation.
        GIT_TERMINAL_PROMPT: '0',
        GIT_SSH_COMMAND:
          process.env.GIT_SSH_COMMAND ||
          'ssh -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new',
      },
    })
    return { stdout, stderr }
  } catch (err: any) {
    const message = err?.stderr?.toString().trim() || err?.message || 'git command failed'
    throw new Error(message)
  }
}

export interface GitEnvStatus {
  /** Whether the `git` binary is on PATH and runnable. */
  installed: boolean
  /** Parsed `git --version` (e.g. "2.43.0"), if installed. */
  version: string | null
  /** Global/system `user.name`, if set. */
  userName: string | null
  /** Global/system `user.email`, if set. */
  userEmail: string | null
  /** True only when git is installed AND both name and email are configured. */
  configured: boolean
}

/**
 * Inspect the device's git installation and identity config. Used on first run
 * so we can confirm git is usable (not just that a GitHub token exists).
 *
 * Config is read from `$HOME` so we report device-wide (global/system) identity
 * rather than any single repository's local override.
 */
export async function gitEnvStatus(): Promise<GitEnvStatus> {
  let version: string | null = null
  try {
    const { stdout } = await execFileAsync('git', ['--version'], {
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    })
    version = stdout.replace(/^git version/i, '').trim() || null
  } catch {
    return { installed: false, version: null, userName: null, userEmail: null, configured: false }
  }

  const read = async (key: string): Promise<string | null> => {
    try {
      const { stdout } = await execFileAsync('git', ['config', '--get', key], {
        cwd: homedir(),
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      })
      return stdout.trim() || null
    } catch {
      return null
    }
  }

  const [userName, userEmail] = await Promise.all([read('user.name'), read('user.email')])
  return { installed: true, version, userName, userEmail, configured: Boolean(userName && userEmail) }
}

export async function isGitRepo(dir: string): Promise<boolean> {
  try {
    const { stdout } = await runGit(dir, ['rev-parse', '--is-inside-work-tree'])
    return stdout.trim() === 'true'
  } catch {
    return false
  }
}

export async function repoRoot(dir: string): Promise<string | null> {
  try {
    const { stdout } = await runGit(dir, ['rev-parse', '--show-toplevel'])
    return stdout.trim() || null
  } catch {
    return null
  }
}

export async function currentBranch(dir: string): Promise<string> {
  try {
    const { stdout } = await runGit(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])
    return stdout.trim()
  } catch {
    return ''
  }
}

/** Remote URL for the given remote (defaults to origin), if any. */
export async function remoteUrl(dir: string, remote = 'origin'): Promise<string | null> {
  try {
    const { stdout } = await runGit(dir, ['remote', 'get-url', remote])
    return stdout.trim() || null
  } catch {
    return null
  }
}

/** Whether a git remote URL points at github.com (https or ssh forms). */
export function isGithubRemote(url: string | null): boolean {
  if (!url) return false
  return /(?:^|@|\/\/)github\.com[/:]/i.test(url) || /(?:^|\.)github\.com$/i.test(url)
}

const NUL = '\u0000' // used only for parsing `git ... -z` output
const FIELD = '\u001f' // unit separator: safe inside execFile args (unlike NUL)
const REC = '\u001e' // record separator

export interface CommitNode {
  hash: string
  abbrevHash: string
  parents: string[]
  author: string
  authorEmail: string
  timestamp: number
  subject: string
  body: string
  refs: string[]
}

/**
 * Return commit history across all refs, newest first, with parent info for graphing.
 */
export async function commitLog(dir: string, limit = 300): Promise<CommitNode[]> {
  // Custom format using field + record separators so we can parse robustly.
  const fmt = ['%H', '%h', '%P', '%an', '%ae', '%at', '%s', '%b', '%D'].join(FIELD) + REC
  const { stdout } = await runGit(dir, [
    'log',
    '--all',
    '--date-order',
    `--max-count=${limit}`,
    `--pretty=format:${fmt}`,
  ])

  const records = stdout.split(REC).map((r) => r.replace(/^\n/, '')).filter((r) => r.trim().length > 0)
  return records.map((rec) => {
    const [hash, abbrevHash, parents, author, authorEmail, at, subject, body, refs] = rec.split(FIELD)
    return {
      hash,
      abbrevHash,
      parents: parents ? parents.trim().split(/\s+/).filter(Boolean) : [],
      author,
      authorEmail,
      timestamp: Number(at) * 1000,
      subject: subject ?? '',
      body: (body ?? '').trim(),
      refs: refs
        ? refs
            .split(',')
            .map((r) => r.trim())
            .filter(Boolean)
        : [],
    }
  })
}

export interface BranchInfo {
  name: string
  isRemote: boolean
  isCurrent: boolean
  upstream: string | null
  hash: string
}

export async function branches(dir: string): Promise<BranchInfo[]> {
  const fmt = ['%(refname:short)', '%(HEAD)', '%(upstream:short)', '%(objectname:short)'].join(FIELD)
  const { stdout } = await runGit(dir, [
    'branch',
    '--all',
    `--format=${fmt}`,
    '--sort=-committerdate',
  ])
  return stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, head, upstream, hash] = line.split(FIELD)
      return {
        name,
        isRemote: name.startsWith('remotes/'),
        isCurrent: head === '*',
        upstream: upstream || null,
        hash,
      }
    })
    .filter((b) => !b.name.includes('HEAD ->'))
}

export interface FileChange {
  path: string
  origPath?: string
  index: string // staged status code
  workingTree: string // unstaged status code
  staged: boolean
  unstaged: boolean
  untracked: boolean
}

export interface StatusResult {
  branch: string
  upstream: string | null
  ahead: number
  behind: number
  staged: FileChange[]
  unstaged: FileChange[]
  untracked: FileChange[]
}

/** Parse `git status --porcelain=v2 --branch -z`. */
export async function status(dir: string): Promise<StatusResult> {
  const { stdout } = await runGit(dir, ['status', '--porcelain=v2', '--branch', '-z'])
  const parts = stdout.split(NUL)

  const result: StatusResult = {
    branch: '',
    upstream: null,
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    untracked: [],
  }

  for (let i = 0; i < parts.length; i++) {
    const line = parts[i]
    if (!line) continue

    if (line.startsWith('# branch.head')) {
      result.branch = line.replace('# branch.head', '').trim()
    } else if (line.startsWith('# branch.upstream')) {
      result.upstream = line.replace('# branch.upstream', '').trim()
    } else if (line.startsWith('# branch.ab')) {
      const m = line.match(/\+(\d+)\s+-(\d+)/)
      if (m) {
        result.ahead = Number(m[1])
        result.behind = Number(m[2])
      }
    } else if (line.startsWith('1 ')) {
      // Ordinary changed entry: "1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>"
      const tokens = line.split(' ')
      const xy = tokens[1]
      const path = tokens.slice(8).join(' ')
      pushChange(result, path, xy)
    } else if (line.startsWith('2 ')) {
      // Renamed/copied: path is in this record, origPath is the NEXT NUL field.
      const tokens = line.split(' ')
      const xy = tokens[1]
      const path = tokens.slice(9).join(' ')
      const origPath = parts[++i]
      pushChange(result, path, xy, origPath)
    } else if (line.startsWith('u ')) {
      // Unmerged (conflict)
      const tokens = line.split(' ')
      const path = tokens.slice(10).join(' ')
      result.unstaged.push({
        path,
        index: 'U',
        workingTree: 'U',
        staged: false,
        unstaged: true,
        untracked: false,
      })
    } else if (line.startsWith('? ')) {
      const path = line.slice(2)
      result.untracked.push({
        path,
        index: '.',
        workingTree: '?',
        staged: false,
        unstaged: true,
        untracked: true,
      })
    }
  }

  return result
}

function pushChange(result: StatusResult, path: string, xy: string, origPath?: string) {
  const index = xy[0]
  const workingTree = xy[1]
  const base: FileChange = {
    path,
    origPath,
    index,
    workingTree,
    staged: index !== '.',
    unstaged: workingTree !== '.',
    untracked: false,
  }
  if (base.staged) result.staged.push(base)
  if (base.unstaged) result.unstaged.push(base)
}

export interface CommitDetail extends CommitNode {
  files: { path: string; additions: number; deletions: number; status: string }[]
  stat: { filesChanged: number; additions: number; deletions: number }
}

export async function commitDetail(dir: string, hash: string): Promise<CommitDetail> {
  const fmt = ['%H', '%h', '%P', '%an', '%ae', '%at', '%s', '%b', '%D'].join(FIELD)
  const { stdout } = await runGit(dir, [
    'show',
    '--numstat',
    '--no-color',
    `--pretty=format:${fmt}${REC}`,
    hash,
  ])
  const [header, ...rest] = stdout.split(REC)
  const [h, ah, parents, author, authorEmail, at, subject, body, refs] = header.split(FIELD)

  const files: CommitDetail['files'] = []
  let additions = 0
  let deletions = 0
  const numstatBlock = rest.join(REC)
  for (const raw of numstatBlock.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const m = line.split('\t')
    if (m.length >= 3) {
      const add = m[0] === '-' ? 0 : Number(m[0])
      const del = m[1] === '-' ? 0 : Number(m[1])
      additions += add
      deletions += del
      files.push({ path: m.slice(2).join('\t'), additions: add, deletions: del, status: 'M' })
    }
  }

  return {
    hash: h,
    abbrevHash: ah,
    parents: parents ? parents.trim().split(/\s+/).filter(Boolean) : [],
    author,
    authorEmail,
    timestamp: Number(at) * 1000,
    subject: subject ?? '',
    body: (body ?? '').trim(),
    refs: refs ? refs.split(',').map((r) => r.trim()).filter(Boolean) : [],
    files,
    stat: { filesChanged: files.length, additions, deletions },
  }
}

export async function fileDiff(dir: string, path: string, staged: boolean): Promise<string> {
  const args = ['diff', '--no-color']
  if (staged) args.push('--staged')
  args.push('--', path)
  const { stdout } = await runGit(dir, args)
  return stdout
}

/** Unified diff for a file in a specific commit. */
export async function commitFileDiff(dir: string, hash: string, file: string): Promise<string> {
  const { stdout } = await runGit(dir, ['show', '--no-color', '--format=', hash, '--', file])
  return stdout
}

export async function gitFetch(dir: string, remote = 'origin'): Promise<void> {
  await runGit(dir, ['fetch', remote])
}

export async function gitPull(dir: string, remote = 'origin'): Promise<void> {
  const branch = await currentBranch(dir)
  if (!branch || branch === 'HEAD') throw new Error('Cannot pull in detached HEAD state')
  await runGit(dir, ['pull', '--no-rebase', remote, branch])
}

export async function gitPush(dir: string, remote = 'origin'): Promise<void> {
  const branch = await currentBranch(dir)
  if (!branch || branch === 'HEAD') throw new Error('Cannot push in detached HEAD state')
  await runGit(dir, ['push', remote, branch])
}

export async function gitReset(dir: string, hash: string, mode: 'soft' | 'mixed' | 'hard'): Promise<void> {
  await runGit(dir, ['reset', `--${mode}`, assertNotOption(hash, 'hash')])
}

export async function gitCherryPick(dir: string, hash: string): Promise<void> {
  await runGit(dir, ['cherry-pick', assertNotOption(hash, 'hash')])
}

export async function createBranchAt(dir: string, name: string, startPoint: string): Promise<void> {
  await runGit(dir, ['branch', assertNotOption(name, 'branch name'), assertNotOption(startPoint, 'start point')])
}

export async function checkoutBranch(dir: string, branch: string): Promise<void> {
  const target = assertNotOption(branch, 'branch').replace(/^remotes\//, '').replace(/^origin\//, '')
  try {
    await runGit(dir, ['checkout', target])
  } catch {
    await runGit(dir, ['checkout', '-b', target, '--track', branch])
  }
}

export interface StashEntry {
  index: number
  ref: string
  branch: string
  message: string
}

/** Save working-tree changes to the stash. Returns false if there was nothing to stash. */
export async function stashPush(dir: string, message?: string, includeUntracked = true): Promise<boolean> {
  const args = ['stash', 'push']
  if (includeUntracked) args.push('--include-untracked')
  if (message) args.push('-m', message)
  const { stdout } = await runGit(dir, args)
  return !/No local changes to save/i.test(stdout)
}

export async function stashList(dir: string): Promise<StashEntry[]> {
  const { stdout } = await runGit(dir, ['stash', 'list', '--format=%gd\u001f%gs'])
  const entries: StashEntry[] = []
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue
    const [ref, subject = ''] = line.split('\u001f')
    const idxMatch = ref.match(/stash@\{(\d+)\}/)
    const branchMatch = subject.match(/(?:WIP )?[Oo]n ([^:]+):/)
    entries.push({
      index: idxMatch ? Number(idxMatch[1]) : entries.length,
      ref: ref.trim(),
      branch: branchMatch ? branchMatch[1].trim() : '',
      message: subject.trim(),
    })
  }
  return entries
}

export async function stashApply(dir: string, index: number): Promise<void> {
  await runGit(dir, ['stash', 'apply', `stash@{${index}}`])
}

/** Apply a stash and drop it from the stack. */
export async function stashPop(dir: string, index: number): Promise<void> {
  await runGit(dir, ['stash', 'pop', `stash@{${index}}`])
}

export async function stashDrop(dir: string, index: number): Promise<void> {
  await runGit(dir, ['stash', 'drop', `stash@{${index}}`])
}

/**
 * Create a new branch from the current HEAD and switch to it.
 * When `stash` is true, working-tree changes are stashed first so the new
 * branch starts clean; otherwise uncommitted changes carry over to the new branch.
 */
export async function createBranchFromCurrent(
  dir: string,
  name: string,
  stash: boolean,
): Promise<{ branch: string; stashed: boolean }> {
  const safeName = assertNotOption(name, 'branch name')
  let stashed = false
  if (stash) {
    stashed = await stashPush(dir, `sauce-ctrl: before creating ${safeName}`)
  }
  await runGit(dir, ['checkout', '-b', safeName])
  return { branch: await currentBranch(dir), stashed }
}
