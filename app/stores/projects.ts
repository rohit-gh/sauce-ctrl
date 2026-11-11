import { defineStore } from 'pinia'

export interface Project {
  id: string
  name: string
  path: string
  added_at: number
  last_opened: number | null
  /** Set when pinned; pinned projects sort first, in pin order. */
  pinned_at?: number | null
  branch?: string | null
  exists?: boolean
}

const TABS_KEY = 'sauce-ctrl:tabs'

interface SavedTabs {
  open: string[]
  active: string | null
}

function readTabs(): SavedTabs | null {
  if (!import.meta.client) return null
  try {
    const raw = localStorage.getItem(TABS_KEY)
    if (!raw) return null
    const v = JSON.parse(raw)
    return Array.isArray(v?.open) ? { open: v.open.filter((x: unknown) => typeof x === 'string'), active: v.active ?? null } : null
  } catch {
    return null
  }
}

/**
 * Sidebar projects + the open repository tabs.
 * `openIds` are the tabs (in order); `selectedId` is the active tab.
 * Clicking a project in the sidebar opens (or re-opens) its tab.
 */
export const useProjectsStore = defineStore('projects', {
  state: () => ({
    projects: [] as Project[],
    openIds: [] as string[],
    selectedId: null as string | null,
    restored: false,
    loading: false,
    error: '' as string,
  }),
  getters: {
    selected(state): Project | null {
      return state.projects.find((p) => p.id === state.selectedId) ?? null
    },
    openTabs(state): Project[] {
      return state.openIds.map((id) => state.projects.find((p) => p.id === id)).filter((p): p is Project => !!p)
    },
  },
  actions: {
    persistTabs() {
      if (!import.meta.client) return
      try {
        localStorage.setItem(TABS_KEY, JSON.stringify({ open: this.openIds, active: this.selectedId }))
      } catch {
        // storage unavailable — tabs just won't survive a restart
      }
    },
    async fetch() {
      this.loading = true
      try {
        this.projects = await $fetch<Project[]>('/api/projects')
        const exists = (id: string | null) => !!id && this.projects.some((p) => p.id === id)

        if (!this.restored) {
          this.restored = true
          const saved = readTabs()
          if (saved) {
            this.openIds = saved.open.filter(exists)
            this.selectedId = exists(saved.active) && this.openIds.includes(saved.active!) ? saved.active : this.openIds[0] ?? null
          } else if (this.projects.length) {
            // First run: open the most recent project.
            this.openIds = [this.projects[0].id]
            this.selectedId = this.projects[0].id
          }
        }

        // Drop tabs whose project is gone (hidden here or elsewhere).
        const before = this.openIds
        this.openIds = before.filter(exists)
        if (this.selectedId && !this.openIds.includes(this.selectedId)) {
          const i = before.indexOf(this.selectedId)
          this.selectedId = this.openIds[Math.min(Math.max(i, 0), this.openIds.length - 1)] ?? null
        }
        this.persistTabs()
      } finally {
        this.loading = false
      }
    },
    async add(path: string) {
      this.error = ''
      try {
        const project = await $fetch<Project>('/api/projects', {
          method: 'POST',
          body: { path },
        })
        await this.fetch()
        this.select(project.id)
        return project
      } catch (err: any) {
        this.error = err?.data?.statusMessage || err?.message || 'Failed to add project'
        throw err
      }
    },
    /**
     * Pick a folder with the native dialog and add it. If the folder isn't a
     * repository itself, open repository discovery scoped to that folder.
     */
    async addFromPicker() {
      this.error = ''
      const res = await $fetch<{ path: string | null }>('/api/system/pick-folder')
      if (!res.path) return
      try {
        await this.add(res.path)
      } catch (err: any) {
        if (err?.data?.data?.code === 'NOT_A_REPO') {
          this.error = ''
          useUiStore().openRepoDiscovery(res.path)
          return
        }
        throw err
      }
    },
    /** Add many repositories at once; keeps the current tab if one is open. */
    async addMany(paths: string[]) {
      this.error = ''
      const res = await $fetch<{ added: Project[]; failed: { path: string; error: string }[] }>(
        '/api/projects/bulk',
        { method: 'POST', body: { paths } },
      )
      await this.fetch()
      if (!this.selectedId && res.added.length) this.select(res.added[0].id)
      return res
    },
    async cloneFromGithub(nameWithOwner: string, parentDir: string) {
      this.error = ''
      const project = await $fetch<Project>('/api/gh/clone', {
        method: 'POST',
        body: { nameWithOwner, parentDir },
      })
      await this.fetch()
      this.select(project.id)
      return project
    },
    /** Hide a project from the sidebar (closes its tab). */
    async remove(id: string) {
      await $fetch(`/api/projects/${id}`, { method: 'DELETE' })
      this.closeTab(id)
      await this.fetch()
    },
    async removeMany(ids: string[]) {
      await Promise.all(ids.map((id) => $fetch(`/api/projects/${id}`, { method: 'DELETE' })))
      for (const id of ids) this.closeTab(id)
      await this.fetch()
    },
    /** Pin a project to the top of the sidebar, or unpin it. */
    async setPinned(id: string, pinned: boolean) {
      await $fetch(`/api/projects/${id}`, { method: 'PATCH', body: { pinned } })
      await this.fetch()
    },
    /** Open (or re-open) a project's tab and make it active. */
    select(id: string) {
      if (!this.projects.some((p) => p.id === id)) return
      if (!this.openIds.includes(id)) this.openIds = [...this.openIds, id]
      this.selectedId = id
      this.persistTabs()
    },
    /** Close a tab; the neighbour to its right (else left) becomes active. */
    closeTab(id: string) {
      const i = this.openIds.indexOf(id)
      if (i < 0) return
      this.openIds = this.openIds.filter((x) => x !== id)
      if (this.selectedId === id) this.selectedId = this.openIds[i] ?? this.openIds[i - 1] ?? null
      this.persistTabs()
    },
    moveTab(id: string, toIndex: number) {
      const from = this.openIds.indexOf(id)
      if (from < 0) return
      const next = this.openIds.filter((x) => x !== id)
      next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, id)
      this.openIds = next
      this.persistTabs()
    },
  },
})
