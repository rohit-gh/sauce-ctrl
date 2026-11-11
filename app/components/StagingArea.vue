<script setup lang="ts">
import type { FileChange } from '~/stores/repo'
const repo = useRepoStore()

const message = ref('')
const committing = ref(false)

const staged = computed(() => repo.status?.staged ?? [])
const unstaged = computed(() => repo.unstagedFiles)

function statusLabel(f: FileChange) {
  if (f.untracked) return { text: 'U', cls: 'text-green-400', title: 'Untracked' }
  const code = f.staged ? f.index : f.workingTree
  const map: Record<string, { text: string; cls: string; title: string }> = {
    M: { text: 'M', cls: 'text-amber-400', title: 'Modified' },
    A: { text: 'A', cls: 'text-green-400', title: 'Added' },
    D: { text: 'D', cls: 'text-red-400', title: 'Deleted' },
    R: { text: 'R', cls: 'text-blue-400', title: 'Renamed' },
    C: { text: 'C', cls: 'text-blue-400', title: 'Copied' },
    U: { text: 'U', cls: 'text-red-400', title: 'Conflict' },
  }
  return map[code] ?? { text: code, cls: 'text-slate-400', title: 'Changed' }
}

function viewDiff(file: string, stagedFile: boolean) {
  repo.loadDiff(file, { staged: stagedFile })
}

async function discardFile(f: FileChange) {
  const ok = f.untracked
    ? await appConfirm(`Delete untracked file "${f.path}"? This permanently removes it and cannot be undone.`, {
        title: 'Delete file?',
        confirmLabel: 'Delete',
        danger: true,
      })
    : await appConfirm(`Discard changes to "${f.path}"? This reverts the file and cannot be undone.`, {
        title: 'Discard changes?',
        confirmLabel: 'Discard',
        danger: true,
      })
  if (!ok) return
  repo.discard([f.path])
}

async function resetAll() {
  const n = unstaged.value.length
  const ok = await appConfirm(
    `Reset all ${n} changed file${n === 1 ? '' : 's'}? This discards every uncommitted change and deletes untracked files. This cannot be undone.`,
    { title: 'Reset all changes?', confirmLabel: 'Reset all', danger: true },
  )
  if (!ok) return
  repo.discardAll()
}

async function commit() {
  if (!message.value.trim() || !staged.value.length) return
  committing.value = true
  try {
    await repo.commit(message.value.trim())
    message.value = ''
  } catch (err: any) {
    alertError(err, 'Commit failed')
  } finally {
    committing.value = false
  }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="border-b border-ink-800 px-4 py-3">
      <h2 class="text-sm font-semibold text-white">Commit Changes</h2>
      <p class="text-[11px] text-slate-500">Stage files, write a message, and commit. Click a file to view its diff.</p>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <!-- Staged -->
      <section>
        <div class="flex items-center justify-between bg-ink-850 px-4 py-1.5">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-green-400">
            Staged ({{ staged.length }})
          </span>
          <button
            v-if="staged.length"
            class="text-[11px] text-slate-400 hover:text-white"
            @click="repo.unstage(staged.map((f) => f.path))"
          >
            Unstage all
          </button>
        </div>
        <div
          v-for="f in staged"
          :key="'s' + f.path"
          class="flex w-full items-center gap-2 px-4 py-1.5 hover:bg-ink-800"
        >
          <button class="flex min-w-0 flex-1 items-center gap-2 text-left" @click="viewDiff(f.path, true)">
            <span class="w-4 font-mono text-xs" :class="statusLabel(f).cls" :title="statusLabel(f).title">
              {{ statusLabel(f).text }}
            </span>
            <span class="truncate text-sm text-slate-200">{{ f.path }}</span>
          </button>
          <button
            class="shrink-0 text-slate-600 hover:text-red-400"
            title="Unstage"
            @click="repo.unstage([f.path])"
          >
            −
          </button>
        </div>
        <p v-if="!staged.length" class="px-4 py-2 text-xs text-slate-600">Nothing staged yet.</p>
      </section>

      <!-- Unstaged -->
      <section>
        <div class="flex items-center justify-between bg-ink-850 px-4 py-1.5">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-amber-400">
            Changes ({{ unstaged.length }})
          </span>
          <div v-if="unstaged.length" class="flex items-center gap-3">
            <button
              class="text-[11px] text-slate-400 hover:text-red-400"
              @click="resetAll"
            >
              Reset all
            </button>
            <button
              class="text-[11px] text-slate-400 hover:text-white"
              @click="repo.stageAll()"
            >
              Stage all
            </button>
          </div>
        </div>
        <div
          v-for="f in unstaged"
          :key="'u' + f.path"
          class="flex w-full items-center gap-2 px-4 py-1.5 hover:bg-ink-800"
        >
          <button class="flex min-w-0 flex-1 items-center gap-2 text-left" @click="viewDiff(f.path, false)">
            <span class="w-4 font-mono text-xs" :class="statusLabel(f).cls" :title="statusLabel(f).title">
              {{ statusLabel(f).text }}
            </span>
            <span class="truncate text-sm text-slate-200">{{ f.path }}</span>
          </button>
          <button
            class="shrink-0 text-slate-600 hover:text-red-400"
            title="Discard changes"
            @click="discardFile(f)"
          >
            ×
          </button>
          <button
            class="shrink-0 text-slate-600 hover:text-green-400"
            title="Stage"
            @click="repo.stage([f.path])"
          >
            ＋
          </button>
        </div>
        <p v-if="!unstaged.length" class="px-4 py-2 text-xs text-slate-600">Working tree clean.</p>
      </section>
    </div>

    <div class="border-t border-ink-800 p-3">
      <textarea
        v-model="message"
        class="input mb-2 h-20 resize-none font-normal"
        placeholder="Commit message…"
      />
      <button
        class="btn-primary w-full justify-center"
        :disabled="!message.trim() || !staged.length || committing"
        @click="commit"
      >
        {{ committing ? 'Committing…' : `Commit ${staged.length} file${staged.length === 1 ? '' : 's'}` }}
      </button>
    </div>
  </div>
</template>
