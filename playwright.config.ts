import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E config — runs against the prod-like Dockerized stack.
 *
 * Boot command:
 *   JWT_ACCESS_SECRET=e2e_test_access_secret JWT_REFRESH_SECRET=e2e_test_refresh_secret \
 *     docker compose -f docker-compose.yml up -d --build --wait
 *
 * Frontend nginx serves on :8080 (same-origin proxy to backend :3000).
 * Do NOT set .env — the compose defaults are correct for E2E.
 */
export default defineConfig({
  testDir: './tests/e2e',

  // The UI walkthrough tour (tests/e2e/tour) is a separate, manually-invoked
  // suite with its own config (playwright.tour.config.ts). Exclude it here so
  // CI and `make test-e2e` only run the original specs.
  testIgnore: '**/tour/**',

  // Flush Redis before each run to reset auth rate-limit counters
  globalSetup: './tests/e2e/global-setup.ts',

  // Re-run failed tests once on CI; no retries locally
  retries: process.env.CI ? 1 : 0,

  // Run tests serially (1 worker) to stay within the backend auth rate limit.
  // The register endpoint allows 10 calls per 600s window per IP; with 4
  // parallel workers all hitting from the same nginx-proxied IP we exhaust
  // the limit in a single run. Serial execution keeps the count under 10 per
  // window across a typical test run.
  fullyParallel: false,
  workers: 1,

  // Fail the build on accidental .only
  forbidOnly: !!process.env.CI,

  // reporters
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:8080',

    // Collect trace on first retry, screenshots on failure
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',

    // Generous timeout for the dockerized stack
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Boot the prod-like stack before the suite.
  // Uses docker-compose.e2e.yml override which sets NODE_ENV=test (disables SSL
  // on the local postgres which has no SSL configured).
  //
  // FRONTEND_PORT defaults to 18080 to avoid port conflicts with other local
  // Docker projects. Set PLAYWRIGHT_BASE_URL if you need a different address.
  //
  // JWT secrets must be provided; all other vars use compose defaults.
  webServer: {
    command:
      'FRONTEND_PORT=18080 WEB_ORIGIN=http://localhost:18080 JWT_ACCESS_SECRET=e2e_test_access_secret JWT_REFRESH_SECRET=e2e_test_refresh_secret docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d --build --wait',
    url: process.env.PLAYWRIGHT_BASE_URL
      ? `${process.env.PLAYWRIGHT_BASE_URL}/healthz`
      : 'http://localhost:18080/healthz',
    reuseExistingServer: true,
    timeout: 240_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
