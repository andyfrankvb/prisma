import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

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

  /**
   * Pruebas del frontend.
   *
   * Hasta ahora el frontend no tenía corredor propio, y por eso sus dos únicas
   * pruebas vivían en `src/tests/` del backend, alcanzando el código con rutas
   * relativas que cruzaban la frontera. No era acoplamiento de arquitectura:
   * era no tener dónde ponerlas.
   *
   * `environment: 'node'` porque lo que se prueba hoy es lógica pura —filtros,
   * formateadores, un transporte cancelable—, no componentes de React. El día
   * que se pruebe una vista habrá que cambiar a 'jsdom' y agregar la
   * dependencia; mientras tanto, no se carga un DOM que nadie usa.
   */
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
