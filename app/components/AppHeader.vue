<script setup lang="ts">
const projects = useProjectsStore()
const repo = useRepoStore()
const ui = useUiStore()

const dropdownOpen = ref(false)
const newBranchOpen = ref(false)

const localBranches = computed(() => repo.branches.filter((b) => !b.isRemote))
const remoteBranches = computed(() => repo.branches.filter((b) => b.isRemote))

async function switchTo(name: string) {
  dropdownOpen.value = false
  try {
    await repo.checkout(name)
    await projects.fetch()
  } catch (err: any) {
    alertError(err, 'Checkout failed')
  }
}

function openNewBranch() {
  dropdownOpen.value = false
  newBranchOpen.value = true
}

async function popStash(index: number) {
  dropdownOpen.value = false
  try {
    await repo.stashPop(index)
  } catch (err: any) {
    alertError(err, 'Failed to restore stash')
  }
}

async function dropStash(index: number) {
  if (!(await appConfirm('Discard this stash permanently?', { title: 'Drop stash?', confirmLabel: 'Drop', danger: true }))) return
  try {
    await repo.stashDrop(index)
  } catch (err: any) {
    alertError(err, 'Failed to drop stash')
  }
}

function closeDropdown(e: MouseEvent) {
  if (!(e.target as HTMLElement).closest('[data-branch-dropdown]')) dropdownOpen.value = false
}
onMounted(() => document.addEventListener('click', closeDropdown))
onBeforeUnmount(() => document.removeEventListener('click', closeDropdown))
</script>

<template>
  <header class="flex h-14 shrink-0 items-center gap-3 border-b border-ink-800 bg-ink-900 px-4">
    <div class="flex items-center gap-2">
      <span class="text-sm font-semibold text-white">{{ projects.selected?.name }}</span>
      <span v-if="repo.status" class="text-[11px] text-slate-500">
        <span v-if="repo.status.ahead" class="text-green-400">↑{{ repo.status.ahead }}</span>
        <span v-if="repo.status.behind" class="text-amber-400">↓{{ repo.status.behind }}</span>
      </span>
    </div>

    <!-- Branch dropdown -->
    <div v-if="repo.status" class="relative" data-branch-dropdown>
      <button
        class="flex items-center gap-2 rounded-md border border-ink-700 bg-ink-850 px-3 py-1.5 text-sm hover:bg-ink-800"
        title="Switch branch"
        @click="dropdownOpen = !dropdownOpen"
      >
        <span class="text-accent">⎇</span>
        <span class="font-medium text-slate-100">{{ repo.status.branch || 'detached' }}</span>
        <span class="text-slate-500">▾</span>
      </button>

      <div
        v-if="dropdownOpen"
        class="absolute z-30 mt-1 max-h-96 w-72 overflow-y-auto rounded-lg border border-ink-700 bg-ink-850 py-1 shadow-2xl"
      >
        <button
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-accent hover:bg-ink-700"
          @click="openNewBranch"
        >
          <span class="text-base leading-none">＋</span>
          <span class="font-medium">Create new branch from here</span>
        </button>
        <div class="my-1 border-t border-ink-700" />

        <div class="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Local
        </div>
        <button
          v-for="b in localBranches"
          :key="b.name"
          class="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-ink-700"
          @click="switchTo(b.name)"
        >
          <span :class="b.isCurrent ? 'font-semibold text-accent' : 'text-slate-200'">
            {{ b.isCurrent ? '● ' : '' }}{{ b.name }}
          </span>
          <span class="font-mono text-[10px] text-slate-500">{{ b.hash }}</span>
        </button>

        <template v-if="remoteBranches.length">
          <div class="mt-1 border-t border-ink-700 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Remote
          </div>
          <button
            v-for="b in remoteBranches"
            :key="b.name"
            class="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-ink-700"
            @click="switchTo(b.name)"
          >
            <span class="truncate text-slate-300">{{ b.name.replace('remotes/', '') }}</span>
            <span class="font-mono text-[10px] text-slate-500">{{ b.hash }}</span>
          </button>
        </template>

        <template v-if="repo.stashes.length">
          <div class="mt-1 border-t border-ink-700 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Stashes
          </div>
          <div
            v-for="s in repo.stashes"
            :key="s.ref"
            class="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-ink-700"
          >
            <span class="min-w-0 flex-1 truncate text-slate-300" :title="s.message">{{ s.message }}</span>
            <button class="shrink-0 text-[11px] text-accent hover:underline" title="Apply and remove" @click="popStash(s.index)">
              Pop
            </button>
            <button class="shrink-0 text-slate-600 hover:text-red-400" title="Discard stash" @click="dropStash(s.index)">
              ✕
            </button>
          </div>
        </template>
      </div>
    </div>

    <div class="flex-1" />

    <div v-if="repo.path" class="flex items-center gap-1">
      <button
        class="btn-ghost !px-2"
        title="Fetch from remote"
        :disabled="!!repo.remoteBusy"
        @click="repo.fetchRemote()"
      >
        {{ repo.remoteBusy === 'fetch' ? '…' : '↓ Fetch' }}
      </button>
      <button
        class="btn-ghost !px-2"
        title="Pull from remote"
        :disabled="!!repo.remoteBusy"
        @click="repo.pullRemote()"
      >
        {{ repo.remoteBusy === 'pull' ? '…' : '⇣ Pull' }}
      </button>
      <button
        class="btn-ghost !px-2"
        title="Push to remote"
        :disabled="!!repo.remoteBusy"
        @click="repo.pushRemote()"
      >
        {{ repo.remoteBusy === 'push' ? '…' : '⇡ Push' }}
      </button>
    </div>

    <button class="btn-ghost" title="Refresh" @click="repo.load(repo.path)">
      <span class="text-base">⟳</span> Refresh
    </button>
    <button class="btn-subtle" title="Open terminal at repo" @click="ui.toggleTerminal()">
      <span class="font-mono">›_</span> Terminal
    </button>
  </header>

  <NewBranchModal v-if="newBranchOpen" @close="newBranchOpen = false" />
</template>
