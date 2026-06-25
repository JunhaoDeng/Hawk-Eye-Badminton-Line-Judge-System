import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:9000',
        changeOrigin: true,
        timeout: 300000,        // 5 min — large video file upload
        proxyTimeout: 300000,
      },
      '/screenshots': 'http://localhost:9000',
      '/results': 'http://localhost:9000',
    }
  }
})
