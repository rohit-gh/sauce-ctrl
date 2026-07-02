// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: ['@pinia/nuxt', '@nuxtjs/tailwindcss', '@vite-pwa/nuxt'],

  // SauceControl is a local, desktop-style client (terminals, websockets,
  // filesystem). Run as a client-rendered SPA to avoid SSR pitfalls.
  ssr: false,

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      title: 'SauceControl',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }
      ],
    },
  },

  runtimeConfig: {
    public: {
      // Dedicated port for the interactive terminal WebSocket server.
      wsPort: Number(process.env.SAUCE_WS_PORT || 3009),
    },
  },

  // Installable PWA so users can run SauceControl in its own window while the
  // Nitro server (git/gh/db + terminal WS) runs in the background. Because the
  // API lives on the same origin, the service worker must never intercept it.
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'SauceControl',
      short_name: 'SauceControl',
      description: 'A local Git GUI — Git, but pleasant.',
      lang: 'en',
      theme_color: '#18181b',
      background_color: '#18181b',
      display: 'standalone',
      start_url: '/',
      scope: '/',
      icons: [
        { src: '/pwa-64x64.png', sizes: '64x64', type: 'image/png' },
        { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        { src: '/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      // The API and terminal WS are dynamic and server-only — keep them off the
      // SPA navigation fallback so the SW never serves index.html for them.
      navigateFallback: '/',
      navigateFallbackDenylist: [/^\/api\//],
      // Take control immediately and purge precaches from previous builds so a
      // rebuild never leaves the page pinned to stale (now-404) asset URLs.
      clientsClaim: true,
      skipWaiting: true,
      cleanupOutdatedCaches: true,
    },
    // Do NOT register the service worker during `nuxt dev`: dev and the
    // production server share the same origin (localhost:3000), so a dev SW
    // would keep serving stale dev assets after `bun run start`. Install/test
    // the PWA against a real build (`bun run build && bun run start`).
    devOptions: {
      enabled: false,
    },
  },

  typescript: {
    strict: true,
  },
})
