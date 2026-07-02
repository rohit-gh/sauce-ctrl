export default defineEventHandler(() => {
  // Minted per run by server/plugins/terminal-ws.ts. Readable only same-origin,
  // so a cross-site page cannot obtain it (and thus cannot open a terminal).
  const token = (globalThis as any).__sauceWsToken as string | undefined
  return { token: token || null }
})
