import { test, expect } from './fixtures'
import { readTourState } from './tour-state'
import { ProfilePage } from '../pages/ProfilePage'

/**
 * Profiles: own-profile tabs (posts/replies/media/likes) + follower lists, and
 * the peer profile's follow/unfollow control and overflow menu.
 */
test.describe('Tour 05 — profile', () => {
  test('own profile renders header and all tabs', async ({ authedPage: page }) => {
    const { tourUser } = readTourState()
    const profile = new ProfilePage(page)
    await profile.goto(tourUser.handle)

    await expect(profile.profilePage(tourUser.handle)).toBeVisible()
    await expect(page.getByTestId('profile-display-name')).toBeVisible()
    await expect(page.getByTestId('profile-tabs')).toBeVisible()

    for (const tab of ['replies', 'media', 'likes', 'posts']) {
      await page.getByTestId(`profile-tab-${tab}`).click()
      await expect(page).toHaveURL(
        tab === 'posts' ? new RegExp(`/@${tourUser.handle}$`) : new RegExp(`/${tab}$`),
      )
      await expect(page.getByTestId('profile-tabs')).toBeVisible()
    }
  })

  test('follower / following counts open their lists', async ({ authedPage: page }) => {
    const { tourUser, peerUser } = readTourState()
    const profile = new ProfilePage(page)
    await profile.goto(tourUser.handle)

    await profile.followersCount().click()
    await expect(page).toHaveURL(/\/(followers|following)$/)
    // peer follows tour → tour's followers list contains peer.
    await expect(page.getByText(`@${peerUser.handle}`).first()).toBeVisible({ timeout: 15_000 })
  })

  test('peer profile: unfollow then re-follow', async ({ authedPage: page }) => {
    const { peerUser } = readTourState()
    const profile = new ProfilePage(page)
    await profile.goto(peerUser.handle)
    await expect(profile.profilePage(peerUser.handle)).toBeVisible()

    // Seeded state: tour follows peer → button shows Following.
    await expect(profile.followingButton()).toBeVisible()
    await profile.unfollow()
    await expect(profile.followButton()).toBeVisible({ timeout: 15_000 })

    // Re-follow to restore the seeded state.
    await profile.followButton().click()
    await expect(profile.followingButton()).toBeVisible({ timeout: 15_000 })
  })

  test('peer profile overflow menu opens', async ({ authedPage: page }) => {
    const { peerUser } = readTourState()
    const profile = new ProfilePage(page)
    await profile.goto(peerUser.handle)

    await page.getByTestId('profile-menu-trigger').click()
    await expect(page.getByTestId('profile-menu-mute')).toBeVisible()
    await page.keyboard.press('Escape')
  })
})
