<script setup lang="ts">
import { THEMES } from '~/stores/theme'

const ui = useUiStore()
const theme = useThemeStore()
const themeGroups = [
  { mode: 'dark', label: 'Dark', themes: THEMES.filter((t) => t.mode === 'dark') },
  { mode: 'light', label: 'Light', themes: THEMES.filter((t) => t.mode === 'light') },
]
const projects = useProjectsStore()
// Already a desktop app / installed PWA — no point offering to install it.
const runningAsApp = isRunningAsApp()
const scan = useRepoScanStore()

onMounted(() => scan.refresh('computer'))

// Only a whole-computer scan is summarised here (folder scans are one-offs).
const lastScan = computed(() => (scan.status?.scope === 'computer' ? scan.status : null))
const foundCount = computed(() => lastScan.value?.found.length ?? 0)
const inSidebarCount = computed(() => {
  const paths = new Set(projects.projects.map((p) => p.path))
  return lastScan.value?.found.filter((r) => paths.has(r.path)).length ?? 0
})

function scanAndReview() {
  scan.start()
  ui.openRepoDiscovery()
}

function ago(ms: number) {
  const min = Math.floor((Date.now() - ms) / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" @click.self="ui.settingsOpen = false">
    <div class="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-ink-700 bg-ink-900 shadow-2xl">
      <div class="flex items-center justify-between border-b border-ink-800 px-5 py-4">
        <div>
          <h2 class="text-base font-semibold text-white">Settings</h2>
          <p class="text-[11px] text-slate-500">Personalize SauceCtrl and manage your repositories.</p>
        </div>
        <button class="text-slate-500 hover:text-white" title="Close" @click="ui.settingsOpen = false">✕</button>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <section>
          <h3 class="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Theme</h3>
          <p class="mb-3 text-[11px] text-slate-500">Your choice is saved and restored next time you open the app.</p>

          <div v-for="group in themeGroups" :key="group.mode" class="mb-3 last:mb-0">
            <h4 :id="`theme-group-${group.mode}`" class="mb-2 text-[11px] font-medium text-slate-400">{{ group.label }}</h4>
            <div class="grid grid-cols-2 gap-3" role="radiogroup" :aria-labelledby="`theme-group-${group.mode}`">
              <button
                v-for="t in group.themes"
                :key="t.id"
                role="radio"
                :aria-checked="theme.current === t.id"
                class="flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors"
                :class="theme.current === t.id ? 'border-accent bg-accent/10' : 'border-ink-700 hover:bg-ink-800'"
                @click="theme.set(t.id)"
              >
                <div class="flex items-center justify-between">
                  <span class="text-sm font-medium text-slate-100">{{ t.name }}</span>
                  <span
                    v-if="theme.current === t.id"
                    class="rounded-full bg-accent px-2 text-[10px] font-semibold text-on-accent"
                  >
                    ✓ Active
                  </span>
                </div>
                <div class="flex gap-1.5" aria-hidden="true">
                  <span
                    v-for="(c, i) in t.swatch"
                    :key="i"
                    class="h-6 w-6 rounded-md border border-ink-line/40"
                    :style="{ backgroundColor: c }"
                  />
                </div>
                <span class="text-[11px] text-slate-500">{{ t.description }}</span>
              </button>
            </div>
          </div>
        </section>

        <section class="mt-6 border-t border-ink-800 pt-4">
          <h3 class="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Repositories</h3>
          <p class="mb-3 text-[11px] text-slate-500">
            Find the Git repositories already on this computer and choose which ones appear in the
            sidebar. Common folders like Documents and Downloads are searched first.
          </p>

          <div class="rounded-lg border border-ink-700 bg-ink-850 p-3">
            <div v-if="lastScan?.running" class="flex items-center gap-3">
              <span class="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              <div class="min-w-0 flex-1 text-[12px] text-slate-300">
                Scanning… <b class="text-white">{{ foundCount }}</b> found so far
                <div class="truncate text-[11px] text-slate-500">{{ lastScan.scannedDirs.toLocaleString() }} folders checked</div>
              </div>
              <button class="btn-subtle shrink-0" @click="ui.openRepoDiscovery()">View</button>
            </div>

            <div v-else-if="lastScan?.finishedAt" class="flex items-center gap-3">
              <div class="min-w-0 flex-1 text-[12px] text-slate-300">
                <b class="text-white">{{ foundCount }}</b> {{ foundCount === 1 ? 'repository' : 'repositories' }} found ·
                <b class="text-white">{{ inSidebarCount }}</b> in sidebar
                <div class="text-[11px] text-slate-500">Last scanned {{ ago(lastScan.finishedAt) }}</div>
              </div>
              <button class="btn-ghost shrink-0" title="Scan again" @click="scanAndReview">↻ Rescan</button>
              <button class="btn-primary shrink-0" @click="ui.openRepoDiscovery()">Choose…</button>
            </div>

            <div v-else class="flex items-center gap-3">
              <div class="min-w-0 flex-1 text-[12px] text-slate-400">This computer hasn't been scanned yet.</div>
              <button class="btn-primary shrink-0" @click="scanAndReview">Scan for repositories</button>
            </div>
          </div>
        </section>

        <section v-if="!runningAsApp" class="mt-6 border-t border-ink-800 pt-4">
          <h3 class="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Desktop app</h3>
          <p class="mb-3 text-[11px] text-slate-500">
            Install SauceCtrl as a standalone app that runs in its own window while the local
            server works in the background.
          </p>
          <button class="btn-subtle" @click="ui.settingsOpen = false; ui.pwaInstallOpen = true">
            Install as an app…
          </button>
        </section>
      </div>

      <div class="flex justify-end border-t border-ink-800 px-5 py-3">
        <button class="btn-primary" @click="ui.settingsOpen = false">Done</button>
      </div>
    </div>
  </div>
</template>
