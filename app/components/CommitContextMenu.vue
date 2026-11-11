<script setup lang="ts">
import type { CommitNode } from '~/stores/repo'

const props = defineProps<{
  commit: CommitNode
  x: number
  y: number
}>()
const emit = defineEmits<{ close: [] }>()

const repo = useRepoStore()
const menuRef = ref<HTMLElement | null>(null)

const style = computed(() => ({
  left: `${props.x}px`,
  top: `${props.y}px`,
}))

async function run(action: () => Promise<void>) {
  emit('close')
  try {
    await action()
  } catch (err: any) {
    alertError(err, 'Git operation failed')
  }
}

async function reset(mode: 'soft' | 'mixed' | 'hard') {
  // Close the menu first; the dialog outlives it.
  const commit = props.commit
  emit('close')
  const ok =
    mode === 'hard'
      ? await appConfirm(`Hard reset to ${commit.abbrevHash}? This discards uncommitted changes.`, {
          title: 'Hard reset?',
          confirmLabel: 'Hard reset',
          danger: true,
        })
      : await appConfirm(`${mode} reset to ${commit.abbrevHash}?`, { title: 'Reset branch?', confirmLabel: 'Reset' })
  if (!ok) return
  run(() => repo.resetCommit(commit.hash, mode))
}

function cherryPick() {
  run(() => repo.cherryPickCommit(props.commit.hash))
}

async function createBranch() {
  const commit = props.commit
  emit('close')
  const name = await appPrompt(`New branch name at ${commit.abbrevHash}:`, {
    title: 'Create branch',
    confirmLabel: 'Create & checkout',
    placeholder: 'feature/my-branch',
  })
  if (!name?.trim()) return
  run(() => repo.createBranchAtCommit(name.trim(), commit.hash, true))
}

function onDocClick(e: MouseEvent) {
  if (!menuRef.value?.contains(e.target as Node)) emit('close')
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div
    ref="menuRef"
    class="fixed z-50 min-w-44 rounded-lg border border-ink-700 bg-ink-850 py-1 shadow-2xl"
    :style="style"
    @click.stop
  >
    <div class="border-b border-ink-700 px-3 py-1.5 font-mono text-[10px] text-slate-500">
      {{ commit.abbrevHash }}
    </div>
    <button class="menu-item" @click="createBranch">Create branch here…</button>
    <button class="menu-item" @click="cherryPick">Cherry-pick</button>
    <div class="my-1 border-t border-ink-700" />
    <button class="menu-item" @click="reset('soft')">Reset — soft</button>
    <button class="menu-item" @click="reset('mixed')">Reset — mixed</button>
    <button class="menu-item text-red-400 hover:bg-red-500/10" @click="reset('hard')">Reset — hard</button>
  </div>
</template>

<style scoped>
.menu-item {
  @apply block w-full px-3 py-1.5 text-left text-sm text-slate-200 hover:bg-ink-700;
}
</style>
