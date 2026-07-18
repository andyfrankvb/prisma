import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path  from 'path';

export default defineConfig({
  plugins: [react()],

  // Alias: dentro del contenedor src/frontend/ se copia como src_frontend/
  resolve: {
    alias: {
      '@frontend': path.resolve(__dirname, 'src_frontend'),
    },
  },

  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api':   { target: 'http://app_api:3000', changeOrigin: true },
      '/ws':    { target: 'ws://app_api:3000',   ws: true           },
      '/files': { target: 'http://app_api:3000', changeOrigin: true },
    },
  },

  build: { outDir: 'dist' },
});
