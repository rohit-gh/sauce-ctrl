export default defineEventHandler(async (event) => {
  const body = await readBody<{ path?: string }>(event)
  return registerProject(body?.path)
})
