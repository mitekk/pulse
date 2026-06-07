import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.spec.ts', 'src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/main.ts'],
      // NOTE: No 80% threshold here. The coverage gate is enforced on the COMBINED
      // unit + integration run via `npm run test:coverage:combined`.
      // Unit-only coverage is ~59% by design: controllers/processors/adapters are
      // exercised by the integration suite, not unit mocks.
      // The 'json' reporter outputs coverage-final.json, used by scripts/merge-coverage.mjs.
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
