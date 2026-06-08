import { test, expect } from './fixtures'

/**
 * Notifications: the seeded follow / like / reply from peer should appear, and
 * the All / Mentions tabs should both render.
 */
test.describe('Tour 07 — notifications', () => {
  test('shows seeded notifications', async ({ authedPage: page }) => {
    await page.goto('/notifications')
    await expect(page.getByTestId('notifications-page')).toBeVisible()
    await expect(page.locator('[data-testid^="notification-item-"]').first()).toBeVisible({
      timeout: 15_000,
    })
  })

  test('All and Mentions tabs both render', async ({ authedPage: page }) => {
    await page.goto('/notifications')
    await expect(page.getByTestId('notifications-tabs')).toBeVisible()

    await page.getByTestId('notifications-tab-mentions').click()
    await expect(page).toHaveURL(/\/notifications\/mentions$/)
    await expect(page.getByTestId('notifications-page')).toBeVisible()

    await page.getByTestId('notifications-tab-all').click()
    await expect(page.getByTestId('notifications-page')).toBeVisible()
  })
})
