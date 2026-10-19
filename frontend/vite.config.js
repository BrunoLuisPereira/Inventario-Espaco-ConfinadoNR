import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

export default defineConfig(({ mode }) => ({
  envDir: false,
  plugins: [react()],

  server: {
    fs: { allow: [fileURLToPath(new URL('.', import.meta.url)), fileURLToPath(new URL('../shared/permissoes.json', import.meta.url))] },
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,

    allowedHosts: [
      '.trycloudflare.com',
    ],

    proxy: mode === 'demo' ? undefined : {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
}))
