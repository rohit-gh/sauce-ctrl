import { defineStore } from 'pinia'
import { markRaw } from 'vue'

/**
 * In-app replacement for window.alert/confirm/prompt.
 *
 * The native dialogs don't work in the macOS desktop app: Tauri's WKWebView
 * (wry) doesn't implement WebKit's JS dialog delegate, so alert() shows
 * nothing, confirm() returns false and prompt() returns null — instantly.
 * Use appAlert / appConfirm / appPrompt (app/composables/useDialog.ts).
 */
export interface DialogRequest {
  kind: 'alert' | 'confirm' | 'prompt'
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  /** Style the confirm button as destructive. */
  danger: boolean
  /** prompt only */
  defaultValue: string
  placeholder: string
  resolve: (value: string | boolean | null) => void
}

export const useDialogStore = defineStore('dialog', {
  state: () => ({
    queue: [] as DialogRequest[],
  }),
  getters: {
    current: (s): DialogRequest | null => s.queue[0] ?? null,
  },
  actions: {
    open(req: Partial<Omit<DialogRequest, 'resolve'>> & { kind: DialogRequest['kind']; message: string }) {
      return new Promise<string | boolean | null>((resolve) => {
        this.queue.push({
          title: '',
          confirmLabel: req.kind === 'alert' ? 'OK' : 'Confirm',
          cancelLabel: 'Cancel',
          danger: false,
          defaultValue: '',
          placeholder: '',
          ...req,
          resolve: markRaw(resolve),
        })
      })
    },
    /** Close the current dialog. `value`: true/false (confirm), text/null (prompt). */
    settle(value: string | boolean | null) {
      const d = this.queue.shift()
      d?.resolve(value)
    },
  },
})
