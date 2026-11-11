import { defineStore } from 'pinia'

/** Resizable panel limits (px). */
export const PANEL = {
  sidebar: { min: 200, max: 480, default: 256 },
  detail: { min: 300, max: 760, default: 420 },
} as const
const LAYOUT_KEY = 'sauce-ctrl:layout'

function readLayout(): { sidebar?: number; detail?: number } {
  if (!import.meta.client) return {}
  try {
    return JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}') || {}
  } catch {
    return {}
  }
}
const clamp = (v: unknown, lim: { min: number; max: number; default: number }) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(lim.max, Math.max(lim.min, v))) : lim.default

export const useUiStore = defineStore('ui', {
  state: () => ({
    terminalOpen: false,
    ghSetupOpen: false,
    ghCloneOpen: false,
    settingsOpen: false,
    pwaInstallOpen: false,
    repoDiscoveryOpen: false,
    /** When set, the discovery modal scans only inside this folder. */
    repoDiscoveryRoot: null as string | null,
    unsupportedRemote: null as { remote: string; url: string } | null,
    sidebarWidth: clamp(readLayout().sidebar, PANEL.sidebar),
    detailWidth: clamp(readLayout().detail, PANEL.detail),
  }),
  actions: {
    toggleTerminal() {
      this.terminalOpen = !this.terminalOpen
    },
    openTerminal() {
      this.terminalOpen = true
    },
    setPanelWidth(panel: 'sidebar' | 'detail', px: number) {
      if (panel === 'sidebar') this.sidebarWidth = clamp(px, PANEL.sidebar)
      else this.detailWidth = clamp(px, PANEL.detail)
      if (import.meta.client) {
        try {
          localStorage.setItem(LAYOUT_KEY, JSON.stringify({ sidebar: this.sidebarWidth, detail: this.detailWidth }))
        } catch {
          // ignore — width just won't persist
        }
      }
    },
    openRepoDiscovery(root: string | null = null) {
      this.settingsOpen = false
      this.repoDiscoveryRoot = root
      this.repoDiscoveryOpen = true
    },
  },
})
