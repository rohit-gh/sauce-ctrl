<script setup lang="ts">
import { parseUnifiedDiff } from '~/utils/diff'

const props = defineProps<{
  file: string
  diff: string
  loading?: boolean
}>()
const emit = defineEmits<{ back: [] }>()

const lines = computed(() => parseUnifiedDiff(props.diff))

function lineClass(type: string) {
  if (type === 'add') return 'bg-green-500/15 text-green-200'
  if (type === 'del') return 'bg-red-500/15 text-red-200'
  if (type === 'hunk') return 'bg-accent/10 text-accent-strong font-medium'
  if (type === 'meta') return 'text-slate-500'
  return 'text-slate-300'
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex items-center gap-2 border-b border-ink-800 px-3 py-2">
      <button class="btn-ghost !px-2 !py-1 text-xs" @click="emit('back')">← Back</button>
      <span class="min-w-0 truncate font-mono text-xs text-slate-300">{{ file }}</span>
    </div>

    <div v-if="loading" class="p-4 text-sm text-slate-500">Loading diff…</div>
    <div v-else-if="!diff.trim()" class="p-4 text-sm text-slate-500">No diff to show (binary or empty change).</div>
    <div v-else class="min-h-0 flex-1 overflow-auto font-mono text-[11px] leading-5">
      <div
        v-for="(line, i) in lines"
        :key="i"
        class="flex whitespace-pre"
        :class="lineClass(line.type)"
      >
        <span class="w-10 shrink-0 select-none border-r border-ink-800 pr-2 text-right text-slate-600">
          {{ line.oldNo ?? '' }}
        </span>
        <span class="w-10 shrink-0 select-none border-r border-ink-800 pr-2 text-right text-slate-600">
          {{ line.newNo ?? '' }}
        </span>
        <span class="w-4 shrink-0 select-none text-center text-slate-500">
          {{ line.type === 'add' ? '+' : line.type === 'del' ? '−' : line.type === 'ctx' ? ' ' : '' }}
        </span>
        <span class="min-w-0 flex-1 px-2">{{ line.text }}</span>
      </div>
    </div>
  </div>
</template>
