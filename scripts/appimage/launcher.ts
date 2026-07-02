/**
 * SauceControl AppImage launcher (runs under the bundled Bun runtime).
 *
 * Responsibilities:
 *   1. Pick free TCP ports for the Nitro HTTP server and the terminal WS server.
 *   2. Start the Nitro server (.output/server/index.mjs) with those ports.
 *   3. Wait until the HTTP server accepts connections.
 *   4. Open the UI in a dedicated app window (Chromium `--app`) if available,
 *      otherwise fall back to the system default browser.
 *   5. Tie lifecycles together: when the app window (or server) exits, shut the
 *      whole thing down so closing the window quits the "program".
 *
 * The launcher's own directory is the app root, so `process.cwd()` for the
 * server points at the bundled `.output` and `server/` (the terminal plugin
 * resolves `server/terminal-server.ts` relative to cwd).
 */
import { createServer } from 'node:net'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Subprocess } from 'bun'

const APP_DIR = import.meta.dir
const HOST = '127.0.0.1'

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.on('error', reject)
    srv.listen(0, HOST, () => {
      const addr = srv.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      srv.close(() => resolve(port))
    })
  })
}

async function waitForHttp(url: string, timeoutMs = 20000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      await fetch(url, { method: 'HEAD' })
      return
    } catch {
      await Bun.sleep(150)
    }
  }
  throw new Error(`Timed out waiting for ${url}`)
}

function pickBrowser(): { cmd: string; app: boolean } | null {
  // Prefer a Chromium-family browser so we can open a chromeless app window.
  const appBrowsers = [
    'chromium',
    'chromium-browser',
    'google-chrome',
    'google-chrome-stable',
    'brave-browser',
    'microsoft-edge',
    'vivaldi',
  ]
  for (const cmd of appBrowsers) {
    if (Bun.which(cmd)) return { cmd, app: true }
  }
  if (Bun.which('xdg-open')) return { cmd: 'xdg-open', app: false }
  return null
}

async function main() {
  const httpPort = await findFreePort()
  let wsPort = await findFreePort()
  if (wsPort === httpPort) wsPort = await findFreePort()

  const url = `http://${HOST}:${httpPort}`

  const env = {
    ...process.env,
    HOST,
    PORT: String(httpPort),
    NITRO_PORT: String(httpPort),
    // SAUCE_WS_PORT tells the terminal server which port to *listen* on.
    // NUXT_PUBLIC_WS_PORT overrides the public runtime config so the browser
    // *connects* to that same (dynamically chosen) port — without it the client
    // falls back to the build-time default (3009) and the terminal never links.
    SAUCE_WS_PORT: String(wsPort),
    NUXT_PUBLIC_WS_PORT: String(wsPort),
  }

  const server: Subprocess = Bun.spawn(
    [process.execPath, '--bun', join(APP_DIR, '.output', 'server', 'index.mjs')],
    { cwd: APP_DIR, env, stdout: 'inherit', stderr: 'inherit' },
  )

  let shuttingDown = false
  const shutdown = (code = 0) => {
    if (shuttingDown) return
    shuttingDown = true
    try {
      server.kill()
    } catch {}
    process.exit(code)
  }
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(sig, () => shutdown(0))
  }
  server.exited.then(() => shutdown(0))

  try {
    await waitForHttp(url)
  } catch (err) {
    console.error('[SauceControl] server did not come up:', err)
    shutdown(1)
    return
  }

  // Opening the UI is best-effort: if no browser is available or the launch
  // fails for any reason, keep the server running and just print the URL rather
  // than tearing everything down.
  const browser = pickBrowser()
  if (browser?.app) {
    try {
      // Dedicated app window with its own profile so it behaves like a
      // standalone program. Waiting on this process gives us the natural
      // "close the window = quit the app" lifecycle.
      const profileDir = join(
        process.env.HOME || '/tmp',
        '.sauce-ctrl',
        'browser-profile',
      )
      if (!existsSync(profileDir)) mkdirSync(profileDir, { recursive: true })
      const win: Subprocess = Bun.spawn(
        [
          browser.cmd,
          `--app=${url}`,
          `--user-data-dir=${profileDir}`,
          '--no-first-run',
          '--no-default-browser-check',
          '--class=SauceControl',
        ],
        { stdout: 'inherit', stderr: 'inherit' },
      )
      await win.exited
      shutdown(0)
      return
    } catch (err) {
      console.error('[SauceControl] could not open app window:', err)
    }
  } else if (browser) {
    try {
      Bun.spawn([browser.cmd, url], { stdout: 'ignore', stderr: 'ignore' })
    } catch (err) {
      console.error('[SauceControl] could not open browser:', err)
    }
  }

  console.log(`[SauceControl] running at ${url} — close this window to quit.`)
  await server.exited
}

main()
