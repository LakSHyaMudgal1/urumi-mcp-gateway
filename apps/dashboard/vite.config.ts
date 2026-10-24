import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: process.env.GATEWAY_URL || 'http://localhost:4000',
        changeOrigin: true
      },
      '/mcp': {
        target: process.env.GATEWAY_URL || 'http://localhost:4000',
        changeOrigin: true
      },
      '/health': {
        target: process.env.GATEWAY_URL || 'http://localhost:4000',
        changeOrigin: true
      },
      '/healthz': {
        target: process.env.GATEWAY_URL || 'http://localhost:4000',
        changeOrigin: true
      },
      '/readyz': {
        target: process.env.GATEWAY_URL || 'http://localhost:4000',
        changeOrigin: true
      }
    }
  }
});
