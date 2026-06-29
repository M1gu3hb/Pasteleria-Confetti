import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// https://vite.dev/config/
// Migrado: se eliminó el plugin @base44/vite-plugin (hmrNotifier, visualEditAgent,
// analyticsTracker) — específico de Base44, no aplica en Vercel.
//
// PWA (app instalable en tablets) — vite-plugin-pwa:
//   - registerType 'autoUpdate' + skipWaiting/clientsClaim → las tablets instaladas reciben la
//     versión nueva al desplegar (nunca se quedan pegadas en una versión vieja).
//   - El service worker PRECACHEA SOLO el shell de la app (JS/CSS/HTML/íconos del build).
//   - 🔴 NUNCA cachea datos: las llamadas a *.supabase.co son NetworkOnly → el POS SIEMPRE lee
//     datos EN VIVO (datos viejos cacheados = descuadre de dinero).
//   - manifest:false → se usa el manifest estático (public/manifest.json) ya enlazado en index.html.
export default defineConfig({
  logLevel: 'error',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: false, // usamos public/manifest.json (Confetti) ya enlazado en index.html
      includeAssets: ['pwa-192.png', 'pwa-512.png', 'maskable-512.png', 'apple-touch-icon.png', 'manifest.json'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2}'],
        navigateFallback: '/index.html',
        // No interceptar como navegación nada de Supabase ni rutas de API.
        navigateFallbackDenylist: [/^\/api\//, /supabase\.co/],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          {
            // 🔴 CRÍTICO: TODO Supabase (datos, auth, storage, realtime) SIEMPRE en vivo.
            urlPattern: ({ url }) => url.hostname.endsWith('supabase.co'),
            handler: 'NetworkOnly',
            options: { cacheName: 'supabase-networkonly' },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
