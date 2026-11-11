<script setup lang="ts">
/** Shown when there are repositories in the sidebar but every tab is closed. */
const projects = useProjectsStore()
const recent = computed(() => projects.projects.slice(0, 5))
</script>

<template>
  <div class="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
    <div>
      <h1 class="text-lg font-semibold text-white">No repository open</h1>
      <p class="mt-1 text-sm text-slate-400">Pick a repository in the sidebar to open it in a tab.</p>
    </div>
    <div v-if="recent.length" class="w-full max-w-sm">
      <h2 class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Recent</h2>
      <ul class="space-y-1">
        <li v-for="p in recent" :key="p.id">
          <button
            class="flex w-full items-center justify-between gap-3 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-left hover:bg-ink-800"
            @click="projects.select(p.id)"
          >
            <span class="truncate text-sm font-medium text-slate-100">{{ p.name }}</span>
            <span v-if="p.branch" class="shrink-0 text-[11px] text-slate-400">⎇ {{ p.branch }}</span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
