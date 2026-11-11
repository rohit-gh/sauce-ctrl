export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id is required' })
  const body = await readBody<{ pinned?: unknown }>(event)
  if (typeof body?.pinned !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: '`pinned` (boolean) is required' })
  }
  setProjectPinned(id, body.pinned)
  return { ok: true }
})
