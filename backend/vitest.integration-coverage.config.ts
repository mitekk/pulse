/**
 * Vitest config for integration tests WITH coverage collection.
 *
 * This is identical to vitest.integration.config.ts but enables v8 coverage
 * output to coverage-integration/. The output is later merged with unit
 * coverage (coverage/lcov.info) by scripts/merge-coverage.mjs to produce
 * the combined 80%-lines gate.
 *
 * Do NOT use this config directly — it is called by `test:coverage:combined`.
 *
 * Run:
 *   npm run test:coverage:combined
 */
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import swc from 'unplugin-swc';

export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        parser: {
          syntax: 'typescript',
          decorators: true,
        },
        transform: {
          decoratorMetadata: true,
          legacyDecorator: true,
        },
        target: 'es2022',
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['../tests/integration/**/*.test.ts'],
    // Run integration test files sequentially to avoid DB contention between files.
    fileParallelism: false,
    // Integration tests are slower — allow 30s per test
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['lcov', 'json'],
      reportsDirectory: './coverage-integration',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/main.ts'],
      // No threshold here — threshold is enforced by scripts/merge-coverage.mjs
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
