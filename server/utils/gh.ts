import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface GhStatus {
  installed: boolean
  authenticated: boolean
  user: string | null
  version: string | null
}

async function which(cmd: string): Promise<boolean> {
  try {
    await execFileAsync('which', [cmd])
    return true
  } catch {
    return false
  }
}

export async function ghStatus(): Promise<GhStatus> {
  const installed = await which('gh')
  if (!installed) return { installed: false, authenticated: false, user: null, version: null }

  let version: string | null = null
  try {
    const { stdout } = await execFileAsync('gh', ['--version'])
    version = stdout.split('\n')[0]?.replace('gh version', '').trim() || null
  } catch {}

  // `gh api user` succeeds only when authenticated.
  try {
    const { stdout } = await execFileAsync('gh', ['api', 'user', '--jq', '.login'], {
      env: { ...process.env, GH_PROMPT_DISABLED: '1' },
    })
    const user = stdout.trim()
    return { installed: true, authenticated: Boolean(user), user: user || null, version }
  } catch {
    return { installed: true, authenticated: false, user: null, version }
  }
}

export interface GhRepo {
  nameWithOwner: string
  name: string
  description: string
  isPrivate: boolean
  isFork: boolean
  updatedAt: string
  url: string
  language: string | null
}

/**
 * List repositories the authenticated user can access.
 * When `owner` is set (a user or org), lists that account's repos instead.
 */
export async function ghListRepos(owner?: string, limit = 200): Promise<GhRepo[]> {
  const args = ['repo', 'list']
  if (owner) args.push(owner)
  args.push(
    '--limit',
    String(limit),
    '--json',
    'nameWithOwner,name,description,isPrivate,isFork,updatedAt,url,primaryLanguage',
  )
  const { stdout } = await execFileAsync('gh', args, {
    maxBuffer: 1024 * 1024 * 16,
    env: { ...process.env, GH_PROMPT_DISABLED: '1' },
  })
  const raw = JSON.parse(stdout || '[]') as any[]
  return raw
    .map((r) => ({
      nameWithOwner: r.nameWithOwner,
      name: r.name,
      description: r.description || '',
      isPrivate: !!r.isPrivate,
      isFork: !!r.isFork,
      updatedAt: r.updatedAt,
      url: r.url,
      language: r.primaryLanguage?.name ?? null,
    }))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}

/** Clone a repo (owner/name) into `targetDir` using gh's authenticated credentials. */
export async function ghCloneRepo(nameWithOwner: string, targetDir: string): Promise<void> {
  await execFileAsync('gh', ['repo', 'clone', nameWithOwner, targetDir], {
    maxBuffer: 1024 * 1024 * 16,
    env: { ...process.env, GH_PROMPT_DISABLED: '1', GIT_TERMINAL_PROMPT: '0' },
  })
}
