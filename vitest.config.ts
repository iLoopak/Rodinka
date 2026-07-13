import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts on purpose: tests only exercise pure
// utility functions (date/recurrence/calendar-projection logic), so no
// plugins, JSX, or DOM environment are needed here.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
})
