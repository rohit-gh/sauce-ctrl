<script setup lang="ts">
import { WIP } from '~/stores/repo'
import { computeGraph, GRAPH_COLORS } from '~/utils/graph'

const repo = useRepoStore()

const ROW_H = 36
const LANE_W = 18
const LEFT_PAD = 14
const DOT_R = 5

const layout = computed(() => computeGraph(repo.commits))
const gutterWidth = computed(() => LEFT_PAD * 2 + (layout.value.maxCol + 1) * LANE_W)
const svgHeight = computed(() => Math.max(repo.commits.length * ROW_H, 1))

const x = (col: number) => LEFT_PAD + col * LANE_W + LANE_W / 2
const y = (row: number) => row * ROW_H + ROW_H / 2

function edgePath(e: { fromCol: number; fromRow: number; toCol: number; toRow: number }) {
  const x1 = x(e.fromCol)
  const y1 = y(e.fromRow)
  const x2 = x(e.toCol)
  const y2 = y(e.toRow)
  if (x1 === x2) return `M ${x1} ${y1} L ${x2} ${y2}`
  const midY = y1 + (y2 - y1) / 2
  return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`
}

function refChips(refs: string[]) {
  return refs
    .filter((r) => !r.startsWith('tag:') || true)
    .map((r) => {
      const isHead = r.includes('HEAD ->')
      const isTag = r.startsWith('tag:')
      const label = r.replace('HEAD ->', '').replace('tag:', '').trim()
      return { label, isHead, isTag, isRemote: label.startsWith('origin/') }
    })
    .filter((r) => r.label)
}

function relTime(ts: number) {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(ts).toLocaleDateString()
}

const changeCount = computed(() => {
  const s = repo.status
  if (!s) return 0
  const set = new Set([...s.staged, ...s.unstaged, ...s.untracked].map((f) => f.path))
  return set.size
})

const contextMenu = ref<{ commit: (typeof repo.commits)[0]; x: number; y: number } | null>(null)

function openContextMenu(e: MouseEvent, commit: (typeof repo.commits)[0]) {
  e.preventDefault()
  contextMenu.value = { commit, x: e.clientX, y: e.clientY }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex items-center justify-between border-b border-ink-800 px-4 py-2">
      <h2 class="text-xs font-semibold uppercase tracking-wider text-slate-400">History</h2>
      <span class="text-[11px] text-slate-500">{{ repo.commits.length }} commits</span>
    </div>

    <div v-if="repo.loading" class="p-6 text-sm text-slate-500">Loading history…</div>
    <div v-else-if="repo.error" class="p-6 text-sm text-red-400">{{ repo.error }}</div>

    <div v-else class="min-h-0 flex-1 overflow-auto">
      <!-- Working directory changes row -->
      <button
        v-if="changeCount > 0"
        class="flex w-full items-center gap-3 border-b border-dashed border-ink-700 px-4 text-left transition-colors"
        :class="repo.selectedHash === WIP ? 'bg-ink-800' : 'hover:bg-ink-850'"
        :style="{ height: ROW_H + 'px' }"
        @click="repo.selectCommit(WIP)"
      >
        <span class="flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-amber-400" />
        <span class="text-sm font-medium text-amber-300">Uncommitted changes</span>
        <span class="rounded-full bg-amber-400/20 px-2 text-[11px] text-amber-300">{{ changeCount }}</span>
      </button>

      <div class="relative flex">
        <!-- Graph gutter -->
        <svg
          class="shrink-0"
          :width="gutterWidth"
          :height="svgHeight"
          :style="{ minWidth: gutterWidth + 'px' }"
        >
          <path
            v-for="(e, i) in layout.edges"
            :key="'e' + i"
            :d="edgePath(e)"
            :style="{ stroke: e.color }"
            stroke-width="2"
            fill="none"
          />
          <circle
            v-for="n in layout.nodes"
            :key="n.hash"
            :cx="x(n.col)"
            :cy="y(n.row)"
            :r="DOT_R"
            :style="{ fill: repo.selectedHash === n.hash ? 'rgb(var(--fg-strong))' : n.color, stroke: n.color }"
            stroke-width="2.5"
          />
        </svg>

        <!-- Commit rows -->
        <div class="min-w-0 flex-1">
          <button
            v-for="(c, i) in repo.commits"
            :key="c.hash"
            class="flex w-full items-center gap-3 px-3 text-left transition-colors"
            :class="repo.selectedHash === c.hash ? 'bg-ink-800' : 'hover:bg-ink-850'"
            :style="{ height: ROW_H + 'px' }"
            @click="repo.selectCommit(c.hash)"
            @contextmenu="openContextMenu($event, c)"
          >
            <div class="flex min-w-0 flex-1 items-center gap-2">
              <template v-for="(chip, ci) in refChips(c.refs)" :key="ci">
                <span
                  class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
                  :class="
                    chip.isHead
                      ? 'bg-accent/25 text-accent-strong'
                      : chip.isTag
                        ? 'bg-amber-400/20 text-amber-300'
                        : chip.isRemote
                          ? 'bg-ink-600 text-slate-400'
                          : 'bg-green-500/20 text-green-300'
                  "
                >
                  {{ chip.isTag ? '🏷 ' : '⎇ ' }}{{ chip.label }}
                </span>
              </template>
              <span class="truncate text-sm text-slate-200">{{ c.subject }}</span>
            </div>
            <span class="shrink-0 text-[11px] text-slate-500">{{ c.author }}</span>
            <span class="w-16 shrink-0 text-right text-[11px] text-slate-600">{{ relTime(c.timestamp) }}</span>
            <span class="w-14 shrink-0 text-right font-mono text-[11px] text-slate-600">{{ c.abbrevHash }}</span>
          </button>
        </div>
      </div>
    </div>

    <CommitContextMenu
      v-if="contextMenu"
      :commit="contextMenu.commit"
      :x="contextMenu.x"
      :y="contextMenu.y"
      @close="contextMenu = null"
    />
  </div>
</template>
