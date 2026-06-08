import { test, expect } from './fixtures'
import { ActionBar } from '../pages/ActionBar'

/**
 * Engagement controls on the home timeline: like, bookmark, repost (via menu),
 * plus the refresh control. Each toggle is asserted to actually change the
 * button's pressed state — not just be clickable.
 */
test.describe('Tour 03 — timeline engagement', () => {
  test('like toggles on and off', async ({ authedPage: page }) => {
    await page.goto('/')
    const card = page.getByTestId('post-card').first()
    await expect(card).toBeVisible()
    const bar = new ActionBar(page, card)

    const before = await bar.like.getAttribute('aria-pressed')
    await bar.toggleLike()
    await expect.poll(() => bar.like.getAttribute('aria-pressed')).not.toBe(before)
    await bar.toggleLike()
    await expect.poll(() => bar.like.getAttribute('aria-pressed')).toBe(before)
  })

  test('bookmark toggles on and off', async ({ authedPage: page }) => {
    await page.goto('/')
    const card = page.getByTestId('post-card').first()
    const bar = new ActionBar(page, card)

    const before = await bar.bookmark.getAttribute('aria-pressed')
    await bar.toggleBookmark()
    await expect.poll(() => bar.bookmark.getAttribute('aria-pressed')).not.toBe(before)
    await bar.toggleBookmark()
    await expect.poll(() => bar.bookmark.getAttribute('aria-pressed')).toBe(before)
  })

  test('repost via the menu, then undo', async ({ authedPage: page }) => {
    await page.goto('/')
    const card = page.getByTestId('post-card').first()
    const bar = new ActionBar(page, card)

    const before = await bar.repost.getAttribute('aria-pressed')
    await bar.toggleRepost()
    await expect.poll(() => bar.repost.getAttribute('aria-pressed')).not.toBe(before)
    // Undo so the feed isn't left mutated for later specs.
    await bar.toggleRepost()
    await expect.poll(() => bar.repost.getAttribute('aria-pressed')).toBe(before)
  })

  test('refresh control keeps the timeline rendered', async ({ authedPage: page }) => {
    await page.goto('/')
    await page.getByTestId('timeline-refresh').click()
    await expect(page.getByTestId('home-timeline')).toBeVisible()
    await expect(page.getByTestId('post-card').first()).toBeVisible({ timeout: 15_000 })
  })
})
