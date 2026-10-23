import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Read the Buy Me a Coffee username from the repo's FUNDING.yml so the
// in-app support button and the GitHub sponsor button stay in sync.
function readFundingUrl() {
  const fromEnv = process.env.VITE_BUY_ME_A_COFFEE_URL
  if (fromEnv && /^https:\/\/buymeacoffee\.com\/[A-Za-z0-9_-]+\/?$/.test(fromEnv)) return fromEnv
  try {
    const yaml = fs.readFileSync(path.resolve(__dirname, '../.github/FUNDING.yml'), 'utf-8')
    const match = yaml.match(/^buy_me_a_coffee:\s*([A-Za-z0-9_-]+)\s*$/m)
    return match ? `https://buymeacoffee.com/${match[1]}` : ''
  } catch {
    return ''
  }
}

export default defineConfig({
  define: {
    __FUNDING_URL__: JSON.stringify(readFundingUrl()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'favicon-32.png',
        'apple-touch-icon.png',
        'icons/favicon-16.png',
        'icons/favicon-32.png',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/maskable-icon-192.png',
        'icons/maskable-icon-512.png',
        'logo-icon.svg',
      ],
      manifest: {
        name: 'Doorway',
        short_name: 'Doorway',
        description: 'One small step at a time. An energy-aware academic planner.',
        theme_color: '#6366f1',
        background_color: '#0f1020',
        display: 'standalone',
        start_url: '/',
        orientation: 'portrait',
        categories: ['productivity', 'lifestyle'],
        icons: [
          {
            src: '/icons/favicon-16.png',
            sizes: '16x16',
            type: 'image/png',
          },
          {
            src: '/icons/favicon-32.png',
            sizes: '32x32',
            type: 'image/png',
          },
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/maskable-icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icons/maskable-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // index.html is deliberately left out of precaching: a precached
        // shell is served straight from the service worker's own cache on
        // every navigation, bypassing the Cache-Control headers on
        // /index.html (see vercel.json) entirely. That let a stale shell
        // referencing deleted hashed asset URLs get stuck serving forever
        // on tabs with an already-installed service worker. Leaving html
        // off this list means navigation requests hit the network (or the
        // browser's own HTTP cache, which does respect those headers)
        // instead of the precache. vite-plugin-pwa otherwise defaults to a
        // navigateFallback of 'index.html', which registers a Workbox
        // NavigationRoute serving all navigations from the precache too --
        // disable that as well so navigations are never SW-intercepted.
        navigateFallback: undefined,
        globPatterns: ['**/*.{js,css,ico,png,svg}'],
        globIgnores: ['**/audio/**', '**/sounds/**'],
        runtimeCaching: [
          {
            urlPattern: /\.mp3$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'audio-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
          {
            urlPattern: /^https:\/\/.*\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 5,
              },
              networkTimeoutSeconds: 10,
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
