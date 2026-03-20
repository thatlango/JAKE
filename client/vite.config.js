import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'JAKE — Personal OS',
        short_name: 'JAKE',
        description: 'Tuku-Tuku Labs Personal Operating System',
        theme_color: '#07090F',
        background_color: '#07090F',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ],
        share_target: {
          action: '/share-target',
          method: 'POST',
          enctype: 'application/x-www-form-urlencoded',
          params: { title: 'title', text: 'text', url: 'url' }
        },
        shortcuts: [
          { name: 'Dashboard',        url: '/?module=dashboard' },
          { name: 'Personal Finance', url: '/?module=personal-finance' },
          { name: 'Pipeline',         url: '/?module=pipeline' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        runtimeCaching: [
          { urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i, handler:'CacheFirst', options:{ cacheName:'google-fonts', expiration:{ maxEntries:10, maxAgeSeconds:31536000 } } },
          { urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,   handler:'CacheFirst', options:{ cacheName:'gstatic-fonts',  expiration:{ maxEntries:10, maxAgeSeconds:31536000 } } }
        ]
      }
    })
  ],
  // No proxy needed — Netlify redirects /api/* to serverless functions
  server: {
    port: 5173,
    proxy: {
      // For local dev only — comment out when testing against deployed Netlify
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/auth': { target: 'http://localhost:3001', changeOrigin: true },
      '/share-target': { target: 'http://localhost:3001', changeOrigin: true }
    }
  }
});
