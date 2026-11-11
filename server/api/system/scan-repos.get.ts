/**
 * Progress + results of the current (or last) repository scan.
 * `?scope=computer|folder` limits it to that kind of scan.
 */
export default defineEventHandler((event) => {
  const { scope } = getQuery(event)
  return getScanStatus(scope === 'computer' || scope === 'folder' ? scope : undefined)
})
