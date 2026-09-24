import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Em desenvolvimento, /api é repassado para o back (host-back).
    // Usa 127.0.0.1 (IPv4) porque no Windows "localhost" pode virar ::1 (IPv6)
    // e o Docker publica a porta só em IPv4 -> 502 Bad Gateway.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3333',
        changeOrigin: true,
      },
    },
  },
})
