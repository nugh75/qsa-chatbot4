import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command, mode }) => {
  // Carica le variabili d'ambiente per il modo corrente
  const env = loadEnv(mode, '.', 'VITE_')
  
  // Determina il target del backend e il nome del sito dalle variabili di ambiente
  const backendTarget = env.VITE_BACKEND_TARGET || 'http://backend:8005'
  const siteName = env.VITE_SITE_NAME || 'default'
  
  // Configurazione degli host consentiti per ogni sito
  const allowedHostsConfig: Record<string, string[]> = {
    agrusti: ['agrusti.ai4educ.org', 'agrusti-d.ai4educ.org'],
    counselorbot: ['counselorbot.ai4educ.org', 'counselorbot-d.ai4educ.org'], 
    edurag: ['edurag.ai4educ.org', 'edurag-d.ai4educ.org'],
    margottini: ['margottini.ai4educ.org', 'margottini-d.ai4educ.org'],
    pef: ['pef.ai4educ.org', 'pef-d.ai4educ.org', 'cbp.ai4educ.org', 'cbp-d.ai4educ.org'],
    default: ['cbp.ai4educ.org', 'cbp.ai4educ.org']
  }

  return {
    plugins: [react()],
    define: {
      __SITE_NAME__: JSON.stringify(siteName)
    },
    server: {
      host: true,
      port: 5175,
      allowedHosts: allowedHostsConfig[siteName] || allowedHostsConfig.default,
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
          secure: false
        }
      }
    },
    build: {
      target: 'es2020',
      sourcemap: true, // temporaneo per debug produzione
      chunkSizeWarningLimit: 900,
      outDir: `dist-${siteName}`
    },
    preview: { 
      port: 5175,
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
          secure: false
        }
      }
    }
  }
})
