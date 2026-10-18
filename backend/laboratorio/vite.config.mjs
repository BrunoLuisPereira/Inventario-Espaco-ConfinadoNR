import path from 'node:path'
import { fileURLToPath } from 'node:url'
import base from '../../frontend/vite.config.js'
const config = base({ mode: 'laboratorio' })
export default {
  ...config,
  root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend'),
  envDir: false,
  server: { ...config.server, host: '127.0.0.1', port: 5174, strictPort: true,
    allowedHosts: ['127.0.0.1'],
    proxy: { '/api': { target: 'http://127.0.0.1:3001', changeOrigin: true } } },
}
