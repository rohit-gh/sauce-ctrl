import { defineStore } from 'pinia'

export interface CommitNode {
  hash: string
  abbrevHash: string
  parents: string[]
  author: string
  authorEmail: string
  timestamp: number
  subject: string
  body: string
  refs: string[]
}

export interface FileChange {
  path: string
  origPath?: string
  index: string
  workingTree: string
  staged: boolean
  unstaged: boolean
  untracked: boolean
}

export interface RepoStatus {
  branch: string
  upstream: string | null
  ahead: number
  behind: number
  staged: FileChange[]
  unstaged: FileChange[]
  untracked: FileChange[]
}

export interface BranchInfo {
  name: string
  isRemote: boolean
  isCurrent: boolean
  upstream: string | null
  hash: string
}

export interface CommitDetail extends CommitNode {
  files: { path: string; additions: number; deletions: number; status: string }[]
  stat: { filesChanged: number; additions: number; deletions: number }
}

export const WIP = '__WIP__'

export interface DiffViewState {
  file: string
  staged?: boolean
  hash?: string
}

export interface StashEntry {
  index: number
  ref: string
  branch: string
  message: string
}

export const useRepoStore = defineStore('repo', {
  state: () => ({
    path: '' as string,
    commits: [] as CommitNode[],
    branches: [] as BranchInfo[],
    status: null as RepoStatus | null,
    selectedHash: null as string | null,
    commitDetail: null as CommitDetail | null,
    diffView: null as DiffViewState | null,
    diffContent: '' as string,
    diffLoading: false,
    remoteBusy: '' as string,
    stashes: [] as StashEntry[],
    loading: false,
    error: '' as string,
  }),
  getters: {
    hasChanges(state): boolean {
      const s = state.status
      if (!s) return false
      return s.staged.length + s.unstaged.length + s.untracked.length > 0
    },
    unstagedFiles(state): FileChange[] {
      if (!state.status) return []
      const map = new Map<string, FileChange>()
      for (const f of [...state.status.unstaged, ...state.status.untracked]) map.set(f.path, f)
      return [...map.values()]
    },
  },
  actions: {
    async load(path: string) {
      if (!path) {
        this.$reset()
        return
      }
      this.path = path
      this.loading = true
      this.error = ''
      try {
        const [commits, branches, status, stashes] = await Promise.all([
          $fetch<CommitNode[]>('/api/git/log', { query: { path } }),
          $fetch<BranchInfo[]>('/api/git/branches', { query: { path } }),
          $fetch<RepoStatus>('/api/git/status', { query: { path } }),
          $fetch<StashEntry[]>('/api/git/stash/list', { query: { path } }),
        ])
        // Another tab was activated while this loaded — its data wins.
        if (this.path !== path) return
        this.commits = commits
        this.branches = branches
        this.status = status
        this.stashes = stashes
      } catch (err: any) {
        if (this.path === path) this.error = err?.data?.statusMessage || err?.message || 'Failed to load repository'
      } finally {
        if (this.path === path) this.loading = false
      }
    },
    async refreshStatus() {
      if (!this.path) return
      const path = this.path
      const status = await $fetch<RepoStatus>('/api/git/status', { query: { path } })
      if (this.path === path) this.status = status
    },
    async selectCommit(hash: string) {
      this.closeDiff()
      this.selectedHash = hash
      if (hash === WIP) {
        this.commitDetail = null
        return
      }
      this.commitDetail = await $fetch<CommitDetail>('/api/git/commit', {
        query: { path: this.path, hash },
      })
    },
    async stage(files: string[]) {
      this.status = await $fetch<RepoStatus>('/api/git/stage', {
        method: 'POST',
        body: { path: this.path, files },
      })
    },
    async stageAll() {
      this.status = await $fetch<RepoStatus>('/api/git/stage', {
        method: 'POST',
        body: { path: this.path, all: true },
      })
    },
    async unstage(files: string[]) {
      this.status = await $fetch<RepoStatus>('/api/git/unstage', {
        method: 'POST',
        body: { path: this.path, files },
      })
    },
    async discard(files: string[]) {
      await $fetch<RepoStatus>('/api/git/discard', {
        method: 'POST',
        body: { path: this.path, files },
      })
      await this.load(this.path)
    },
    async discardAll() {
      await $fetch<RepoStatus>('/api/git/discard', {
        method: 'POST',
        body: { path: this.path, all: true },
      })
      await this.load(this.path)
    },
    async commit(message: string) {
      const res = await $fetch<{ status: RepoStatus }>('/api/git/commit', {
        method: 'POST',
        body: { path: this.path, message },
      })
      this.status = res.status
      await this.load(this.path)
    },
    async checkout(branch: string) {
      await $fetch('/api/git/checkout', {
        method: 'POST',
        body: { path: this.path, branch },
      })
      await this.load(this.path)
    },
    async loadDiff(file: string, opts: { staged?: boolean; hash?: string } = {}) {
      if (!this.path) return
      this.diffView = { file, ...opts }
      this.diffLoading = true
      this.diffContent = ''
      try {
        const query: Record<string, string> = { path: this.path, file }
        if (opts.hash) query.hash = opts.hash
        else if (opts.staged) query.staged = 'true'
        const res = await $fetch<{ diff: string }>('/api/git/diff', { query })
        this.diffContent = res.diff
      } catch (err: any) {
        this.diffContent = ''
        alertError(err, 'Failed to load diff')
      } finally {
        this.diffLoading = false
      }
    },
    closeDiff() {
      this.diffView = null
      this.diffContent = ''
    },
    async fetchRemote() {
      if (!this.path || this.remoteBusy) return
      this.remoteBusy = 'fetch'
      try {
        const res = await $fetch<{ status: RepoStatus }>('/api/git/fetch', {
          method: 'POST',
          body: { path: this.path },
        })
        this.status = res.status
        await this.load(this.path)
      } catch (err: any) {
        alertError(err, 'Fetch failed')
      } finally {
        this.remoteBusy = ''
      }
    },
    async pullRemote() {
      if (!this.path || this.remoteBusy) return
      this.remoteBusy = 'pull'
      try {
        const res = await $fetch<{ status: RepoStatus }>('/api/git/pull', {
          method: 'POST',
          body: { path: this.path },
        })
        this.status = res.status
        await this.load(this.path)
      } catch (err: any) {
        alertError(err, 'Pull failed')
      } finally {
        this.remoteBusy = ''
      }
    },
    async pushRemote() {
      if (!this.path || this.remoteBusy) return
      this.remoteBusy = 'push'
      try {
        const res = await $fetch<{ status: RepoStatus }>('/api/git/push', {
          method: 'POST',
          body: { path: this.path },
        })
        this.status = res.status
        await this.refreshStatus()
      } catch (err: any) {
        const info = err?.data?.data
        if (info?.reason === 'unsupported-remote') {
          useUiStore().unsupportedRemote = { remote: info.remote, url: info.url }
        } else {
          alertError(err, 'Push failed')
        }
      } finally {
        this.remoteBusy = ''
      }
    },
    async resetCommit(hash: string, mode: 'soft' | 'mixed' | 'hard') {
      const res = await $fetch<{ status: RepoStatus }>('/api/git/reset', {
        method: 'POST',
        body: { path: this.path, hash, mode },
      })
      this.status = res.status
      await this.load(this.path)
    },
    async cherryPickCommit(hash: string) {
      const res = await $fetch<{ status: RepoStatus }>('/api/git/cherry-pick', {
        method: 'POST',
        body: { path: this.path, hash },
      })
      this.status = res.status
      await this.load(this.path)
    },
    async createBranchAtCommit(name: string, startPoint: string, checkout = true) {
      await $fetch('/api/git/branch', {
        method: 'POST',
        body: { path: this.path, name, startPoint, checkout },
      })
      await this.load(this.path)
    },
    async createBranchFromCurrent(name: string, stash: boolean) {
      const res = await $fetch<{ stashed: boolean }>('/api/git/branch-from-current', {
        method: 'POST',
        body: { path: this.path, name, stash },
      })
      await this.load(this.path)
      return res
    },
    async loadStashes() {
      if (!this.path) {
        this.stashes = []
        return
      }
      this.stashes = await $fetch<StashEntry[]>('/api/git/stash/list', {
        query: { path: this.path },
      })
    },
    async stashChanges(message?: string) {
      await $fetch('/api/git/stash/push', {
        method: 'POST',
        body: { path: this.path, message },
      })
      await this.load(this.path)
      await this.loadStashes()
    },
    async stashPop(index: number) {
      await $fetch('/api/git/stash/pop', {
        method: 'POST',
        body: { path: this.path, index },
      })
      await this.load(this.path)
      await this.loadStashes()
    },
    async stashDrop(index: number) {
      await $fetch('/api/git/stash/drop', {
        method: 'POST',
        body: { path: this.path, index },
      })
      await this.loadStashes()
    },
  },
})
