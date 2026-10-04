import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(
      JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version,
    ),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/echarts/') || id.includes('\\node_modules\\echarts\\')) {
            return 'analytics-charts';
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    watch: {
      ignored: ['**/qa/**'],
    },
  },
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Траектория',
        short_name: 'Траектория',
        description: 'Личные записи о состоянии, действиях и важных событиях',
        theme_color: '#102d2c',
        background_color: '#f3f1eb',
        display: 'standalone',
        id: '/',
        scope: '/',
        start_url: '/today',
        lang: 'ru',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api(?:\/|$)/, /^\/assets(?:\/|$)/],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
});
