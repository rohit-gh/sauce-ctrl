import type { ProjectRow } from '../../utils/db'

/** Add several repositories at once (used by repository discovery). */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ paths?: unknown }>(event)
  const paths = Array.isArray(body?.paths) ? body.paths.filter((p): p is string => typeof p === 'string') : []
  if (!paths.length) {
    throw createError({ statusCode: 400, statusMessage: 'paths must be a non-empty array' })
  }

  const added: ProjectRow[] = []
  const failed: { path: string; error: string }[] = []
  for (const p of paths) {
    try {
      added.push(await registerProject(p))
    } catch (err: any) {
      failed.push({ path: p, error: err?.statusMessage || err?.message || 'Failed to add' })
    }
  }
  return { added, failed }
})
