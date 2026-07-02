<script setup lang="ts">
const ui = useUiStore()
const { canInstall, supportsAutoPrompt, installed, browser, server, install, checkServer } =
  usePwaInstall()

const copied = ref('')
async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = text
    setTimeout(() => (copied.value = ''), 1500)
  } catch {}
}

const installing = ref(false)
const installResult = ref<'accepted' | 'dismissed' | 'unavailable' | ''>('')
async function doInstall() {
  installing.value = true
  try {
    installResult.value = await install()
  } finally {
    installing.value = false
  }
}

const buildCmd = 'bun run build'
const startCmd = 'bun run start'
const bgCmd = 'nohup bun run start > ~/.sauce-ctrl/server.log 2>&1 &'
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
    @click.self="ui.pwaInstallOpen = false"
  >
    <div class="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-ink-700 bg-ink-900 shadow-2xl">
      <div class="flex items-center justify-between border-b border-ink-800 px-5 py-4">
        <div class="flex items-center gap-2">
          <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-soft text-xs font-bold text-white">
            S
          </div>
          <h2 class="text-base font-semibold text-white">Install as an app</h2>
        </div>
        <button class="text-slate-500 hover:text-white" title="Close" @click="ui.pwaInstallOpen = false">✕</button>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <p class="mb-4 text-[13px] text-slate-400">
          SauceControl can run in its own window like a native app. It stays a thin client —
          the local server keeps running in the background and does all the Git work.
        </p>

        <!-- Status cards -->
        <div class="mb-4 grid grid-cols-2 gap-3">
          <div class="rounded-lg border border-ink-700 bg-ink-850 p-3">
            <div class="text-[11px] uppercase tracking-wider text-slate-500">Local server</div>
            <div class="mt-1 flex items-center gap-2 text-sm">
              <span
                class="h-2 w-2 rounded-full"
                :class="{
                  'bg-green-400': server === 'nitro',
                  'bg-amber-400': server === 'static',
                  'bg-red-400': server === 'offline',
                  'bg-slate-500': server === 'checking',
                }"
              />
              <span class="text-slate-200">
                {{
                  server === 'nitro'
                    ? 'Running (API reachable)'
                    : server === 'static'
                      ? 'Static build — no API'
                      : server === 'offline'
                        ? 'Unreachable'
                        : 'Checking…'
                }}
              </span>
            </div>
          </div>
          <div class="rounded-lg border border-ink-700 bg-ink-850 p-3">
            <div class="text-[11px] uppercase tracking-wider text-slate-500">App</div>
            <div class="mt-1 flex items-center gap-2 text-sm">
              <span
                class="h-2 w-2 rounded-full"
                :class="installed ? 'bg-green-400' : canInstall ? 'bg-accent' : 'bg-slate-500'"
              />
              <span class="text-slate-200">
                {{ installed ? 'Installed' : canInstall ? 'Ready to install' : 'Not installed' }}
              </span>
            </div>
          </div>
        </div>

        <!-- Warn when viewing the static export without an API -->
        <div
          v-if="server === 'static'"
          class="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-300"
        >
          This page is being served without the API (e.g. <code>serve .output/public</code>).
          Installing now would give you an app that can't talk to Git. Start the full server with
          <code>bun run start</code> first, then reload.
        </div>

        <div class="space-y-4 text-sm">
          <!-- Step 1 -->
          <div>
            <p class="mb-1 font-medium text-slate-200">1. Start the server (keep it running)</p>
            <p class="mb-2 text-[12px] text-slate-400">
              Build once, then start the server. Leave it running in the background — the app needs it.
            </p>
            <div class="space-y-2">
              <div class="flex items-center gap-2 rounded-md bg-ink-950 p-2 font-mono text-[11px] text-slate-400">
                <code class="flex-1">{{ buildCmd }}</code>
                <button class="btn-subtle !py-0.5 !text-[11px]" @click="copy(buildCmd)">
                  {{ copied === buildCmd ? 'Copied' : 'Copy' }}
                </button>
              </div>
              <div class="flex items-center gap-2 rounded-md bg-ink-950 p-2 font-mono text-[11px] text-slate-400">
                <code class="flex-1">{{ startCmd }}</code>
                <button class="btn-subtle !py-0.5 !text-[11px]" @click="copy(startCmd)">
                  {{ copied === startCmd ? 'Copied' : 'Copy' }}
                </button>
              </div>
            </div>
            <p class="mt-2 text-[11px] text-slate-500">
              Prefer it detached? Run it in the background instead:
            </p>
            <div class="mt-1 flex items-start gap-2 rounded-md bg-ink-950 p-2 font-mono text-[11px] text-slate-400">
              <code class="min-w-0 flex-1 whitespace-pre-wrap break-all">{{ bgCmd }}</code>
              <button class="btn-subtle shrink-0 !py-0.5 !text-[11px]" @click="copy(bgCmd)">
                {{ copied === bgCmd ? 'Copied' : 'Copy' }}
              </button>
            </div>
            <p class="mt-1 text-[11px] text-slate-500">Then open <code>http://localhost:3000</code>.</p>
          </div>

          <!-- Step 2 -->
          <div>
            <p class="mb-1 font-medium text-slate-200">2. Install the app</p>

            <div
              v-if="installed"
              class="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-[12px] text-green-300"
            >
              SauceControl is installed. Launch it from your applications or taskbar/dock.
            </div>

            <template v-else>
              <!-- One-click install (Chromium) -->
              <div v-if="supportsAutoPrompt">
                <button
                  class="btn-primary w-full justify-center"
                  :disabled="!canInstall || installing"
                  @click="doInstall"
                >
                  {{ installing ? 'Waiting for confirmation…' : 'Install SauceControl' }}
                </button>
                <p v-if="!canInstall" class="mt-1 text-[11px] text-slate-500">
                  If the button is disabled, your browser hasn't offered installation yet — use the
                  install icon in the address bar, or reload the page after the server is running.
                </p>
                <p v-else-if="installResult === 'dismissed'" class="mt-1 text-[11px] text-amber-400">
                  Installation dismissed. You can try again anytime.
                </p>
              </div>

              <!-- Manual steps by browser -->
              <ul v-else class="list-disc space-y-1 pl-5 text-[12px] text-slate-400">
                <template v-if="browser === 'safari'">
                  <li>Click the <b>Share</b> button in the toolbar.</li>
                  <li>Choose <b>Add to Dock</b> (macOS) or <b>Add to Home Screen</b> (iOS).</li>
                </template>
                <template v-else-if="browser === 'firefox'">
                  <li>Firefox desktop has limited PWA support.</li>
                  <li>
                    For the best experience, open SauceControl in a Chromium browser (Chrome, Edge, Brave)
                    and use its install option.
                  </li>
                </template>
                <template v-else>
                  <li>Open your browser menu (⋮).</li>
                  <li>Choose <b>Install app</b> / <b>Add to Home screen</b>, or click the install icon in the address bar.</li>
                </template>
              </ul>
            </template>
          </div>

          <!-- Step 3 -->
          <div>
            <p class="mb-1 font-medium text-slate-200">3. Use it like a native app</p>
            <ul class="list-disc space-y-1 pl-5 text-[12px] text-slate-400">
              <li>It opens in its own window with no browser chrome.</li>
              <li>Pin it to your taskbar or dock for quick access.</li>
              <li>Keep the server from step 1 running whenever you use the app.</li>
            </ul>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-between border-t border-ink-800 px-5 py-3">
        <span class="text-[11px] text-slate-500">Runs fully locally — nothing leaves your machine.</span>
        <div class="flex gap-2">
          <button class="btn-subtle" @click="checkServer">Re-check</button>
          <button class="btn-primary" @click="ui.pwaInstallOpen = false">Done</button>
        </div>
      </div>
    </div>
  </div>
</template>
