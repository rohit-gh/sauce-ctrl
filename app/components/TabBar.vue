<script setup lang="ts">
/**
 * One tab per open repository. Clicking a repo in the sidebar opens/activates
 * its tab; closing a tab keeps the repo in the sidebar so it can be re-opened.
 */
const projects = useProjectsStore()
const bar = ref<HTMLElement | null>(null)

const tabs = computed(() => projects.openTabs)

function tabEl(id: string) {
  return bar.value?.querySelector<HTMLElement>(`[data-tab-id="${id}"]`) ?? null
}

// Keep the active tab visible when it changes (e.g. opened from the sidebar).
watch(
  () => projects.selectedId,
  async (id) => {
    if (!id) return
    await nextTick()
    tabEl(id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  },
  { immediate: true },
)

function activate(id: string) {
  projects.select(id)
}

async function close(id: string) {
  const hadFocus = bar.value?.contains(document.activeElement)
  projects.closeTab(id)
  if (hadFocus && projects.selectedId) {
    await nextTick()
    tabEl(projects.selectedId)?.focus()
  }
}

function onKey(e: KeyboardEvent, id: string) {
  const ids = tabs.value.map((t) => t.id)
  const i = ids.indexOf(id)
  let next: string | undefined
  if (e.key === 'ArrowRight') next = ids[(i + 1) % ids.length]
  else if (e.key === 'ArrowLeft') next = ids[(i - 1 + ids.length) % ids.length]
  else if (e.key === 'Home') next = ids[0]
  else if (e.key === 'End') next = ids[ids.length - 1]
  else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault()
    close(id)
    return
  }
  if (!next) return
  e.preventDefault()
  activate(next)
  nextTick(() => tabEl(next!)?.focus())
}
</script>

<template>
  <div
    v-if="tabs.length"
    ref="bar"
    role="tablist"
    aria-label="Open repositories"
    class="flex h-10 shrink-0 items-end gap-px overflow-x-auto border-b border-ink-800 bg-ink-950 px-2 pt-1.5"
  >
    <div
      v-for="t in tabs"
      :key="t.id"
      class="group relative flex h-full min-w-0 max-w-[220px] shrink-0 items-center rounded-t-md border border-b-0 transition-colors"
      :class="
        t.id === projects.selectedId
          ? 'border-ink-700 bg-ink-900 text-slate-100'
          : 'border-transparent text-slate-400 hover:bg-ink-850 hover:text-slate-200'
      "
      @mousedown.middle.prevent="close(t.id)"
    >
      <!-- Accent line marks the active tab without relying on colour alone (it's also raised + bold). -->
      <span v-if="t.id === projects.selectedId" class="absolute inset-x-0 top-0 h-0.5 rounded-t-md bg-accent" aria-hidden="true" />
      <button
        :id="`tab-${t.id}`"
        :data-tab-id="t.id"
        role="tab"
        :aria-selected="t.id === projects.selectedId"
        aria-keyshortcuts="Delete"
        aria-controls="repo-panel"
        :tabindex="t.id === projects.selectedId ? 0 : -1"
        class="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-3 pr-1 text-left text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-t-md"
        :class="t.id === projects.selectedId ? 'font-semibold' : 'font-medium'"
        :title="t.path"
        @click="activate(t.id)"
        @keydown="onKey($event, t.id)"
      >
        <span class="truncate">{{ t.name }}</span>
        <span v-if="t.branch" class="hidden truncate text-[11px] font-normal text-slate-500 lg:inline"
          ><span class="sr-only">, branch </span><span aria-hidden="true">⎇ </span>{{ t.branch }}</span
        >
      </button>
      <button
        class="mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] text-slate-500 hover:bg-ink-700 hover:text-slate-100 focus-visible:ring-2 focus-visible:ring-accent outline-none"
        :title="`Close tab (${t.name} stays in the sidebar)`"
        tabindex="-1"
        aria-hidden="true"
        @click.stop="close(t.id)"
      >
        ✕
      </button>
    </div>
  </div>
</template>
