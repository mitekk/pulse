import { test, expect } from './fixtures'
import { AppShellNav } from '../pages/AppShellNav'

/**
 * Runs last. Logging out must return to /login and protected routes must then
 * be blocked. Uses a fresh context from the shared storageState, so it does not
 * affect the other specs.
 */
test.describe('Tour 12 — logout', () => {
  test('logout returns to login and protected routes are blocked', async ({ authedPage: page }) => {
    const nav = new AppShellNav(page)
    await page.goto('/')
    await expect(page.getByTestId('compose-button-home')).toBeVisible()

    await nav.logout()
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })

    // Protected route now redirects back to login.
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
  })
})
