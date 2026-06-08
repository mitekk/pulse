import { test, expect } from '@playwright/test'
import { readTourState } from './tour-state'
import { LoginPage } from '../pages/LoginPage'

/**
 * The literal "from login" entry point. Runs WITHOUT the shared storageState so
 * it exercises the real login flow from a clean session.
 */
test.describe('Tour 00 — login', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('logs in with valid credentials and lands on the home timeline', async ({ page }) => {
    const { tourUser, password } = readTourState()
    const login = new LoginPage(page)

    await login.goto()
    await login.login(tourUser.email, password)

    await page.waitForURL('/', { timeout: 15_000 })
    await expect(page.getByTestId('compose-button-home')).toBeVisible()
  })

  test('rejects invalid credentials and stays on the login page', async ({ page }) => {
    const { tourUser } = readTourState()
    const login = new LoginPage(page)

    await login.goto()
    await login.login(tourUser.email, 'WrongPassword!000')

    // Stays unauthenticated — never reaches the authed shell.
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByTestId('compose-button-home')).toHaveCount(0)
  })
})
