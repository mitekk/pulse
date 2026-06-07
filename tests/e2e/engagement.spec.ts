// ============================================================
// engagement.spec.ts — Like, repost, bookmark journeys
// Uses pre-created engUser from global-setup.ts
// Shares a single browser context to keep in-memory auth state.
// ============================================================

import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { loginAndSetupRefreshIntercept } from './helpers/auth-helper'

function getCreds() {
  const credsFile = path.join(__dirname, '.auth', 'test-users.json')
  return JSON.parse(fs.readFileSync(credsFile, 'utf8')) as {
    password: string
    engUser: { email: string; handle: string; postText: string }
  }
}

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:18080'

// Shared browser context keeps in-memory Zustand auth state alive across tests
let sharedContext: BrowserContext
let sharedPage: Page

test.describe('Engagement — like, repost, bookmark', () => {
  test.beforeAll(async ({}) => {
    const { password, engUser } = getCreds()
    const browser = await chromium.launch()
    sharedContext = await browser.newContext({ baseURL: BASE_URL })
    sharedPage = await sharedContext.newPage()

    await loginAndSetupRefreshIntercept(sharedContext, sharedPage, engUser.email, password)
  })

  test.afterAll(async () => {
    // Unroute all to ignore any in-flight requests before context close
    await sharedPage.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {})
    await sharedContext.close()
  })

  test('likes a post, like button becomes active, and persists after reload', async () => {
    const page = sharedPage
    const { engUser } = getCreds()

    await page.goto(`/@${engUser.handle}`)
    const postCard = page.getByTestId('post-card').filter({ hasText: engUser.postText }).first()
    await expect(postCard).toBeVisible({ timeout: 10_000 })

    const likeButton = postCard.getByTestId('action-like')
    await expect(likeButton).toBeVisible()

    // Ensure not liked at start
    if ((await likeButton.getAttribute('aria-pressed')) === 'true') {
      await likeButton.click()
      await expect(likeButton).toHaveAttribute('aria-pressed', 'false', { timeout: 5_000 })
    }

    // Like the post
    await likeButton.click()
    await expect(likeButton).toHaveAttribute('aria-pressed', 'true', { timeout: 5_000 })

    // Reload and verify persistence — page reload triggers useBootstrap → intercepted refresh
    await page.reload()
    await page.waitForLoadState('networkidle')

    const postCardAfterReload = page.getByTestId('post-card').filter({ hasText: engUser.postText }).first()
    await expect(postCardAfterReload).toBeVisible({ timeout: 10_000 })

    const likeButtonAfterReload = postCardAfterReload.getByTestId('action-like')
    await expect(likeButtonAfterReload).toHaveAttribute('aria-pressed', 'true', { timeout: 5_000 })
  })

  test('unlikes a post after liking it', async () => {
    const page = sharedPage
    const { engUser } = getCreds()

    await page.goto(`/@${engUser.handle}`)
    const postCard = page.getByTestId('post-card').filter({ hasText: engUser.postText }).first()
    await expect(postCard).toBeVisible({ timeout: 10_000 })

    const likeButton = postCard.getByTestId('action-like')

    // Ensure liked state first (from previous test or ensure liked)
    if ((await likeButton.getAttribute('aria-pressed')) !== 'true') {
      await likeButton.click()
      await expect(likeButton).toHaveAttribute('aria-pressed', 'true', { timeout: 5_000 })
    }

    // Unlike
    await likeButton.click()
    await expect(likeButton).toHaveAttribute('aria-pressed', 'false', { timeout: 5_000 })
  })

  test('reposts a post via the repost menu', async () => {
    const page = sharedPage
    const { engUser } = getCreds()

    await page.goto(`/@${engUser.handle}`)
    const postCard = page.getByTestId('post-card').filter({ hasText: engUser.postText }).first()
    await expect(postCard).toBeVisible({ timeout: 10_000 })

    const repostButton = postCard.getByTestId('action-repost')

    // Ensure not reposted
    if ((await repostButton.getAttribute('aria-pressed')) === 'true') {
      await repostButton.click()
      const undoMenu = page.getByTestId('repost-menu')
      await expect(undoMenu).toBeVisible({ timeout: 5_000 })
      await undoMenu.getByTestId('repost-toggle').click()
      await expect(repostButton).toHaveAttribute('aria-pressed', 'false', { timeout: 10_000 })
    }

    // Repost
    await repostButton.click()
    const repostMenu = page.getByTestId('repost-menu')
    await expect(repostMenu).toBeVisible({ timeout: 5_000 })
    await repostMenu.getByTestId('repost-toggle').click()
    await expect(repostButton).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 })

    // Clean up — undo repost so subsequent tests don't see an extra repost entry in the feed
    await repostButton.click()
    const cleanupMenu = page.getByTestId('repost-menu')
    await expect(cleanupMenu).toBeVisible({ timeout: 5_000 })
    await cleanupMenu.getByTestId('repost-toggle').click()
    await expect(repostButton).toHaveAttribute('aria-pressed', 'false', { timeout: 10_000 })
  })

  test('bookmarks a post, bookmark button becomes active, persists after reload', async () => {
    const page = sharedPage
    const { engUser } = getCreds()

    await page.goto(`/@${engUser.handle}`)
    const postCard = page.getByTestId('post-card').filter({ hasText: engUser.postText }).first()
    await expect(postCard).toBeVisible({ timeout: 10_000 })

    const bookmarkButton = postCard.getByTestId('action-bookmark')

    // Ensure not bookmarked at start
    if ((await bookmarkButton.getAttribute('aria-pressed')) === 'true') {
      await bookmarkButton.click()
      await expect(bookmarkButton).toHaveAttribute('aria-pressed', 'false', { timeout: 5_000 })
    }

    // Bookmark
    await bookmarkButton.click()
    await expect(bookmarkButton).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 })

    // Reload and verify persistence
    await page.reload()
    await page.waitForLoadState('networkidle')

    const postCardAfterReload = page.getByTestId('post-card').filter({ hasText: engUser.postText }).first()
    await expect(postCardAfterReload).toBeVisible({ timeout: 10_000 })

    const bookmarkButtonAfterReload = postCardAfterReload.getByTestId('action-bookmark')
    await expect(bookmarkButtonAfterReload).toHaveAttribute('aria-pressed', 'true', { timeout: 5_000 })
    // Note: no cleanup — global-setup creates fresh users each run
  })
})
