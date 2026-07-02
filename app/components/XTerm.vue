<script setup lang="ts">
const props = defineProps<{ cwd?: string }>()
const emit = defineEmits<{ exit: [] }>()

const theme = useThemeStore()
const termEl = ref<HTMLElement | null>(null)
let term: any = null
let fit: any = null
let ws: WebSocket | null = null
let resizeObserver: ResizeObserver | null = null

// Build an xterm theme from the active palette's CSS variables so the terminal
// matches whatever theme is selected.
function themeColors() {
  const styles = getComputedStyle(document.documentElement)
  const channels = (name: string, fallback: string) => {
    const v = styles.getPropertyValue(name).trim()
    return v ? `rgb(${v})` : fallback
  }
  return {
    background: channels('--ink-950', '#0b0e14'),
    foreground: '#cbd5e1',
    cursor: channels('--accent', '#4f9dff'),
    selectionBackground: channels('--ink-600', '#2e3847'),
  }
}

function sendResize() {
  if (ws?.readyState === WebSocket.OPEN && term) {
    ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
  }
}

onMounted(async () => {
  const { Terminal } = await import('@xterm/xterm')
  const { FitAddon } = await import('@xterm/addon-fit')

  term = new Terminal({
    fontFamily: '"Anonymous Pro", ui-monospace, monospace',
    fontSize: 13,
    cursorBlink: true,
    theme: themeColors(),
  })
  fit = new FitAddon()
  term.loadAddon(fit)
  term.open(termEl.value!)
  fit.fit()

  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const wsPort = useRuntimeConfig().public.wsPort

  // Fetch the per-run terminal token over the same-origin API. Cross-site pages
  // cannot read this response, so they cannot open a shell even if they guess
  // the WebSocket port.
  let token = ''
  try {
    const res = await $fetch<{ token: string | null }>('/api/terminal/token')
    token = res?.token || ''
  } catch {}

  const query = token ? `?token=${encodeURIComponent(token)}` : ''
  ws = new WebSocket(`${proto}://${location.hostname}:${wsPort}${query}`)

  ws.onmessage = (ev) => {
    let msg: any
    try {
      msg = JSON.parse(ev.data)
    } catch {
      return
    }
    if (msg.type === 'ready') {
      ws!.send(JSON.stringify({ type: 'init', cwd: props.cwd, cols: term.cols, rows: term.rows }))
    } else if (msg.type === 'data') {
      term.write(msg.data)
    } else if (msg.type === 'exit') {
      term.write('\r\n\x1b[33m[process exited]\x1b[0m\r\n')
      emit('exit')
    } else if (msg.type === 'error') {
      term.write(`\r\n\x1b[31m${msg.message}\x1b[0m\r\n`)
    }
  }

  term.onData((data: string) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', data }))
  })

  resizeObserver = new ResizeObserver(() => {
    try {
      fit.fit()
      sendResize()
    } catch {}
  })
  resizeObserver.observe(termEl.value!)
})

// Restyle the live terminal when the theme changes.
watch(
  () => theme.current,
  () => {
    if (term) term.options.theme = themeColors()
  },
)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  ws?.close()
  term?.dispose()
})
</script>

<template>
  <div ref="termEl" class="h-full w-full" />
</template>
