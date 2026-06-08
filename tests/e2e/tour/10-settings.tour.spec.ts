import { test, expect } from './fixtures'
import { SettingsPage } from '../pages/SettingsPage'

/**
 * Settings: edit the account form, save, and confirm the change persists across
 * a reload. Sessions list renders with the current-session badge. (We never
 * revoke — that would invalidate the session the rest of the suite relies on.)
 */
test.describe('Tour 10 — settings', () => {
  test('account edit saves and persists after reload', async ({ authedPage: page }) => {
    const settings = new SettingsPage(page)
    await settings.gotoAccount()

    const bio = `Touring PULSE — ${Date.now()}`
    await settings.bio.fill(bio)
    await settings.saveButton.click()
    await expect(settings.successMessage).toBeVisible({ timeout: 15_000 })

    await page.reload()
    await settings.accountForm.waitFor({ state: 'visible' })
    await expect(settings.bio).toHaveValue(bio)
  })

  test('sessions list shows the current session', async ({ authedPage: page }) => {
    const settings = new SettingsPage(page)
    await settings.gotoSessions()

    await expect(settings.sessions).toBeVisible()
    await expect(settings.currentBadge).toBeVisible({ timeout: 15_000 })
  })
})
