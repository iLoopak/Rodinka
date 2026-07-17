import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts on purpose. Vitest/esbuild handles the small
// React component tests directly; individual DOM tests opt into jsdom with
// their file-level environment directive.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
