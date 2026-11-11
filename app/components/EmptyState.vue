<script setup lang="ts">
interface GhStatus {
  installed: boolean
  authenticated: boolean
  user: string | null
  version: string | null
}

interface GitEnv {
  installed: boolean
  version: string | null
  userName: string | null
  userEmail: string | null
  configured: boolean
}

const projects = useProjectsStore()
const ui = useUiStore()

const adding = ref(false)
const gh = ref<GhStatus | null>(null)
const git = ref<GitEnv | null>(null)

const gitReady = computed(() => !!git.value?.installed && !!git.value?.configured)
const ghReady = computed(() => !!gh.value?.installed && !!gh.value?.authenticated)

async function checkGh() {
  try {
    gh.value = await $fetch<GhStatus>('/api/gh/status')
  } catch {
    gh.value = null
  }
}
async function checkGit() {
  try {
    git.value = await $fetch<GitEnv>('/api/git/env')
  } catch {
    git.value = null
  }
}
onMounted(() => {
  checkGit()
  checkGh()
})

// Refresh status whenever the setup modal is closed (git may have been configured there).
watch(
  () => ui.ghSetupOpen,
  (open, wasOpen) => {
    if (wasOpen && !open) {
      checkGit()
      checkGh()
    }
  },
)

// Browse for a folder with the native picker and add it directly. Picking a
// folder that only *contains* repos opens discovery scoped to that folder.
async function browseAndAdd() {
  if (adding.value) return
  adding.value = true
  try {
    await projects.addFromPicker()
  } catch (err: any) {
    if (!projects.error) {
      projects.error = err?.data?.statusMessage || err?.message || 'Could not add folder'
    }
  } finally {
    adding.value = false
  }
}
</script>

<template>
  <div class="flex flex-1 flex-col items-center justify-center gap-6 p-8">
    <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-soft text-3xl font-bold text-on-accent">
      S
    </div>
    <div class="text-center">
      <h1 class="text-xl font-semibold text-white">Welcome to SauceCtrl</h1>
      <p class="mt-1 max-w-md text-sm text-slate-400">
        A browser-based Git client. Add a local repository to visualize its history,
        stage changes, and open a terminal right where you need it.
      </p>
    </div>

    <div class="w-full max-w-md">
      <!-- Git installation + identity requirement -->
      <div class="rounded-xl border border-ink-700 bg-ink-850 p-4">
        <div class="flex items-start gap-3">
          <span
            class="mt-0.5 text-lg"
            :class="gitReady ? 'text-green-400' : git?.installed ? 'text-amber-400' : 'text-red-400'"
          >
            {{ gitReady ? '✓' : '①' }}
          </span>
          <div class="min-w-0 flex-1">
            <h2 class="text-sm font-semibold text-white">Install &amp; configure Git</h2>
            <p v-if="!git?.installed" class="mt-0.5 text-[12px] text-slate-400">
              Git isn't installed on this device. SauceCtrl runs the <span class="font-mono">git</span>
              CLI for every operation, so it's required.
            </p>
            <p v-else-if="!git?.configured" class="mt-0.5 text-[12px] text-slate-400">
              Git {{ git?.version }} is installed, but your commit identity
              (<span class="font-mono">user.name</span> / <span class="font-mono">user.email</span>)
              isn't set yet.
            </p>
            <p v-else class="mt-0.5 text-[12px] text-green-400">
              Git {{ git?.version }} ready — committing as {{ git?.userName }} &lt;{{ git?.userEmail }}&gt;.
            </p>
          </div>
        </div>
        <button
          v-if="!gitReady"
          class="mt-3 w-full justify-center btn-primary"
          @click="ui.ghSetupOpen = true"
        >
          Set up Git
        </button>
      </div>

      <div class="my-4 flex items-center gap-3">
        <div class="h-px flex-1 bg-ink-800" />
        <span class="text-[11px] text-slate-600">and connect GitHub</span>
        <div class="h-px flex-1 bg-ink-800" />
      </div>

      <!-- GitHub CLI requirement -->
      <div class="rounded-xl border border-ink-700 bg-ink-850 p-4">
        <div class="flex items-start gap-3">
          <span class="mt-0.5 text-lg" :class="ghReady ? 'text-green-400' : 'text-amber-400'">
            {{ ghReady ? '✓' : '②' }}
          </span>
          <div class="min-w-0 flex-1">
            <h2 class="text-sm font-semibold text-white">Set up the GitHub CLI</h2>
            <p class="mt-0.5 text-[12px] text-slate-400">
              SauceCtrl requires the GitHub CLI (<span class="font-mono">gh</span>) to work —
              it powers cloning and pushing to your repositories.
            </p>
            <p v-if="ghReady" class="mt-1 text-[11px] text-green-400">
              Connected as {{ gh?.user }}. You're all set.
            </p>
          </div>
        </div>
        <button
          class="mt-3 w-full justify-center"
          :class="ghReady ? 'btn-subtle' : 'btn-primary'"
          @click="ui.ghSetupOpen = true"
        >
          {{ ghReady ? 'Manage GitHub setup' : 'Set up GitHub CLI' }}
        </button>
      </div>

      <div class="my-4 flex items-center gap-3">
        <div class="h-px flex-1 bg-ink-800" />
        <span class="text-[11px] text-slate-600">then add a repository</span>
        <div class="h-px flex-1 bg-ink-800" />
      </div>

      <div class="flex flex-col gap-2">
        <button class="btn-primary w-full justify-center py-2" @click="ui.openRepoDiscovery()">
          <span class="text-base">🔍</span> Find repositories on this computer
        </button>
        <button class="btn-subtle w-full justify-center" :disabled="adding" @click="browseAndAdd">
          <span class="text-base">📁</span>
          {{ adding ? 'Opening folder picker…' : 'Browse & add repo' }}
        </button>
        <button class="btn-subtle w-full justify-center" @click="ui.ghCloneOpen = true">
          <span class="text-base">⬇</span> Clone from GitHub
        </button>
      </div>
      <p v-if="projects.error" class="mt-2 text-xs text-red-400">{{ projects.error }}</p>
    </div>
  </div>
</template>
