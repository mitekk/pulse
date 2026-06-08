import { test, expect } from './fixtures'
import { readTourState } from './tour-state'
import { AppShellNav } from '../pages/AppShellNav'

/**
 * The navigation backbone: from home, click every left-rail destination and
 * assert the right page actually renders (root testid + URL). Then exercise the
 * theme toggle and the user menu → profile shortcut.
 */
test.describe('Tour 01 — navigation', () => {
  // `root` is a stable page-root testid; bookmarks has none for the empty state
  // (its InfiniteList only renders `bookmarks-list` once populated), so it
  // asserts the always-present heading instead.
  const destinations: Array<{ nav: string; url: RegExp; root?: string; heading?: string }> = [
    { nav: 'explore', url: /\/explore$/, root: 'explore-page' },
    { nav: 'notifications', url: /\/notifications$/, root: 'notifications-page' },
    { nav: 'messages', url: /\/messages$/, root: 'messages-page' },
    { nav: 'bookmarks', url: /\/bookmarks$/, heading: 'Bookmarks' },
    { nav: 'settings', url: /\/settings/, root: 'settings-hub' },
  ]

  test('every nav destination renders its page', async ({ authedPage: page }) => {
    const nav = new AppShellNav(page)
    await page.goto('/')
    await expect(page.getByTestId('home-timeline')).toBeVisible()

    for (const dest of destinations) {
      await nav.navItem(dest.nav).click()
      await expect(page).toHaveURL(dest.url)
      const target = dest.root
        ? page.getByTestId(dest.root)
        : page.getByRole('heading', { name: dest.heading! })
      await expect(target).toBeVisible({ timeout: 15_000 })
    }

    // Back home
    await nav.navItem('home').click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByTestId('home-timeline')).toBeVisible()
  })

  test('theme toggle flips the document theme', async ({ authedPage: page }) => {
    const nav = new AppShellNav(page)
    await page.goto('/')
    const html = page.locator('html')

    const before = await html.getAttribute('data-theme')
    await nav.themeToggle.click()
    await expect
      .poll(async () => html.getAttribute('data-theme'))
      .not.toBe(before)
  })

  test('user menu opens the profile', async ({ authedPage: page }) => {
    const { tourUser } = readTourState()
    const nav = new AppShellNav(page)
    await page.goto('/')

    await nav.openUserMenu()
    await nav.menuProfile.click()

    await expect(page).toHaveURL(new RegExp(`/@${tourUser.handle}$`))
    await expect(page.getByTestId(`profile-page-${tourUser.handle}`)).toBeVisible()
  })
})
