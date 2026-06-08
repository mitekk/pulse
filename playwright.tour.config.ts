import { defineConfig } from '@playwright/test'
import baseConfig from './playwright.config'

/**
 * UI Walkthrough Tour config — a *manually invoked* functional E2E suite that
 * logs in and drives every page + UI control against the real Dockerized stack.
 *
 * Run it with:  make test-tour   (or: npx playwright test --config=playwright.tour.config.ts)
 *
 * It deliberately reuses the base config's webServer (same docker boot), single
 * desktop-Chrome project, serial execution, and baseURL — but:
 *   - testDir points at tests/e2e/tour (kept OUT of the CI run via testIgnore in
 *     the base config), and
 *   - a richer globalSetup seeds the world AND captures a storageState, which
 *     every spec reuses so no per-spec login hits the 10/600s rate limit.
 *
 * The base e2e suite (make test-e2e / CI) never runs these specs.
 */
export default defineConfig({
  ...baseConfig,
  testDir: './tests/e2e/tour',
  // The base config ignores '**/tour/**' (to keep the tour out of CI). Clear it
  // here so this config — which IS the tour — actually picks the specs up.
  testIgnore: [],
  globalSetup: './tests/e2e/tour/tour-setup.ts',
  // Auth is provided by a worker-scoped `authedPage` fixture (tests/e2e/tour/
  // fixtures.ts) that logs in ONCE per worker. With workers:1 that's a single
  // login shared across the whole suite — rate-limit safe, and one live context
  // means the app's single-use refresh-token rotation happens in place (a shared
  // storageState can't do this: the captured token is consumed on first use).
})
