import { test as base, expect, type Page } from '@playwright/test'
import { readTourState } from './tour-state'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:8080'

/**
 * `authedPage` — a single browser page, logged in as tourUser, shared across the
 * whole worker. With workers:1 the entire tour authenticates with ONE login,
 * which stays under the 10/600s login rate limit and keeps a single live context
 * so the app's single-use refresh-token rotation works (a shared storageState
 * can't: the captured refresh token is consumed/rotated on first use, leaving
 * every other context unauthenticated).
 *
 * Tests opt in by destructuring `{ authedPage: page }`. Each test should start
 * with its own `page.goto(...)`, since the page is shared and stateful.
 */
export const test = base.extend<object, { authedPage: Page }>({
  authedPage: [
    async ({ browser }, use) => {
      const context = await browser.newContext({ baseURL: BASE_URL })
      const page = await context.newPage()
      const { tourUser, password } = readTourState()

      await page.goto('/login')
      await page.getByTestId('input-email-or-handle').fill(tourUser.email)
      await page.getByTestId('input-password').fill(password)
      await page.getByTestId('submit-login-form').click()
      await page.waitForURL('/', { timeout: 15_000 })
      await page.getByTestId('compose-button-home').waitFor({ state: 'visible', timeout: 10_000 })

      await use(page)
      await context.close()
    },
    { scope: 'worker' },
  ],
})

export { expect }
