import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react({ jsxRuntime: 'automatic' })],
  resolve: { dedupe: ['react', 'react-dom'] },
  optimizeDeps: { force: true, include: ['react', 'react-dom'] },
  esbuild: { target: 'es2020' },
  server: {
    port: 5175,
    headers: { 'Cache-Control': 'no-store' },
    proxy: {
      '/api': {
        target: 'http://localhost:8005',
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react')) return 'vendor-react'
            if (id.includes('@mui')) return 'vendor-mui'
            if (id.includes('lodash')) return 'vendor-lodash'
            if (id.includes('date-fns')) return 'vendor-datefns'
            return 'vendor'
          }
        }
      }
    },
    chunkSizeWarningLimit: 900
  },
  preview: { port: 5175 }
})
