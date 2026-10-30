// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  devtools: { enabled: true },
  css: ['~/assets/main.css'],

  // Values here are overridden by env vars at runtime:
  // NUXT_GEMINI_API_KEY, NUXT_GEMINI_MODEL, NUXT_UPLOAD_PASSCODE, NUXT_PUBLIC_SITE_URL
  runtimeConfig: {
    geminiApiKey: '',
    geminiModel: 'gemini-3.5-flash-lite',
    uploadPasscode: '',
    public: {
      siteUrl: 'http://localhost:3000',
      siteName: 'Dataset Insights'
    }
  },

  app: {
    head: {
      htmlAttrs: { lang: 'en-GB' },
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
      link: [
        // SVG for modern browsers, .ico so legacy /favicon.ico requests don't 404
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'alternate icon', type: 'image/x-icon', href: '/favicon.ico' }
      ]
    }
  },

  nitro: {
    // Local dev: blogs are saved as JSON files in .data/blogs
    // Production: server/plugins/01.storage.ts swaps this for Upstash Redis
    devStorage: {
      blogs: { driver: 'fs', base: './.data/blogs' }
    }
  }
})
