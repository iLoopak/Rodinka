import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    ...(mode === 'analyze' ? [visualizer({
      filename: 'dist/bundle-report.html',
      gzipSize: true,
      brotliSize: true,
      open: false,
    })] : []),
  ],
  build: {
    manifest: true,
  },
}))
