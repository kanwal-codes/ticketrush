import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

// The dev server forwards API calls to the backend, so the browser sees one origin and no CORS is needed.
// In production nginx does the same job (see Dockerfile and nginx.conf).
const backend = process.env.BACKEND_URL ?? 'http://localhost:8080'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: backend, changeOrigin: true } },
  },
  preview: { port: 4173, proxy: { '/api': { target: backend, changeOrigin: true } } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Playwright owns the e2e folder.
    exclude: [...configDefaults.exclude, 'e2e/**'],
    restoreMocks: true,
  },
})
