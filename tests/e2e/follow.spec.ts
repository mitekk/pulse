// ============================================================
// follow.spec.ts — Follow/unfollow journeys
// Uses pre-created followA and followB from global-setup.ts
// Shares a browser context for in-memory auth persistence.
// ============================================================

import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { ProfilePage } from './pages/ProfilePage'
import { loginAndSetupRefreshIntercept } from './helpers/auth-helper'

function getCreds() {
  const credsFile = path.join(__dirname, '.auth', 'test-users.json')
  return JSON.parse(fs.readFileSync(credsFile, 'utf8')) as {
    password: string
    followA: { email: string; handle: string }
    followB: { email: string; handle: string; postText: string }
  }
}

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:18080'

let sharedContext: BrowserContext
let sharedPage: Page

test.describe('Follow — A follows B, feed fan-out', () => {
  test.beforeAll(async ({}) => {
    const { password, followA } = getCreds()
    const browser = await chromium.launch()
    sharedContext = await browser.newContext({ baseURL: BASE_URL })
    sharedPage = await sharedContext.newPage()

    await loginAndSetupRefreshIntercept(sharedContext, sharedPage, followA.email, password)
  })

  test.afterAll(async () => {
    await sharedContext.close()
  })

  test.beforeEach(async () => {
    // Ensure A is NOT following B at the start of each test (clean slate)
    const { followB } = getCreds()
    const page = sharedPage
    const profilePage = new ProfilePage(page)
    await profilePage.goto(followB.handle)
    await expect(profilePage.profilePage(followB.handle)).toBeVisible({ timeout: 8_000 })

    // Check if currently following (text content = "Following")
    const isFollowing = await profilePage.followingButton().isVisible().catch(() => false)
    if (isFollowing) {
      await profilePage.unfollow()
      await expect(profilePage.followButton()).toBeVisible({ timeout: 8_000 })
    }

    await page.goto('/')
  })

  test("following user B increments followers count on B's profile", async () => {
    const page = sharedPage
    const { followB } = getCreds()
    const profilePage = new ProfilePage(page)
    await profilePage.goto(followB.handle)
    await expect(profilePage.profilePage(followB.handle)).toBeVisible({ timeout: 8_000 })

    const followersCountEl = profilePage.followersCount()
    await expect(followersCountEl).toBeVisible()
    const initialText = (await followersCountEl.textContent()) ?? '0'
    const initialCount = parseInt(initialText.replace(/\D/g, ''), 10) || 0

    // Follow B
    const followBtn = profilePage.followButton()
    await expect(followBtn).toBeVisible()
    await followBtn.click()

    // Transitions to following
    await expect(profilePage.followingButton()).toBeVisible({ timeout: 8_000 })

    // Followers count increments
    await expect(followersCountEl).toHaveText(
      new RegExp(String(initialCount + 1)),
      { timeout: 8_000 },
    )

    // Reload and verify persistence
    await profilePage.goto(followB.handle)
    await expect(profilePage.profilePage(followB.handle)).toBeVisible({ timeout: 8_000 })
    await expect(profilePage.followingButton()).toBeVisible({ timeout: 5_000 })
  })

  test('unfollowing user B removes following state', async () => {
    const page = sharedPage
    const { followB } = getCreds()
    const profilePage = new ProfilePage(page)
    await profilePage.goto(followB.handle)
    await expect(profilePage.profilePage(followB.handle)).toBeVisible({ timeout: 8_000 })

    // Follow first
    const followBtn = profilePage.followButton()
    await expect(followBtn).toBeVisible()
    await followBtn.click()
    await expect(profilePage.followingButton()).toBeVisible({ timeout: 8_000 })

    // Unfollow (with confirm dialog)
    await profilePage.unfollow()
    await expect(profilePage.followButton()).toBeVisible({ timeout: 8_000 })
  })

  test("A's home feed shows B's post after following B", async () => {
    const page = sharedPage
    const { followB } = getCreds()
    const profilePage = new ProfilePage(page)
    await profilePage.goto(followB.handle)
    await expect(profilePage.profilePage(followB.handle)).toBeVisible({ timeout: 8_000 })

    // Follow B
    const followBtn = profilePage.followButton()
    await expect(followBtn).toBeVisible()
    await followBtn.click()
    await expect(profilePage.followingButton()).toBeVisible({ timeout: 8_000 })

    // Check home feed for B's pre-created post
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await expect(
      page.getByTestId('post-card').filter({ hasText: followB.postText }).first(),
    ).toBeVisible({ timeout: 15_000 })
  })
})
