/**
 * auth-helper.ts — Shared E2E auth utilities
 *
 * Logs in via the UI and waits for the home page to confirm authentication.
 * No route interception — all requests go through the real backend.
 *
 * BUG-3 (Content-Type on bodyless POSTs) and BUG-4 (CSRF on /auth/refresh) are
 * fixed in application code (frontend/src/lib/api/client.ts). The workarounds
 * that previously intercepted those requests have been removed.
 */

import type { BrowserContext, Page } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Logs in via the UI on `page` and waits until the home page confirms the user
 * is authenticated (compose button visible). No route interception is installed.
 */
export async function loginAndNavigateHome(
  _context: BrowserContext,
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto('/login')
  await page.getByTestId('input-email-or-handle').fill(email)
  await page.getByTestId('input-password').fill(password)
  await page.getByTestId('submit-login-form').click()
  await page.waitForURL('/', { timeout: 15_000 })
  // Confirm the authenticated UI is rendered before proceeding
  await expect(page.getByTestId('compose-button-home')).toBeVisible({ timeout: 10_000 })
}
