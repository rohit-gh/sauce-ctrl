import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', {
  state: () => ({
    terminalOpen: false,
    ghSetupOpen: false,
    ghCloneOpen: false,
    settingsOpen: false,
    pwaInstallOpen: false,
    unsupportedRemote: null as { remote: string; url: string } | null,
  }),
  actions: {
    toggleTerminal() {
      this.terminalOpen = !this.terminalOpen
    },
    openTerminal() {
      this.terminalOpen = true
    },
  },
})
