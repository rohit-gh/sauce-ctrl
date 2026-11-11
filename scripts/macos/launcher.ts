/**
 * SauceCtrl macOS .app launcher (runs under the bundled Bun runtime).
 *
 * Same lifecycle as the AppImage launcher:
 *   1. Pick free TCP ports for Nitro HTTP + terminal WS.
 *   2. Start the Nitro server.
 *   3. Open a Chromium `--app` window when possible (else default browser).
 *   4. Closing the app window (or server) shuts everything down.
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

async function getScreenSize(): Promise<{ width: number; height: number }> {
  const fallback = { width: 1440, height: 900 }
  try {
    const proc = Bun.spawn(
      ['osascript', '-e', 'tell application "Finder" to get bounds of window of desktop'],
      { stdout: 'pipe', stderr: 'ignore' },
    )
    const out = (await new Response(proc.stdout).text()).trim()
    await proc.exited
    // "0, 0, 1512, 982"
    const parts = out.split(',').map((s) => Number(s.trim()))
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      const width = Math.max(800, parts[2]! - parts[0]!)
      const height = Math.max(600, parts[3]! - parts[1]!)
      return { width, height }
    }
  } catch {}
  return fallback
}

/** Prefer a Chromium-family binary so we can use chromeless `--app` mode. */
function pickChromium(): string | null {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Arc.app/Contents/MacOS/Arc',
    '/Applications/Vivaldi.app/Contents/MacOS/Vivaldi',
  ]
  for (const path of candidates) {
    if (existsSync(path)) return path
  }
  for (const cmd of ['google-chrome', 'chromium', 'brave-browser', 'microsoft-edge']) {
    const found = Bun.which(cmd)
    if (found) return found
  }
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
    SAUCE_WS_PORT: String(wsPort),
    NUXT_PUBLIC_WS_PORT: String(wsPort),
    // Tells the UI it's already the desktop app (hides "Install as an app").
    NUXT_PUBLIC_DESKTOP_APP: 'true',
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
    console.error('[SauceCtrl] server did not come up:', err)
    shutdown(1)
    return
  }

  const chromium = pickChromium()
  if (chromium) {
    try {
      const profileDir = join(
        process.env.HOME || '/tmp',
        '.sauce-ctrl',
        'browser-profile',
      )
      if (!existsSync(profileDir)) mkdirSync(profileDir, { recursive: true })
      const { width, height } = await getScreenSize()
      const win: Subprocess = Bun.spawn(
        [
          chromium,
          `--app=${url}`,
          `--user-data-dir=${profileDir}`,
          '--no-first-run',
          '--no-default-browser-check',
          '--start-maximized',
          '--window-position=0,0',
          `--window-size=${width},${height}`,
        ],
        { stdout: 'inherit', stderr: 'inherit' },
      )
      await win.exited
      shutdown(0)
      return
    } catch (err) {
      console.error('[SauceCtrl] could not open app window:', err)
    }
  }

  // Fallback: system default browser via `open` (process exits immediately).
  try {
    Bun.spawn(['open', url], { stdout: 'ignore', stderr: 'ignore' })
  } catch (err) {
    console.error('[SauceCtrl] could not open browser:', err)
  }

  console.log(`[SauceCtrl] running at ${url} — close this window to quit.`)
  await server.exited
}

main()
