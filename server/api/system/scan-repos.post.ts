import { resolve } from 'node:path'

/** Start a repository scan: whole computer, or only `roots` when given. */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ roots?: unknown }>(event).catch(() => null)
  const roots = Array.isArray(body?.roots)
    ? body.roots
        .filter((r): r is string => typeof r === 'string' && !!r.trim())
        .map((r) => resolve(r.trim().replace(/^~(?=$|\/)/, process.env.HOME || '')))
    : undefined
  return startScan(roots)
})
