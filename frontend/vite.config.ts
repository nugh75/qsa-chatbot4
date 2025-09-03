import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command, mode }) => ({
  plugins: [react()],
  server: {
    host: true,
    port: 5175,
    allowedHosts: ['cbp.ai4educ.org'],
    proxy: {
      '/api': {
        target: 'http://backend:8005',
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    target: 'es2020',
    sourcemap: true, // temporaneo per debug produzione
    chunkSizeWarningLimit: 900
  },
  preview: { port: 5175 }
}))
