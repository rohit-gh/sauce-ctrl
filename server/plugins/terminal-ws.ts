import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import type { Subprocess } from 'bun'

/**
 * Launch the interactive-terminal WebSocket server.
 *
 * Bun.serve's native WebSocket accept loop is not pumped when it runs inside
 * Nitro's node-compat HTTP process, so we run it as a separate, pure-Bun child
 * process (see server/terminal-server.ts). This plugin just supervises it.
 */

const WS_PORT = Number(process.env.SAUCE_WS_PORT || 3009)

export default defineNitroPlugin((nitroApp) => {
  const g = globalThis as any
  if (g.__sauceTermChild) return

  const scriptPath = join(process.cwd(), 'server', 'terminal-server.ts')
  if (!existsSync(scriptPath)) {
    console.warn(`[SauceControl] terminal-server.ts not found at ${scriptPath}; terminal disabled`)
    return
  }

  // Per-run secret required to open a terminal WebSocket. Shared with the SPA
  // over the same-origin API (/api/terminal/token) and with the child process
  // via env so it can authenticate incoming connections.
  const token = randomBytes(32).toString('hex')
  g.__sauceWsToken = token

  try {
    const child: Subprocess = Bun.spawn([process.execPath, scriptPath], {
      cwd: process.cwd(),
      env: { ...process.env, SAUCE_WS_PORT: String(WS_PORT), SAUCE_WS_TOKEN: token },
      stdout: 'inherit',
      stderr: 'inherit',
    })
    g.__sauceTermChild = child

    const stop = () => {
      try {
        child.kill()
      } catch {}
      g.__sauceTermChild = null
    }
    nitroApp.hooks.hook('close', stop)
    process.on('exit', stop)
    // Ensure the child dies with the parent even on signal-based shutdowns.
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
      process.on(sig, () => {
        stop()
        process.exit(0)
      })
    }
  } catch (err: any) {
    console.error('[SauceControl] failed to launch terminal server:', err?.message || err)
  }
})
