import { test, expect } from './fixtures'
import { readTourState } from './tour-state'
import { ThreadPage } from '../pages/ThreadPage'
import { ActionBar } from '../pages/ActionBar'

/**
 * Bookmarks round-trip: bookmark a known post from its thread, confirm it shows
 * on the bookmarks page, then unbookmark and confirm it leaves the list.
 */
test.describe('Tour 09 — bookmarks', () => {
  test('bookmark a post → appears in bookmarks → unbookmark → leaves', async ({ authedPage: page }) => {
    const { tourUser, seed } = readTourState()
    const thread = new ThreadPage(page)
    await thread.goto(tourUser.handle, seed.tourPostId)

    const bar = new ActionBar(page, thread.focusedPost)
    if ((await bar.bookmark.getAttribute('aria-pressed')) !== 'true') {
      await bar.toggleBookmark()
    }
    await expect.poll(() => bar.bookmark.getAttribute('aria-pressed')).toBe('true')

    await page.goto('/bookmarks')
    await expect(page.getByTestId('bookmarks-list')).toBeVisible()
    const bookmarked = page.getByTestId('bookmarks-list').getByText(seed.tourPostText)
    await expect(bookmarked).toBeVisible({ timeout: 15_000 })

    // Unbookmark from the bookmarks list and confirm removal after reload.
    const card = page.getByTestId('post-card').filter({ hasText: seed.tourPostText }).first()
    await new ActionBar(page, card).toggleBookmark()
    await page.goto('/bookmarks')
    await expect(page.getByTestId('bookmarks-list').getByText(seed.tourPostText)).toHaveCount(0, {
      timeout: 15_000,
    })
  })
})
