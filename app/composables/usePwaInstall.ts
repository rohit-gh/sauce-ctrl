import { computed, onMounted, onBeforeUnmount, ref } from 'vue'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  prompt: () => Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type BrowserFamily = 'chromium' | 'safari' | 'firefox' | 'other'
export type ServerState = 'checking' | 'nitro' | 'static' | 'offline'

// Module-level singletons so every caller shares the same install state.
const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null)
const installed = ref(false)
let listenersBound = false

function detectInstalled(): boolean {
  if (!import.meta.client) return false
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches
  // iOS Safari exposes navigator.standalone instead of display-mode.
  const iosStandalone = (window.navigator as any).standalone === true
  return Boolean(standalone || iosStandalone)
}

function detectBrowser(): BrowserFamily {
  if (!import.meta.client) return 'other'
  const ua = navigator.userAgent
  if (/Firefox\//.test(ua)) return 'firefox'
  // Chromium-based (Chrome, Edge, Brave, Opera) support beforeinstallprompt.
  if (/Edg\/|Chrome\/|Chromium\/|OPR\//.test(ua) && !/OPT\//.test(ua)) return 'chromium'
  if (/Safari\//.test(ua) && /AppleWebKit\//.test(ua)) return 'safari'
  return 'other'
}

/**
 * Wraps the browser install lifecycle for the SauceControl PWA:
 * - captures `beforeinstallprompt` so we can offer a one-click install button,
 * - tracks whether the app is already running standalone,
 * - checks that the API (Nitro) is actually reachable, since installing while
 *   viewing the static-only build would leave the app without a backend.
 */
export function usePwaInstall() {
  const browser = ref<BrowserFamily>('other')
  const server = ref<ServerState>('checking')

  const canInstall = computed(() => !!deferredPrompt.value && !installed.value)
  const supportsAutoPrompt = computed(() => browser.value === 'chromium')

  function onBeforeInstallPrompt(e: Event) {
    e.preventDefault()
    deferredPrompt.value = e as BeforeInstallPromptEvent
  }
  function onInstalled() {
    installed.value = true
    deferredPrompt.value = null
  }

  async function install(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    const evt = deferredPrompt.value
    if (!evt) return 'unavailable'
    await evt.prompt()
    const choice = await evt.userChoice
    if (choice.outcome === 'accepted') installed.value = true
    deferredPrompt.value = null
    return choice.outcome
  }

  // Confirm the backend is present. A 404 means we're on the static export
  // (e.g. `serve .output/public`) with no API — the app won't function.
  async function checkServer() {
    server.value = 'checking'
    try {
      const res = await fetch('/api/git/env', { headers: { accept: 'application/json' } })
      server.value = res.ok ? 'nitro' : 'static'
    } catch {
      server.value = 'offline'
    }
  }

  onMounted(() => {
    browser.value = detectBrowser()
    installed.value = detectInstalled()
    if (!listenersBound) {
      window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.addEventListener('appinstalled', onInstalled)
      listenersBound = true
    }
    checkServer()
  })

  onBeforeUnmount(() => {
    if (listenersBound) {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
      listenersBound = false
    }
  })

  return { canInstall, supportsAutoPrompt, installed, browser, server, install, checkServer }
}
