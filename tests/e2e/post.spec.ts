// ============================================================
// post.spec.ts — Post compose and thread journeys
// Uses pre-created postUser from global-setup.ts
// Shares a browser context for in-memory auth persistence.
// ============================================================

import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { HomePage } from './pages/HomePage'
import { loginAndNavigateHome } from './helpers/auth-helper'

function uniqueSuffix() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function getCreds() {
  const credsFile = path.join(__dirname, '.auth', 'test-users.json')
  return JSON.parse(fs.readFileSync(credsFile, 'utf8')) as {
    password: string
    postUser: { email: string; handle: string }
  }
}

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:18080'

let sharedContext: BrowserContext
let sharedPage: Page

test.describe('Post — compose and view', () => {
  test.beforeAll(async ({}) => {
    const { password, postUser } = getCreds()
    const browser = await chromium.launch()
    sharedContext = await browser.newContext({ baseURL: BASE_URL })
    sharedPage = await sharedContext.newPage()

    await loginAndNavigateHome(sharedContext, sharedPage, postUser.email, password)
  })

  test.afterAll(async () => {
    await sharedContext.close()
  })

  test.beforeEach(async () => {
    await sharedPage.goto('/')
    await expect(sharedPage).toHaveURL('/')
  })

  test('composes a post and it appears in the home feed with correct text', async () => {
    const page = sharedPage
    const postText = `E2E test post ${uniqueSuffix()} hello world`
    const homePage = new HomePage(page)

    await expect(homePage.composerTextarea).toBeVisible()
    await homePage.composePost(postText)

    const postCard = page.getByTestId('post-card').filter({ hasText: postText }).first()
    await expect(postCard).toBeVisible({ timeout: 10_000 })

    const cardText = await postCard.textContent()
    expect(cardText).toContain(postText)
  })

  test('post persists after page reload', async () => {
    const page = sharedPage
    const postText = `Persist test ${uniqueSuffix()}`
    const homePage = new HomePage(page)

    await expect(homePage.composerTextarea).toBeVisible()
    await homePage.composePost(postText)

    const postCard = page.getByTestId('post-card').filter({ hasText: postText }).first()
    await expect(postCard).toBeVisible({ timeout: 10_000 })

    await page.reload()
    await page.waitForLoadState('networkidle')

    const postCardAfterReload = page.getByTestId('post-card').filter({ hasText: postText }).first()
    await expect(postCardAfterReload).toBeVisible({ timeout: 10_000 })
  })

  test('clicking the post timestamp opens the thread page', async () => {
    const page = sharedPage
    const postText = `Thread nav test ${uniqueSuffix()}`
    const homePage = new HomePage(page)

    await expect(homePage.composerTextarea).toBeVisible()
    await homePage.composePost(postText)

    const postCard = page.getByTestId('post-card').filter({ hasText: postText }).first()
    await expect(postCard).toBeVisible({ timeout: 10_000 })

    const postTimeLink = postCard.locator('[data-testid^="post-time-"]').first()
    await expect(postTimeLink).toBeVisible()
    await postTimeLink.click()

    await expect(page).toHaveURL(/\/@.+\/status\/.+/)
    await expect(page.getByText(postText)).toBeVisible({ timeout: 8_000 })
  })

  test('submit button is disabled when composer textarea is empty', async () => {
    const page = sharedPage
    const homePage = new HomePage(page)
    await expect(homePage.composerSubmit).toBeVisible()
    await expect(homePage.composerSubmit).toBeDisabled()
  })

  test('composing with whitespace-only text keeps submit disabled', async () => {
    const page = sharedPage
    const homePage = new HomePage(page)
    await homePage.composerTextarea.fill('   ')
    await expect(homePage.composerSubmit).toBeDisabled()
  })
})
