import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'

// https://vite.dev/config/
// Migrado: se eliminó el plugin @base44/vite-plugin (hmrNotifier, visualEditAgent,
// analyticsTracker) — específico de Base44, no aplica en Vercel.
export default defineConfig({
  logLevel: 'error',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
