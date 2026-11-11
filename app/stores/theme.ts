import { defineStore } from 'pinia'

export interface ThemeOption {
  id: string
  name: string
  description: string
  mode: 'dark' | 'light'
  // Small swatch preview: [background, surface, accent]
  swatch: [string, string, string]
}

// Colours live in app/assets/css/main.css ([data-theme='…']); every text/background
// pair there is checked for WCAG AA contrast.
export const THEMES: ThemeOption[] = [
  {
    id: 'charcoal',
    name: 'Charcoal',
    description: 'Neutral charcoal gray with a calm teal accent.',
    mode: 'dark',
    swatch: ['#18181b', '#2a2a2f', '#56b6c2'],
  },
  {
    id: 'dark-blue',
    name: 'Dark Blue',
    description: 'The original deep navy palette with a bright blue accent.',
    mode: 'dark',
    swatch: ['#0b0e14', '#1a2029', '#4f9dff'],
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Deep evergreen with a fresh mint accent.',
    mode: 'dark',
    swatch: ['#0e1512', '#1d2b24', '#4fd1a1'],
  },
  {
    id: 'plum',
    name: 'Plum',
    description: 'Dusky aubergine with a soft orchid accent.',
    mode: 'dark',
    swatch: ['#151019', '#291f32', '#e08ef0'],
  },
  {
    id: 'daylight',
    name: 'Daylight',
    description: 'Crisp cool white with a confident blue accent.',
    mode: 'light',
    swatch: ['#eef1f5', '#ffffff', '#1d58c7'],
  },
  {
    id: 'sand',
    name: 'Sand',
    description: 'Warm paper tones with a terracotta accent.',
    mode: 'light',
    swatch: ['#f2ece2', '#fffdf9', '#943f1b'],
  },
]

export const DEFAULT_THEME = 'charcoal'
const STORAGE_KEY = 'sauce-ctrl:theme'

function isValid(id: string | null): id is string {
  return !!id && THEMES.some((t) => t.id === id)
}

export const useThemeStore = defineStore('theme', {
  state: () => ({
    current: DEFAULT_THEME as string,
  }),
  getters: {
    active(state): ThemeOption {
      return THEMES.find((t) => t.id === state.current) ?? THEMES[0]
    },
  },
  actions: {
    apply(id: string) {
      if (import.meta.client) {
        document.documentElement.setAttribute('data-theme', id)
      }
    },
    set(id: string) {
      if (!isValid(id)) return
      this.current = id
      this.apply(id)
      if (import.meta.client) {
        try {
          localStorage.setItem(STORAGE_KEY, id)
        } catch {
          // ignore storage failures (private mode, etc.)
        }
      }
    },
    /** Read the persisted theme (or default) and apply it. Call once on startup. */
    init() {
      let saved: string | null = null
      if (import.meta.client) {
        try {
          saved = localStorage.getItem(STORAGE_KEY)
        } catch {
          saved = null
        }
      }
      this.current = isValid(saved) ? saved : DEFAULT_THEME
      this.apply(this.current)
    },
  },
})
