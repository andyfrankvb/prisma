/**
 * Vitest configuration
 * File: vitest.config.ts
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals:     true,
    environment: 'node',

    /**
     * Solo las pruebas del backend.
     *
     * Sin este `include`, vitest usa su patrón por omisión desde la raíz y barre
     * TAMBIÉN `frontend/`. Se notó al mover las dos pruebas del frontend a su
     * propio proyecto: dejaron de importar código del backend, pero el corredor
     * del backend las seguía ejecutando. El acoplamiento no había desaparecido,
     * solo había cambiado de forma.
     *
     *   · raíz      → `npm run test`            → solo src/
     *   · frontend/ → `cd frontend && npm test` → solo frontend/src/
     *
     * El día que esto se parta en dos repositorios, ninguno arrastra pruebas
     * del otro.
     */
    include: ['src/**/*.test.ts'],

    // Load .env.test for integration tests
    env: { NODE_ENV: 'test' },

    // Separate pools: unit tests run in parallel, integration tests run serially
    // to avoid DB race conditions
    poolOptions: {
      threads: {
        singleThread: false,
      },
    },

    // Coverage
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include:  [
        'src/utils/**',
        'src/modules/**',
        'src/notifications/**',
      ],
      exclude: [
        'src/tests/**',
        '**/*.types.ts',
      ],
    },
  },
});
