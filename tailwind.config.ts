import type { Config } from 'tailwindcss'

// Colors are driven by CSS variables (see app/assets/css/main.css) so themes can
// be swapped at runtime. Each variable holds space-separated RGB channels, which
// lets Tailwind's opacity modifiers (e.g. bg-accent/20) keep working.
const withVar = (name: string) => `rgb(var(${name}) / <alpha-value>)`

export default <Partial<Config>>{
  theme: {
    extend: {
      colors: {
        // Text + status colours follow the theme (see app/assets/css/main.css).
        white: withVar('--fg-strong'),
        slate: {
          100: withVar('--fg-100'),
          200: withVar('--fg-200'),
          300: withVar('--fg-300'),
          400: withVar('--fg-400'),
          500: withVar('--fg-500'),
          600: withVar('--fg-600'),
        },
        red: { 200: withVar('--red-200'), 300: withVar('--red-300'), 400: withVar('--red-400') },
        green: { 200: withVar('--green-200'), 300: withVar('--green-300'), 400: withVar('--green-400') },
        amber: { 200: withVar('--amber-200'), 300: withVar('--amber-300'), 400: withVar('--amber-400') },
        blue: { 200: withVar('--blue-200'), 300: withVar('--blue-300'), 400: withVar('--blue-400') },
        'on-accent': withVar('--on-accent'),
        ink: {
          line: withVar('--ink-line'),
          950: withVar('--ink-950'),
          900: withVar('--ink-900'),
          850: withVar('--ink-850'),
          800: withVar('--ink-800'),
          700: withVar('--ink-700'),
          600: withVar('--ink-600'),
          500: withVar('--ink-500'),
        },
        accent: {
          DEFAULT: withVar('--accent'),
          soft: withVar('--accent-soft'),
          // Accent-coloured text on accent tints (badges); contrast-checked per theme.
          strong: withVar('--accent-strong'),
        },
      },
      fontFamily: {
        sans: ['"Montserrat Variable"', 'Montserrat', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Anonymous Pro"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
}
