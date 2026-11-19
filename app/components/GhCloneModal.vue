<script setup lang="ts">
interface GhRepo {
  nameWithOwner: string
  name: string
  description: string
  isPrivate: boolean
  isFork: boolean
  updatedAt: string
  url: string
  language: string | null
}

const projects = useProjectsStore()
const ui = useUiStore()

const loading = ref(true)
const loadError = ref('')
const notAuthed = ref(false)
const repos = ref<GhRepo[]>([])
const search = ref('')

const selected = ref<GhRepo | null>(null)
const destDir = ref('')
const browsing = ref(false)
const cloning = ref(false)
const cloneError = ref('')

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return repos.value
  return repos.value.filter(
    (r) => r.nameWithOwner.toLowerCase().includes(q) || r.description.toLowerCase().includes(q),
  )
})

async function loadRepos() {
  loading.value = true
  loadError.value = ''
  notAuthed.value = false
  try {
    repos.value = await $fetch<GhRepo[]>('/api/gh/repos')
  } catch (err: any) {
    if (err?.status === 401 || err?.statusCode === 401) {
      notAuthed.value = true
    } else {
      loadError.value = err?.data?.statusMessage || err?.message || 'Failed to load repositories'
    }
  } finally {
    loading.value = false
  }
}

async function browse() {
  browsing.value = true
  try {
    const res = await $fetch<{ path: string | null }>('/api/system/pick-folder')
    if (res.path) destDir.value = res.path
  } catch (err: any) {
    cloneError.value = err?.data?.statusMessage || err?.message || 'Could not open folder picker'
  } finally {
    browsing.value = false
  }
}

async function clone() {
  if (!selected.value || !destDir.value.trim() || cloning.value) return
  cloning.value = true
  cloneError.value = ''
  try {
    await projects.cloneFromGithub(selected.value.nameWithOwner, destDir.value.trim())
    ui.ghCloneOpen = false
  } catch (err: any) {
    cloneError.value = err?.data?.statusMessage || err?.message || 'Clone failed'
  } finally {
    cloning.value = false
  }
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const d = Math.floor(diff / 86400000)
  if (d < 1) return 'today'
  if (d < 30) return `${d}d ago`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.floor(mo / 12)}y ago`
}

function openSetup() {
  ui.ghCloneOpen = false
  ui.ghSetupOpen = true
}

async function loadDefaultDir() {
  try {
    const res = await $fetch<{ path: string }>('/api/system/default-clone-dir')
    if (res.path) destDir.value = res.path
  } catch {
    // Non-fatal: user can still type or browse for a folder.
  }
}

onMounted(() => {
  loadRepos()
  loadDefaultDir()
})
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" @click.self="ui.ghCloneOpen = false">
    <div class="flex h-[80vh] w-full max-w-2xl flex-col rounded-xl border border-ink-700 bg-ink-900 shadow-2xl">
      <div class="flex items-center justify-between border-b border-ink-800 px-5 py-4">
        <div>
          <h2 class="text-base font-semibold text-white">Clone from GitHub</h2>
          <p class="text-[11px] text-slate-500">Pick a repository you own, collaborate on, or can access through an organization.</p>
        </div>
        <button class="text-slate-500 hover:text-white" title="Close" @click="ui.ghCloneOpen = false">✕</button>
      </div>

      <!-- Not authenticated -->
      <div v-if="notAuthed" class="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p class="text-sm text-slate-400">You're not connected to GitHub yet.</p>
        <button class="btn-primary" @click="openSetup">Set up GitHub</button>
      </div>

      <template v-else>
        <div class="border-b border-ink-800 px-5 py-3">
          <input
            v-model="search"
            class="input"
            placeholder="Search repositories…"
          />
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          <div v-if="loading" class="p-6 text-sm text-slate-500">Loading repositories…</div>
          <div v-else-if="loadError" class="p-6 text-sm text-red-400">{{ loadError }}</div>
          <div v-else-if="!filtered.length" class="p-6 text-sm text-slate-500">No repositories found.</div>

          <button
            v-for="r in filtered"
            :key="r.nameWithOwner"
            class="mb-1 flex w-full flex-col gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors"
            :class="selected?.nameWithOwner === r.nameWithOwner ? 'border-accent bg-accent/10' : 'border-transparent hover:bg-ink-800'"
            @click="selected = r"
          >
            <div class="flex items-center gap-2">
              <span class="truncate text-sm font-medium text-slate-100">{{ r.nameWithOwner }}</span>
              <span v-if="r.isPrivate" class="shrink-0 rounded bg-amber-400/20 px-1.5 text-[10px] text-amber-300">private</span>
              <span v-if="r.isFork" class="shrink-0 rounded bg-ink-600 px-1.5 text-[10px] text-slate-400">fork</span>
              <span class="ml-auto shrink-0 text-[10px] text-slate-600">{{ relTime(r.updatedAt) }}</span>
            </div>
            <span v-if="r.description" class="truncate text-[11px] text-slate-500">{{ r.description }}</span>
            <span v-if="r.language" class="text-[10px] text-slate-600">{{ r.language }}</span>
          </button>
        </div>

        <div class="border-t border-ink-800 px-5 py-3">
          <label class="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Clone into
          </label>
          <div class="flex gap-2">
            <input
              v-model="destDir"
              class="input min-w-0 flex-1"
              placeholder="~/Documents"
            />
            <button class="btn-subtle shrink-0" :disabled="browsing" @click="browse">
              {{ browsing ? '…' : 'Browse' }}
            </button>
          </div>
          <p v-if="selected && destDir.trim()" class="mt-1.5 truncate text-[11px] text-slate-500">
            → {{ destDir.trim().replace(/\/$/, '') }}/{{ selected.name }}
          </p>
          <p v-if="cloneError" class="mt-2 text-xs text-red-400">{{ cloneError }}</p>

          <div class="mt-3 flex justify-end gap-2">
            <button class="btn-subtle" @click="ui.ghCloneOpen = false">Cancel</button>
            <button
              class="btn-primary"
              :disabled="!selected || !destDir.trim() || cloning"
              @click="clone"
            >
              {{ cloning ? 'Cloning…' : selected ? `Clone ${selected.name}` : 'Clone' }}
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
