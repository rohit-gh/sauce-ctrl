<script setup lang="ts">
import { THEMES } from '~/stores/theme'

const ui = useUiStore()
const theme = useThemeStore()
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" @click.self="ui.settingsOpen = false">
    <div class="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-ink-700 bg-ink-900 shadow-2xl">
      <div class="flex items-center justify-between border-b border-ink-800 px-5 py-4">
        <div>
          <h2 class="text-base font-semibold text-white">Settings</h2>
          <p class="text-[11px] text-slate-500">Personalize how SauceControl looks.</p>
        </div>
        <button class="text-slate-500 hover:text-white" title="Close" @click="ui.settingsOpen = false">✕</button>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <section>
          <h3 class="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Theme</h3>
          <p class="mb-3 text-[11px] text-slate-500">Your choice is saved and restored next time you open the app.</p>

          <div class="grid grid-cols-2 gap-3">
            <button
              v-for="t in THEMES"
              :key="t.id"
              class="flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors"
              :class="theme.current === t.id ? 'border-accent bg-accent/10' : 'border-ink-700 hover:bg-ink-800'"
              @click="theme.set(t.id)"
            >
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium text-slate-100">{{ t.name }}</span>
                <span
                  v-if="theme.current === t.id"
                  class="rounded-full bg-accent/20 px-2 text-[10px] font-medium text-accent"
                >
                  Active
                </span>
              </div>
              <div class="flex gap-1.5">
                <span
                  v-for="(c, i) in t.swatch"
                  :key="i"
                  class="h-6 w-6 rounded-md border border-black/20"
                  :style="{ backgroundColor: c }"
                />
              </div>
              <span class="text-[11px] text-slate-500">{{ t.description }}</span>
            </button>
          </div>
        </section>

        <section class="mt-6 border-t border-ink-800 pt-4">
          <h3 class="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Desktop app</h3>
          <p class="mb-3 text-[11px] text-slate-500">
            Install SauceControl as a standalone app that runs in its own window while the local
            server works in the background.
          </p>
          <button class="btn-subtle" @click="ui.settingsOpen = false; ui.pwaInstallOpen = true">
            Install as an app…
          </button>
        </section>
      </div>

      <div class="flex justify-end border-t border-ink-800 px-5 py-3">
        <button class="btn-primary" @click="ui.settingsOpen = false">Done</button>
      </div>
    </div>
  </div>
</template>
