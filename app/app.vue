<script setup lang="ts">
import { PANEL } from '~/stores/ui'

const projects = useProjectsStore()
const repo = useRepoStore()
const ui = useUiStore()

// Load projects once on mount.
onMounted(() => projects.fetch())

// Whenever the selected project changes, reload its repo data.
watch(
  () => projects.selected?.path,
  (path) => {
    repo.selectedHash = null
    repo.commitDetail = null
    if (path) repo.load(path)
  },
  { immediate: true },
)

// Keep the repo view in sync with changes made outside the UI (embedded
// terminal, external git tools). A full reload on focus catches commits/pushes
// when returning to the app; lightweight status polling keeps the Changes list
// current while the tab stays visible.
const POLL_MS = 4000

function fullRefresh() {
  if (repo.path && !repo.loading) repo.load(repo.path)
}

function pollStatus() {
  if (document.visibilityState !== 'visible') return
  if (repo.path && !repo.loading) repo.refreshStatus().catch(() => {})
}

function onVisibility() {
  if (document.visibilityState === 'visible') fullRefresh()
}

onMounted(() => {
  window.addEventListener('focus', fullRefresh)
  document.addEventListener('visibilitychange', onVisibility)
  const timer = setInterval(pollStatus, POLL_MS)
  onBeforeUnmount(() => {
    window.removeEventListener('focus', fullRefresh)
    document.removeEventListener('visibilitychange', onVisibility)
    clearInterval(timer)
  })
})
</script>

<template>
  <div class="flex h-screen w-screen overflow-hidden bg-ink-950 text-slate-200">
    <Sidebar :style="{ width: `${ui.sidebarWidth}px` }" />
    <ResizeHandle
      panel="left"
      label="Resize sidebar"
      :value="ui.sidebarWidth"
      :min="PANEL.sidebar.min"
      :max="PANEL.sidebar.max"
      :default="PANEL.sidebar.default"
      @resize="ui.setPanelWidth('sidebar', $event)"
    />

    <div class="flex min-w-0 flex-1 flex-col">
      <TabBar />

      <div
        v-if="projects.selected"
        id="repo-panel"
        role="tabpanel"
        :aria-labelledby="`tab-${projects.selected.id}`"
        class="flex min-h-0 flex-1 flex-col"
      >
        <AppHeader />
        <div class="flex min-h-0 flex-1">
          <main class="min-w-0 flex-1">
            <CommitGraph />
          </main>
          <ResizeHandle
            panel="right"
            label="Resize details panel"
            :value="ui.detailWidth"
            :min="PANEL.detail.min"
            :max="PANEL.detail.max"
            :default="PANEL.detail.default"
            @resize="ui.setPanelWidth('detail', $event)"
          />
          <aside
            class="flex shrink-0 flex-col bg-ink-900"
            :style="{ width: `${ui.detailWidth}px` }"
            aria-label="Details"
          >
            <DetailPanel />
          </aside>
        </div>
        <TerminalPanel v-if="ui.terminalOpen" />
      </div>

      <NoRepoOpen v-else-if="projects.projects.length" />
      <EmptyState v-else />
    </div>

    <GhSetup v-if="ui.ghSetupOpen" />
    <GhCloneModal v-if="ui.ghCloneOpen" />
    <SettingsModal v-if="ui.settingsOpen" />
    <InstallAppModal v-if="ui.pwaInstallOpen" />
    <RepoDiscoveryModal v-if="ui.repoDiscoveryOpen" />
    <UnsupportedRemoteModal />
    <AppDialog />
  </div>
</template>
