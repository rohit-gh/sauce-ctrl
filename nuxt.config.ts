// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: ['@pinia/nuxt', '@nuxtjs/tailwindcss'],

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
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '512x512', href: '/favicon.png' },
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
      ],
    },
  },

  runtimeConfig: {
    public: {
      // Dedicated port for the interactive terminal WebSocket server.
      wsPort: Number(process.env.SAUCE_WS_PORT || 3009),
    },
  },

  typescript: {
    strict: true,
  },
})
