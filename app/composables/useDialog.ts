/**
 * Promise-based replacements for window.alert / confirm / prompt, rendered by
 * AppDialog.vue. Always use these — the native ones are no-ops in the macOS
 * desktop app (see app/stores/dialog.ts).
 */
interface DialogOptions {
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

export async function appAlert(message: string, opts: DialogOptions = {}): Promise<void> {
  await useDialogStore().open({ kind: 'alert', message, ...opts })
}

export async function appConfirm(message: string, opts: DialogOptions = {}): Promise<boolean> {
  return (await useDialogStore().open({ kind: 'confirm', message, ...opts })) === true
}

export async function appPrompt(
  message: string,
  opts: DialogOptions & { defaultValue?: string; placeholder?: string } = {},
): Promise<string | null> {
  const v = await useDialogStore().open({ kind: 'prompt', message, ...opts })
  return typeof v === 'string' ? v : null
}

/** Show an error from a failed $fetch / git call. */
export function alertError(err: any, fallback: string) {
  return appAlert(err?.data?.statusMessage || err?.message || fallback, { title: fallback })
}
