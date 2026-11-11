<script setup lang="ts">
import { PHASE_LABELS, type FoundRepo } from '~/stores/repoScan'

const ui = useUiStore()
const projects = useProjectsStore()
const scan = useRepoScanStore()

const RECENT_MS = 30 * 86400000

const root = computed(() => ui.repoDiscoveryRoot)
const search = ref('')
const filter = ref<'all' | 'new' | 'added'>('all')
const view = ref<'folder' | 'recent'>('folder')
const applying = ref(false)
const message = ref('')
const failures = ref<{ path: string; error: string }[]>([])

/** Pending changes: path → desired "in sidebar" state, only where it differs. */
const overrides = ref<Record<string, boolean>>({})

const status = computed(() => scan.status)
const home = computed(() => status.value?.home || '')

/**
 * Results to show. In computer mode, a leftover folder-only scan isn't shown —
 * the user asked about the whole machine.
 */
const relevant = computed(() => {
  const s = status.value
  if (!s) return false
  if (root.value) return s.scope === 'folder'
  return s.scope === 'computer'
})
// A folder scan starts as soon as the modal opens, so it never shows the intro.
const hasScanned = computed(
  () => !!root.value || (relevant.value && (!!status.value?.running || !!status.value?.finishedAt)),
)
/** True while results are still coming in (or the folder scan hasn't reported yet). */
const scanning = computed(() => !relevant.value || !!status.value?.running)
const found = computed<FoundRepo[]>(() => (relevant.value ? status.value?.found ?? [] : []))
const scannedDirs = computed(() => (relevant.value ? status.value?.scannedDirs ?? 0 : 0))
const phases = computed(() => (relevant.value ? status.value?.phases ?? [] : []))
const currentDir = computed(() => (relevant.value ? status.value?.currentDir ?? null : null))
const blocked = computed(() => (relevant.value ? status.value?.blocked ?? [] : []))
const isMac = import.meta.client && /Mac/i.test(navigator.platform || navigator.userAgent)

const sidebarPaths = computed(() => new Set(projects.projects.map((p) => p.path)))
const inSidebar = (path: string) => sidebarPaths.value.has(path)
const checked = (path: string) => (path in overrides.value ? overrides.value[path] : inSidebar(path))

function setChecked(path: string, value: boolean) {
  const next = { ...overrides.value }
  if (value === inSidebar(path)) delete next[path]
  else next[path] = value
  overrides.value = next
}

const toAdd = computed(() => Object.keys(overrides.value).filter((p) => overrides.value[p] && !inSidebar(p)))
const toRemove = computed(() => Object.keys(overrides.value).filter((p) => !overrides.value[p] && inSidebar(p)))
const pending = computed(() => toAdd.value.length + toRemove.value.length)

const counts = computed(() => {
  const added = found.value.filter((r) => inSidebar(r.path)).length
  return { all: found.value.length, added, new: found.value.length - added }
})

const filters = computed(() => [
  { id: 'all' as const, label: 'All', count: counts.value.all },
  { id: 'new' as const, label: 'Not added', count: counts.value.new },
  { id: 'added' as const, label: 'In sidebar', count: counts.value.added },
])

const visible = computed(() => {
  const q = search.value.trim().toLowerCase()
  return found.value.filter((r) => {
    if (filter.value === 'new' && inSidebar(r.path)) return false
    if (filter.value === 'added' && !inSidebar(r.path)) return false
    if (q && !r.name.toLowerCase().includes(q) && !r.path.toLowerCase().includes(q)) return false
    return true
  })
})

function parentOf(path: string) {
  const i = path.lastIndexOf('/')
  return i > 0 ? path.slice(0, i) : '/'
}

/** Groups by parent folder, in discovery order (common folders come first). */
const groups = computed(() => {
  if (view.value === 'recent') {
    const sorted = [...visible.value].sort((a, b) => (b.lastActivity ?? 0) - (a.lastActivity ?? 0))
    return [{ key: 'recent', label: '', repos: sorted }]
  }
  const map = new Map<string, FoundRepo[]>()
  for (const r of visible.value) {
    const k = parentOf(r.path)
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(r)
  }
  return [...map.entries()].map(([key, repos]) => ({
    key,
    label: tilde(key),
    repos: repos.sort((a, b) => a.name.localeCompare(b.name)),
  }))
})

function groupState(repos: FoundRepo[]): 'all' | 'some' | 'none' {
  const n = repos.filter((r) => checked(r.path)).length
  return n === 0 ? 'none' : n === repos.length ? 'all' : 'some'
}
function toggleGroup(repos: FoundRepo[]) {
  const value = groupState(repos) !== 'all'
  for (const r of repos) setChecked(r.path, value)
}

const recentNew = computed(() =>
  found.value.filter((r) => !inSidebar(r.path) && !checked(r.path) && r.lastActivity && Date.now() - r.lastActivity < RECENT_MS),
)
function selectRecent() {
  for (const r of recentNew.value) setChecked(r.path, true)
}
function selectAllVisible() {
  for (const r of visible.value) setChecked(r.path, true)
}

function tilde(p: string) {
  return home.value && (p === home.value || p.startsWith(home.value + '/')) ? '~' + p.slice(home.value.length) : p
}

function relTime(ms: number | null) {
  if (!ms) return ''
  const diff = Date.now() - ms
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.floor(mo / 12)}y ago`
}

const phaseIndex = computed(() => {
  const s = status.value
  if (!relevant.value || !s?.phase) return 0
  return s.phases.indexOf(s.phase)
})

function startScan() {
  message.value = ''
  failures.value = []
  scan.start(root.value ? [root.value] : undefined)
}

function scanWholeComputer() {
  ui.repoDiscoveryRoot = null
  overrides.value = {}
  scan.start()
}

async function apply() {
  if (!pending.value || applying.value) return
  applying.value = true
  message.value = ''
  failures.value = []
  try {
    const adding = toAdd.value
    const removing = projects.projects.filter((p) => toRemove.value.includes(p.path)).map((p) => p.id)
    let added = 0
    if (adding.length) {
      const res = await projects.addMany(adding)
      added = res.added.length
      failures.value = res.failed
    }
    if (removing.length) await projects.removeMany(removing)
    overrides.value = {}
    const parts = []
    if (added) parts.push(`Added ${added} ${added === 1 ? 'repository' : 'repositories'}`)
    if (removing.length) parts.push(`removed ${removing.length}`)
    message.value = parts.length ? `${parts.join(', ')}.` : ''
  } catch (err: any) {
    message.value = err?.data?.statusMessage || err?.message || 'Could not update the sidebar'
  } finally {
    applying.value = false
  }
}

async function close() {
  if (
    pending.value &&
    !(await appConfirm('You have ticked or unticked repositories without updating the sidebar.', {
      title: 'Discard changes?',
      confirmLabel: 'Discard',
      danger: true,
    }))
  )
    return
  ui.repoDiscoveryOpen = false
  ui.repoDiscoveryRoot = null
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

onMounted(async () => {
  document.addEventListener('keydown', onKey)
  if (root.value) {
    // Picked a folder that isn't a repo — look inside it right away.
    scan.start([root.value])
  } else {
    await scan.refresh('computer')
  }
})
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" @click.self="close">
    <div class="flex h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-ink-700 bg-ink-900 shadow-2xl">
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-ink-800 px-5 py-4">
        <div class="min-w-0">
          <h2 class="text-base font-semibold text-white">Find repositories</h2>
          <p v-if="root" class="truncate text-[11px] text-slate-500">
            <span class="font-mono">{{ tilde(root) }}</span> isn't a repository itself — here's what's inside it.
          </p>
          <p v-else class="text-[11px] text-slate-500">
            Choose which repositories on this computer appear in the sidebar.
          </p>
        </div>
        <button class="text-slate-500 hover:text-white" title="Close (Esc)" @click="close">✕</button>
      </div>

      <!-- First run: explain what the scan does -->
      <div v-if="!hasScanned" class="flex flex-1 flex-col items-center justify-center gap-5 overflow-y-auto p-8 text-center">
        <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-2xl text-accent-strong" aria-hidden="true">⌕</div>
        <div>
          <h3 class="text-lg font-semibold text-white">Find the repositories already on your computer</h3>
          <p class="mx-auto mt-1 max-w-md text-sm text-slate-400">
            SauceCtrl looks for folders containing <span class="font-mono">.git</span>, then you pick
            which ones to show in the sidebar.
          </p>
        </div>
        <ol class="w-full max-w-md space-y-2 text-left">
          <li class="flex gap-3 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2">
            <span class="text-accent">1</span>
            <span class="text-[12px] text-slate-300">
              <b class="text-slate-100">Common folders first</b> — Documents, Desktop, Downloads, Developer,
              Projects, Code… so most results show up within seconds.
            </span>
          </li>
          <li class="flex gap-3 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2">
            <span class="text-accent">2</span>
            <span class="text-[12px] text-slate-300"><b class="text-slate-100">The rest of your home folder</b></span>
          </li>
          <li class="flex gap-3 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2">
            <span class="text-accent">3</span>
            <span class="text-[12px] text-slate-300">
              <b class="text-slate-100">Other drives and locations</b> — external volumes, /opt, and so on.
            </span>
          </li>
        </ol>
        <p class="max-w-md text-[11px] text-slate-500">
          System folders, app data, hidden folders and <span class="font-mono">node_modules</span> are skipped.
          Everything stays on this computer. Your OS may ask permission to read some folders.
        </p>
        <button class="btn-primary px-5 py-2" @click="startScan">Scan this computer</button>
        <p v-if="scan.error" class="text-xs text-red-400">{{ scan.error }}</p>
      </div>

      <template v-else>
        <!-- Scan progress / summary -->
        <div class="border-b border-ink-800 px-5 py-3">
          <div v-if="scanning" class="flex items-center gap-3">
            <span class="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-200">
                <span>
                  Found <b class="text-white">{{ found.length }}</b>
                  {{ found.length === 1 ? 'repository' : 'repositories' }}
                </span>
                <span class="text-[11px] text-slate-500">{{ scannedDirs.toLocaleString() }} folders checked</span>
              </div>
              <div v-if="phases.length > 1" class="mt-1.5 flex items-center gap-1.5">
                <template v-for="(p, i) in phases" :key="p">
                  <span
                    class="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    :class="
                      i < phaseIndex
                        ? 'bg-green-500/15 text-green-400'
                        : i === phaseIndex
                          ? 'bg-accent/20 text-accent-strong'
                          : 'bg-ink-800 text-slate-500'
                    "
                  >
                    {{ i < phaseIndex ? '✓ ' : '' }}{{ PHASE_LABELS[p] }}
                  </span>
                  <span v-if="i < phases.length - 1" class="text-[10px] text-slate-600">→</span>
                </template>
              </div>
              <div class="mt-1 truncate font-mono text-[11px] text-slate-500" :title="currentDir || ''">
                {{ currentDir ? tilde(currentDir) : '' }}
              </div>
            </div>
            <button class="btn-subtle shrink-0" @click="scan.cancel()">Stop</button>
          </div>

          <div v-else class="flex flex-wrap items-center gap-3">
            <div class="min-w-0 flex-1 text-sm text-slate-300">
              <b class="text-white">{{ found.length }}</b> {{ found.length === 1 ? 'repository' : 'repositories' }} found
              <span class="text-[11px] text-slate-500">
                · {{ scannedDirs.toLocaleString() }} folders checked
                <template v-if="status?.cancelled"> · stopped early</template>
                <template v-else-if="status?.finishedAt"> · {{ relTime(status.finishedAt) }}</template>
              </span>
            </div>
            <button v-if="root" class="btn-ghost shrink-0" @click="scanWholeComputer">Scan whole computer</button>
            <button class="btn-subtle shrink-0" @click="startScan">↻ Rescan</button>
          </div>
        </div>

        <!-- Toolbar -->
        <div class="flex flex-wrap items-center gap-2 border-b border-ink-800 px-5 py-2.5">
          <input v-model="search" class="input !w-auto min-w-0 flex-1" placeholder="Filter by name or path…" />
          <div class="flex overflow-hidden rounded-md border border-ink-700 text-[12px]">
            <button
              v-for="f in filters"
              :key="f.id"
              class="px-2.5 py-1.5 transition-colors"
              :class="filter === f.id ? 'bg-ink-700 text-white' : 'text-slate-400 hover:bg-ink-800'"
              @click="filter = f.id"
            >
              {{ f.label }} <span class="text-slate-500">{{ f.count }}</span>
            </button>
          </div>
          <div class="flex overflow-hidden rounded-md border border-ink-700 text-[12px]">
            <button
              class="px-2.5 py-1.5"
              :class="view === 'folder' ? 'bg-ink-700 text-white' : 'text-slate-400 hover:bg-ink-800'"
              title="Group by parent folder"
              @click="view = 'folder'"
            >
              By folder
            </button>
            <button
              class="px-2.5 py-1.5"
              :class="view === 'recent' ? 'bg-ink-700 text-white' : 'text-slate-400 hover:bg-ink-800'"
              title="Most recently used first"
              @click="view = 'recent'"
            >
              Recent
            </button>
          </div>
        </div>

        <!-- Folders the OS wouldn't let us read (e.g. "Don't Allow" on a macOS prompt) -->
        <details v-if="blocked.length" class="border-b border-ink-800 bg-amber-500/5 px-5 py-2 text-[12px] text-amber-200">
          <summary class="cursor-pointer select-none">
            {{ blocked.length === 1 ? "1 folder couldn't be searched" : `${blocked.length} folders couldn't be searched` }}
            because access was denied.
          </summary>
          <p v-if="isMac" class="mt-1 text-slate-400">
            Open <b class="text-slate-200">System Settings → Privacy &amp; Security → Files and Folders</b>, turn on
            the folders for SauceCtrl, then click Rescan.
          </p>
          <p v-else class="mt-1 text-slate-400">Check the folder permissions, then click Rescan.</p>
          <ul class="mt-1 max-h-24 overflow-y-auto font-mono text-[11px] text-slate-500">
            <li v-for="b in blocked" :key="b" class="truncate">{{ tilde(b) }}</li>
          </ul>
        </details>

        <!-- Suggestion -->
        <div
          v-if="recentNew.length && !scanning"
          class="flex items-center gap-3 border-b border-ink-800 bg-accent/5 px-5 py-2 text-[12px] text-slate-300"
        >
          <span class="flex-1">
            {{ recentNew.length }} {{ recentNew.length === 1 ? 'repository you worked on' : 'repositories you worked on' }}
            in the last 30 days {{ recentNew.length === 1 ? "isn't" : "aren't" }} in the sidebar yet.
          </span>
          <button class="btn-ghost !py-1 text-accent" @click="selectRecent">Select them</button>
        </div>

        <!-- Results -->
        <div class="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          <div v-if="!found.length" class="p-8 text-center text-sm text-slate-500">
            {{ scanning ? 'Looking for repositories…' : 'No repositories found.' }}
          </div>
          <div v-else-if="!visible.length" class="p-8 text-center text-sm text-slate-500">
            Nothing matches this filter.
          </div>

          <div v-for="g in groups" :key="g.key" class="mb-3">
            <button
              v-if="g.label"
              class="sticky top-0 z-10 flex w-full items-center gap-2 bg-ink-900 px-2 py-1.5 text-left"
              :title="groupState(g.repos) === 'all' ? 'Unselect all in this folder' : 'Select all in this folder'"
              @click="toggleGroup(g.repos)"
            >
              <span
                class="flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] leading-none"
                :class="groupState(g.repos) === 'none' ? 'border-ink-line' : 'border-accent bg-accent text-on-accent'"
              >
                {{ groupState(g.repos) === 'all' ? '✓' : groupState(g.repos) === 'some' ? '–' : '' }}
              </span>
              <span class="truncate font-mono text-[11px] text-slate-400">{{ g.label }}</span>
              <span class="shrink-0 text-[11px] text-slate-600">{{ g.repos.length }}</span>
            </button>

            <label
              v-for="r in g.repos"
              :key="r.path"
              class="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-ink-800"
              :class="g.label ? 'pl-8' : ''"
            >
              <input
                type="checkbox"
                class="h-4 w-4 shrink-0 accent-accent"
                :checked="checked(r.path)"
                @change="setChecked(r.path, ($event.target as HTMLInputElement).checked)"
              />
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="truncate text-sm font-medium text-slate-100">{{ r.name }}</span>
                  <span
                    v-if="inSidebar(r.path) && checked(r.path)"
                    class="shrink-0 rounded-full bg-ink-700 px-1.5 text-[10px] text-slate-400"
                  >in sidebar</span>
                  <span
                    v-else-if="inSidebar(r.path)"
                    class="shrink-0 rounded-full bg-red-500/15 px-1.5 text-[10px] text-red-300"
                  >will be removed</span>
                  <span
                    v-else-if="checked(r.path)"
                    class="shrink-0 rounded-full bg-accent/20 px-1.5 text-[10px] text-accent-strong"
                  >will be added</span>
                </div>
                <div v-if="view === 'recent'" class="truncate font-mono text-[11px] text-slate-500">{{ tilde(r.path) }}</div>
              </div>
              <span class="shrink-0 text-[11px] text-slate-500" :title="r.lastActivity ? new Date(r.lastActivity).toLocaleString() : ''">
                {{ relTime(r.lastActivity) }}
              </span>
            </label>
          </div>
        </div>

        <!-- Footer -->
        <div class="flex flex-wrap items-center gap-3 border-t border-ink-800 px-5 py-3">
          <div class="min-w-0 flex-1 text-[12px]">
            <span v-if="pending" class="text-slate-300">
              <template v-if="toAdd.length"><b class="text-accent">+{{ toAdd.length }}</b> to add</template>
              <template v-if="toAdd.length && toRemove.length"> · </template>
              <template v-if="toRemove.length"><b class="text-red-300">−{{ toRemove.length }}</b> to remove</template>
            </span>
            <span v-else-if="message" class="text-green-400">{{ message }}</span>
            <button v-else-if="visible.length" class="text-slate-400 hover:text-white" @click="selectAllVisible">
              Select all {{ visible.length }} shown
            </button>
            <div v-for="f in failures" :key="f.path" class="truncate text-red-400" :title="f.error">
              {{ tilde(f.path) }}: {{ f.error }}
            </div>
          </div>
          <button v-if="pending" class="btn-ghost" :disabled="applying" @click="overrides = {}">Reset</button>
          <button v-if="pending" class="btn-primary" :disabled="applying" @click="apply">
            {{ applying ? 'Updating…' : 'Update sidebar' }}
          </button>
          <button v-else class="btn-primary" @click="close">Done</button>
        </div>
      </template>
    </div>
  </div>
</template>
