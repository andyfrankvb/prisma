/**
 * Vitest configuration
 * File: vitest.config.ts
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals:     true,
    environment: 'node',

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
