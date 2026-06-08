import { test, expect } from './fixtures'
import { readTourState } from './tour-state'
import { ThreadPage } from '../pages/ThreadPage'

/**
 * The post / thread view: focused post + stats, replying, the likes list, and
 * the ancestor chain on a nested reply.
 */
test.describe('Tour 04 — thread', () => {
  test('focused post shows stats and accepts a reply', async ({ authedPage: page }) => {
    const { tourUser, seed } = readTourState()
    const thread = new ThreadPage(page)
    await thread.goto(tourUser.handle, seed.tourPostId)

    await expect(thread.focusedPost).toBeVisible()
    await expect(thread.stats).toBeVisible()
    // Seeded reply from peer is present.
    await expect(thread.repliesSection).toBeVisible()

    const replyText = `Tour reply ${Date.now()}`
    await thread.reply(replyText)
    await expect(page.getByText(replyText)).toBeVisible({ timeout: 15_000 })
  })

  test('likes stat opens the likers list', async ({ authedPage: page }) => {
    const { tourUser, seed } = readTourState()
    const thread = new ThreadPage(page)
    await thread.goto(tourUser.handle, seed.tourPostId)

    // Seeded: peer liked tourPost, so the count is clickable.
    await expect(thread.statLikes).toBeVisible()
    await thread.statLikes.click()
    await expect(page).toHaveURL(/\/likes$/, { timeout: 15_000 })
  })

  test('a nested reply shows its ancestor chain', async ({ authedPage: page }) => {
    const { tourUser, seed } = readTourState()
    const thread = new ThreadPage(page)
    // peerReply replies to tourPost — opening it should show tourPost as an ancestor.
    await thread.goto(tourUser.handle, seed.peerReplyId)

    await expect(thread.focusedPost).toBeVisible()
    await expect(thread.ancestorChain).toBeVisible()
    await expect(page.getByTestId('ancestor-card').first()).toBeVisible()
  })
})
