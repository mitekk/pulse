/**
 * Vitest config for integration tests.
 * Runs against a real Postgres + Redis — do NOT include unit spec files.
 *
 * Uses unplugin-swc to enable emitDecoratorMetadata for NestJS DI + TypeORM decorators.
 *
 * Run:
 *   npm run test:integration
 *
 * Prerequisites:
 *   1. Start infra:
 *      docker compose -f docker-compose.yml -f docker-compose.test.yml up -d db redis
 *   2. Run migrations on tweeter_test DB:
 *      DATABASE_URL=postgresql://tweeter:tweeter@localhost:5433/tweeter_test npm run migration:run
 *   3. Run tests:
 *      npm run test:integration
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
    // Do NOT enforce coverage thresholds on integration suite
    coverage: {
      enabled: false,
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
