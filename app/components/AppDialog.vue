<script setup lang="ts">
/** Renders the current appAlert / appConfirm / appPrompt request (stores/dialog.ts). */
const dialog = useDialogStore()
const d = computed(() => dialog.current)

const input = ref('')
const panel = ref<HTMLElement | null>(null)
const inputEl = ref<HTMLInputElement | null>(null)
const confirmBtn = ref<HTMLButtonElement | null>(null)
const cancelBtn = ref<HTMLButtonElement | null>(null)
let returnFocus: HTMLElement | null = null

watch(
  d,
  async (now, before) => {
    if (now && !before) returnFocus = document.activeElement as HTMLElement | null
    if (!now) {
      returnFocus?.focus?.()
      returnFocus = null
      return
    }
    input.value = now.defaultValue
    await nextTick()
    // Destructive confirmations focus Cancel so Enter can't destroy by accident.
    if (now.kind === 'prompt') {
      inputEl.value?.focus()
      inputEl.value?.select()
    } else if (now.danger) cancelBtn.value?.focus()
    else confirmBtn.value?.focus()
  },
  { immediate: true },
)

function ok() {
  if (!d.value) return
  if (d.value.kind === 'prompt') dialog.settle(input.value)
  else dialog.settle(true)
}
function cancel() {
  if (!d.value) return
  dialog.settle(d.value.kind === 'prompt' ? null : false)
}

// Capture phase on window: runs before (and stops) other Escape handlers, so
// the modal underneath doesn't also react to this key press.
function onKey(e: KeyboardEvent) {
  if (!d.value) return
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    cancel()
  } else if (e.key === 'Enter' && d.value.kind === 'prompt' && e.target === inputEl.value) {
    e.preventDefault()
    e.stopPropagation()
    ok()
  } else if (e.key === 'Tab' && panel.value) {
    // Keep focus inside the dialog.
    const items = [...panel.value.querySelectorAll<HTMLElement>('button, input')]
    if (!items.length) return
    const i = items.indexOf(document.activeElement as HTMLElement)
    const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : i === items.length - 1 ? 0 : i + 1
    e.preventDefault()
    items[next].focus()
  }
}
onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <div
    v-if="d"
    class="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
    @click.self="cancel"
  >
    <div
      ref="panel"
      class="w-full max-w-md rounded-xl border border-ink-700 bg-ink-900 shadow-2xl"
      :role="d.kind === 'alert' ? 'alertdialog' : 'dialog'"
      aria-modal="true"
      aria-labelledby="app-dialog-title"
      aria-describedby="app-dialog-message"
    >
      <div class="px-5 pb-4 pt-5">
        <h2 id="app-dialog-title" class="text-base font-semibold text-white">
          {{ d.title || (d.kind === 'alert' ? 'Something went wrong' : d.kind === 'prompt' ? 'Enter a value' : 'Are you sure?') }}
        </h2>
        <p id="app-dialog-message" class="mt-2 whitespace-pre-wrap break-words text-sm text-slate-300">{{ d.message }}</p>
        <input
          v-if="d.kind === 'prompt'"
          ref="inputEl"
          v-model="input"
          class="input mt-3"
          :placeholder="d.placeholder"
          aria-labelledby="app-dialog-message"
        />
      </div>
      <div class="flex justify-end gap-2 border-t border-ink-800 px-5 py-3">
        <button v-if="d.kind !== 'alert'" ref="cancelBtn" class="btn-ghost" @click="cancel">{{ d.cancelLabel }}</button>
        <button
          ref="confirmBtn"
          class="btn"
          :class="d.danger ? 'bg-[#dc2626] text-[#fff] hover:bg-[#b91c1c]' : 'bg-accent text-on-accent hover:bg-accent-soft'"
          :disabled="d.kind === 'prompt' && !input.trim()"
          @click="ok"
        >
          {{ d.confirmLabel }}
        </button>
      </div>
    </div>
  </div>
</template>
