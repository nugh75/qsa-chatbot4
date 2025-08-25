import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react({ jsxRuntime: 'automatic' })],
  resolve: { dedupe: ['react', 'react-dom'] },
  optimizeDeps: { force: true, include: ['react', 'react-dom'] },
  esbuild: { target: 'es2020' },
  server: {
    port: 5175,
    headers: { 'Cache-Control': 'no-store' }
  },
  build: { target: 'es2020' },
  preview: { port: 5175 }
})
