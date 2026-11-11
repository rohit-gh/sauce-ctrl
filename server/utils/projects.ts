import { randomUUID } from 'node:crypto'
import { basename, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { addProject, getProjectByPath, type ProjectRow } from './db'

/**
 * Validate `raw` as a git repository path and save it as a project.
 * Throws an H3 error (400) when the path is missing or not a repository; the
 * not-a-repo case carries `data.code = 'NOT_A_REPO'` so the UI can offer to
 * scan inside the folder instead.
 */
export async function registerProject(raw: string | undefined): Promise<ProjectRow> {
  const trimmed = raw?.trim()
  if (!trimmed) {
    throw createError({ statusCode: 400, statusMessage: 'A repository path is required' })
  }

  const path = resolve(trimmed.replace(/^~(?=$|\/)/, process.env.HOME || ''))

  if (!existsSync(path)) {
    throw createError({ statusCode: 400, statusMessage: `Path does not exist: ${path}` })
  }

  const root = await repoRoot(path)
  if (!root) {
    throw createError({
      statusCode: 400,
      statusMessage: `Not a git repository: ${path}`,
      data: { code: 'NOT_A_REPO', path },
    })
  }

  const row: ProjectRow = {
    id: randomUUID(),
    name: basename(root),
    path: root,
    added_at: Date.now(),
    last_opened: Date.now(),
  }
  addProject(row)
  // Re-adding an existing path keeps its original row/id (ON CONFLICT) — return that.
  return getProjectByPath(root) ?? row
}
