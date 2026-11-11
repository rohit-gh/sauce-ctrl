<script setup lang="ts">
import type { Project } from '~/stores/projects'

const projects = useProjectsStore()
const ui = useUiStore()
const scan = useRepoScanStore()

const menuOpen = ref(false)
const addingLocal = ref(false)

// Filter the project list by name, path or branch.
const query = ref('')
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return projects.projects
  return projects.projects.filter(
    (p) => p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q) || (p.branch ?? '').toLowerCase().includes(q),
  )
})
function onSearchKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && query.value) {
    e.stopPropagation()
    query.value = ''
  } else if (e.key === 'Enter' && filtered.value.length) {
    // Enter opens the first match.
    projects.select(filtered.value[0].id)
  }
}

function openCloneFromGithub() {
  menuOpen.value = false
  ui.ghCloneOpen = true
}

// Browse for a folder with the native picker and add it directly. Picking a
// folder that only *contains* repos opens discovery scoped to that folder.
async function openAddLocal() {
  menuOpen.value = false
  if (addingLocal.value) return
  addingLocal.value = true
  try {
    await projects.addFromPicker()
  } catch (err: any) {
    if (!projects.error) {
      projects.error = err?.data?.statusMessage || err?.message || 'Could not add folder'
    }
  } finally {
    addingLocal.value = false
  }
}

function openDiscovery() {
  menuOpen.value = false
  ui.openRepoDiscovery()
}

// Hiding only removes the repo from SauceCtrl's list — nothing on disk changes.
async function hide(p: Project) {
  const ok = await appConfirm(
    `"${p.name}" will be removed from the sidebar. The repository and its files stay on disk, and you can add it back any time.`,
    { title: 'Hide this repository?', confirmLabel: 'Hide' },
  )
  if (ok) await projects.remove(p.id)
}

const pinning = ref<string | null>(null)
async function togglePin(p: Project) {
  if (pinning.value) return
  pinning.value = p.id
  try {
    await projects.setPinned(p.id, !p.pinned_at)
  } catch (err) {
    alertError(err, 'Could not update pin')
  } finally {
    pinning.value = null
  }
}
// Index of the first unpinned project in the visible list (for the divider).
const firstUnpinned = computed(() => {
  const list = filtered.value
  const i = list.findIndex((p) => !p.pinned_at)
  return i > 0 ? i : -1
})

function closeMenu(e: MouseEvent) {
  if (!(e.target as HTMLElement).closest('[data-add-menu]')) menuOpen.value = false
}
onMounted(() => document.addEventListener('click', closeMenu))
onBeforeUnmount(() => document.removeEventListener('click', closeMenu))

function initials(name: string) {
  return name.slice(0, 2).toUpperCase()
}
</script>

<template>
  <aside class="flex h-full shrink-0 flex-col bg-ink-900" aria-label="Repositories">
    <div class="flex items-center gap-2 px-4 py-4">
      <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-soft text-sm font-bold text-on-accent">
        S
      </div>
      <div>
        <div class="text-sm font-semibold text-white">SauceCtrl</div>
        <div class="text-[11px] text-slate-500">Git, but pleasant</div>
      </div>
    </div>

    <div class="relative flex items-center justify-between px-4 pb-2" data-add-menu>
      <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Projects</span>
      <button class="btn-ghost !px-1.5 !py-1" title="Add project" @click="menuOpen = !menuOpen">
        <span class="text-lg leading-none">＋</span>
      </button>

      <div
        v-if="menuOpen"
        class="absolute right-3 top-8 z-30 w-60 overflow-hidden rounded-lg border border-ink-700 bg-ink-850 py-1 shadow-2xl"
      >
        <button
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-200 hover:bg-ink-700"
          @click="openCloneFromGithub"
        >
          <span class="text-base">⬇</span> Clone from GitHub
        </button>
        <button
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-200 hover:bg-ink-700"
          @click="openAddLocal"
        >
          <span class="text-base">📁</span> Add local folder…
        </button>
        <button
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-200 hover:bg-ink-700"
          @click="openDiscovery"
        >
          <span class="text-base">🔍</span> Find repos on this computer
        </button>
      </div>
    </div>

    <div v-if="addingLocal" class="px-4 pb-2 text-[11px] text-slate-500">Opening folder picker…</div>
    <button
      v-else-if="scan.running && !ui.repoDiscoveryOpen"
      class="mx-4 mb-2 flex items-center gap-2 text-left text-[11px] text-slate-400 hover:text-white"
      @click="ui.openRepoDiscovery()"
    >
      <span class="inline-block h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      Finding repositories… {{ scan.status?.found.length ?? 0 }} found
    </button>
    <div v-else-if="projects.error" class="px-4 pb-2 text-[11px] text-red-400">{{ projects.error }}</div>

    <div v-if="projects.projects.length" class="px-3 pb-2">
      <label for="sidebar-search" class="sr-only">Filter repositories</label>
      <div class="relative">
        <input
          id="sidebar-search"
          v-model="query"
          type="search"
          class="input !py-1 pr-7 text-[13px]"
          placeholder="Filter repositories…"
          autocomplete="off"
          spellcheck="false"
          @keydown="onSearchKey"
        />
        <button
          v-if="query"
          class="absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-1 text-[11px] text-slate-400 hover:text-slate-100"
          aria-label="Clear filter"
          @click="query = ''"
        >
          ✕
        </button>
      </div>
      <p v-if="query" class="mt-1 text-[11px] text-slate-500" aria-live="polite">
        {{ filtered.length }} of {{ projects.projects.length }}
      </p>
    </div>

    <nav class="min-h-0 flex-1 overflow-y-auto px-2" aria-label="Repository list">
      <template v-for="(p, i) in filtered" :key="p.id">
        <div
          v-if="i === firstUnpinned"
          class="mx-2 mb-1 mt-2 border-t border-ink-700"
          role="separator"
          aria-label="Other repositories"
        />
        <div
          class="group relative mb-1 flex items-center rounded-lg transition-colors"
          :class="p.id === projects.selectedId ? 'bg-ink-700' : 'hover:bg-ink-800'"
        >
          <button
            class="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left"
            :aria-current="p.id === projects.selectedId ? 'true' : undefined"
            @click="projects.select(p.id)"
          >
            <div
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-bold"
              :class="p.exists === false ? 'bg-red-500/15 text-red-300' : 'bg-ink-600 text-slate-200'"
            >
              {{ initials(p.name) }}
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <span class="truncate text-sm font-medium text-slate-100">{{ p.name }}</span>
                <span
                  v-if="projects.openIds.includes(p.id)"
                  class="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                  title="Open in a tab"
                />
                <span v-if="projects.openIds.includes(p.id)" class="sr-only">(open)</span>
              </div>
              <div class="truncate text-[11px] text-slate-500">
                <span v-if="p.branch" class="text-accent"
                  ><span class="sr-only">branch </span><span aria-hidden="true">⎇ </span>{{ p.branch }}</span
                >
                <span v-else>{{ p.path }}</span>
              </div>
            </div>
          </button>
          <button
            class="shrink-0 rounded p-1.5 hover:bg-ink-600 focus-visible:opacity-100 group-hover:opacity-100"
            :class="p.pinned_at ? 'text-accent' : 'text-slate-500 opacity-0 hover:text-slate-100'"
            :title="p.pinned_at ? `Unpin ${p.name}` : `Pin ${p.name} to the top`"
            :aria-label="p.pinned_at ? `Unpin ${p.name}` : `Pin ${p.name} to the top`"
            :aria-pressed="!!p.pinned_at"
            :disabled="pinning === p.id"
            @click="togglePin(p)"
          >
            <svg viewBox="0 0 16 16" class="h-3.5 w-3.5" :fill="p.pinned_at ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true">
              <path d="M6 1.75h4l-.5 4 2.5 2.5v1.25H4V8.25l2.5-2.5-.5-4Z" />
              <path d="M8 9.5v4.75" stroke-linecap="round" />
            </svg>
          </button>
          <button
            class="mr-1 shrink-0 rounded p-1.5 text-slate-500 opacity-0 hover:bg-ink-600 hover:text-red-400 focus-visible:opacity-100 group-hover:opacity-100"
            :title="`Hide ${p.name} from the sidebar`"
            :aria-label="`Hide ${p.name} from the sidebar`"
            @click="hide(p)"
          >
            ✕
          </button>
        </div>
      </template>

      <div v-if="projects.projects.length && !filtered.length" class="px-2 py-6 text-center text-xs text-slate-500">
        <p>No repositories match “{{ query }}”.</p>
        <button class="mt-2 text-accent hover:underline" @click="query = ''">Clear filter</button>
      </div>

      <div v-if="!projects.projects.length" class="px-2 py-6 text-center text-xs text-slate-500">
        <p>No projects yet.</p>
        <button class="mt-2 text-accent hover:underline" @click="ui.openRepoDiscovery()">
          Find repos on this computer
        </button>
      </div>
    </nav>

    <div class="flex gap-2 px-3 pb-3 pt-3">
      <button
        class="flex flex-1 items-center justify-center gap-2 rounded-lg border border-ink-700 py-2 text-xs text-slate-300 hover:bg-ink-800"
        title="GitHub Setup"
        @click="ui.ghSetupOpen = true"
      >
        GitHub
      </button>
      <button
        class="flex flex-1 items-center justify-center gap-2 rounded-lg border border-ink-700 py-2 text-xs text-slate-300 hover:bg-ink-800"
        title="Settings"
        @click="ui.settingsOpen = true"
      >
        <span class="text-base">⚙</span> Settings
      </button>
    </div>
  </aside>
</template>
