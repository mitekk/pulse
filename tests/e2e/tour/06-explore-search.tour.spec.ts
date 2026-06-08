import { test, expect } from './fixtures'
import { readTourState } from './tour-state'

/**
 * Discovery surfaces: explore, the tag timeline, search result tabs, and the
 * search typeahead — all verified against the seeded #hashtag post and peer user.
 */
test.describe('Tour 06 — explore & search', () => {
  test('explore page renders', async ({ authedPage: page }) => {
    await page.goto('/explore')
    await expect(page.getByTestId('explore-page')).toBeVisible()
  })

  test('tag timeline shows posts for the seeded hashtag', async ({ authedPage: page }) => {
    const { seed } = readTourState()
    await page.goto(`/tag/${seed.hashtag}`)
    await expect(page.getByTestId(`tag-timeline-page-${seed.hashtag}`)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(seed.hashtagPostText)).toBeVisible({ timeout: 15_000 })
  })

  test('search "latest" returns the hashtag post', async ({ authedPage: page }) => {
    const { seed } = readTourState()
    await page.goto(`/search?q=${encodeURIComponent('#' + seed.hashtag)}`)
    await expect(page.getByTestId('search-page')).toBeVisible()
    await expect(page.getByTestId('search-tabs')).toBeVisible()

    await page.getByTestId('search-tab-latest').click()
    await expect(page.getByTestId('search-results-latest')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(seed.hashtagPostText)).toBeVisible({ timeout: 15_000 })
  })

  test('search "people" returns the peer user', async ({ authedPage: page }) => {
    const { peerUser } = readTourState()
    await page.goto(`/search?q=${encodeURIComponent(peerUser.handle)}`)
    await page.getByTestId('search-tab-people').click()
    await expect(page.getByTestId('search-results-people')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(`@${peerUser.handle}`).first()).toBeVisible({ timeout: 15_000 })
  })

  test('typeahead suggests the peer user', async ({ authedPage: page }) => {
    const { peerUser } = readTourState()
    await page.goto('/search')
    const input = page.getByTestId('search-input').first()
    await input.fill(peerUser.handle)
    await expect(page.getByTestId('search-typeahead-dropdown')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId(`suggest-user-${peerUser.handle}`)).toBeVisible({ timeout: 15_000 })
  })
})
