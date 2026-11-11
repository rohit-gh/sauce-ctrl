<script setup lang="ts">
/**
 * Vertical drag handle that resizes the panel next to it.
 * `panel="left"`: the panel is to the left of the handle (drag right = wider).
 * `panel="right"`: the panel is to the right of the handle (drag left = wider).
 * Keyboard: ←/→ (Shift = bigger steps), Home/End = min/max, Enter = reset.
 * Double-click also resets to the default width.
 */
const props = defineProps<{
  value: number
  min: number
  max: number
  default: number
  panel: 'left' | 'right'
  label: string
}>()
const emit = defineEmits<{ resize: [px: number] }>()

const dragging = ref(false)
let startX = 0
let startW = 0

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  e.preventDefault()
  dragging.value = true
  startX = e.clientX
  startW = props.value
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}
function onPointerMove(e: PointerEvent) {
  if (!dragging.value) return
  const dx = e.clientX - startX
  emit('resize', startW + (props.panel === 'left' ? dx : -dx))
}
function onPointerUp(e: PointerEvent) {
  if (!dragging.value) return
  dragging.value = false
  ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

function onKey(e: KeyboardEvent) {
  const step = e.shiftKey ? 64 : 16
  // "Wider" is → for a left panel and ← for a right panel.
  const grow = props.panel === 'left' ? 'ArrowRight' : 'ArrowLeft'
  const shrink = props.panel === 'left' ? 'ArrowLeft' : 'ArrowRight'
  let next: number | null = null
  if (e.key === grow) next = props.value + step
  else if (e.key === shrink) next = props.value - step
  else if (e.key === 'Home') next = props.min
  else if (e.key === 'End') next = props.max
  else if (e.key === 'Enter') next = props.default
  if (next === null) return
  e.preventDefault()
  emit('resize', next)
}

onBeforeUnmount(() => {
  if (dragging.value) {
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
})
</script>

<template>
  <div
    role="separator"
    aria-orientation="vertical"
    :aria-label="label"
    :aria-valuenow="value"
    :aria-valuemin="min"
    :aria-valuemax="max"
    tabindex="0"
    :title="`${label} — drag, or double-click to reset`"
    class="group relative z-20 -mx-1 w-2 shrink-0 cursor-col-resize touch-none outline-none"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @dblclick="emit('resize', props.default)"
    @keydown="onKey"
  >
    <!-- 1px line centred in an 8px hit area; highlighted on hover, drag and keyboard focus. -->
    <div
      class="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors"
      :class="dragging ? 'w-0.5 bg-accent' : 'bg-ink-800 group-hover:w-0.5 group-hover:bg-accent/70 group-focus-visible:w-0.5 group-focus-visible:bg-accent'"
    />
  </div>
</template>
