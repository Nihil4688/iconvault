// Vite config. Enables the React plugin, Tailwind, and dev server options for the client; also holds the Vitest settings.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // The accessibility tests render whole screens and run axe on them; on a busy machine the default 5 seconds is too tight.
    testTimeout: 20000,
  },
})
