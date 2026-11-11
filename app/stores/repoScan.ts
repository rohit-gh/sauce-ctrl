import { defineStore } from 'pinia'

export type ScanPhase = 'common' | 'home' | 'system' | 'folder'

export interface FoundRepo {
  path: string
  name: string
  lastActivity: number | null
  phase: ScanPhase
}

export interface ScanStatus {
  running: boolean
  scope: 'computer' | 'folder'
  roots: string[]
  phase: ScanPhase | null
  phases: ScanPhase[]
  scannedDirs: number
  currentDir: string | null
  found: FoundRepo[]
  startedAt: number | null
  finishedAt: number | null
  cancelled: boolean
  /** Folders the OS refused to list (macOS privacy protection). */
  blocked: string[]
  home: string
}

export const PHASE_LABELS: Record<ScanPhase, string> = {
  common: 'Common folders',
  home: 'Rest of home',
  system: 'Other drives',
  folder: 'Selected folder',
}

const POLL_MS = 500

/**
 * Repository discovery scan, run on the server and polled for progress.
 * `scope` says which kind of scan is shown: the whole computer (Settings,
 * "Find repos…") or a single folder (picked folder that wasn't a repo).
 */
export const useRepoScanStore = defineStore('repoScan', {
  state: () => ({
    status: null as ScanStatus | null,
    scope: 'computer' as ScanStatus['scope'],
    error: '',
    polling: false,
  }),
  getters: {
    running: (s) => !!s.status?.running,
  },
  actions: {
    /** Fetch status for the current scope; drops the reply if the scope changed meanwhile. */
    async fetchStatus() {
      const scope = this.scope
      const status = await $fetch<ScanStatus>('/api/system/scan-repos', { query: { scope } })
      if (scope === this.scope) this.status = status
    },
    async refresh(scope: ScanStatus['scope'] = 'computer') {
      if (scope !== this.scope) {
        this.scope = scope
        this.status = null
      }
      try {
        await this.fetchStatus()
        this.error = ''
      } catch (err: any) {
        this.error = err?.data?.statusMessage || err?.message || 'Could not read scan status'
      }
      if (this.status?.running) this.poll()
    },
    async start(roots?: string[]) {
      this.error = ''
      this.scope = roots?.length ? 'folder' : 'computer'
      this.status = null
      try {
        this.status = await $fetch<ScanStatus>('/api/system/scan-repos', {
          method: 'POST',
          body: { roots },
        })
        this.poll()
      } catch (err: any) {
        this.error = err?.data?.statusMessage || err?.message || 'Could not start scan'
      }
    },
    async cancel() {
      try {
        await $fetch('/api/system/scan-repos', { method: 'DELETE' })
        await this.fetchStatus()
      } catch {
        // The next poll will pick up the real state.
      }
    },
    /** Poll until the server reports the scan finished. Safe to call repeatedly. */
    async poll() {
      if (this.polling) return
      this.polling = true
      try {
        while (true) {
          await new Promise((r) => setTimeout(r, POLL_MS))
          try {
            await this.fetchStatus()
          } catch {
            // transient — keep polling
          }
          if (!this.status?.running) break
        }
      } finally {
        this.polling = false
      }
    },
  },
})
