// ============================================================
// auth.spec.ts — Critical auth journeys
// Pre-created users (from global-setup.ts) are used for login tests.
// The "register a new user" test creates its own unique user.
// ============================================================

import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { RegisterPage } from './pages/RegisterPage'
import { LoginPage } from './pages/LoginPage'
import { HomePage } from './pages/HomePage'

function uniqueSuffix() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function getCreds() {
  const credsFile = path.join(__dirname, '.auth', 'test-users.json')
  return JSON.parse(fs.readFileSync(credsFile, 'utf8')) as {
    password: string
    authUser: { email: string; handle: string; displayName: string }
  }
}

test.describe('Auth — register → logout → login', () => {
  test('login page shows register link', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await expect(loginPage.registerLink).toBeVisible()
  })

  test('register page shows login link', async ({ page }) => {
    const registerPage = new RegisterPage(page)
    await registerPage.goto()
    await expect(registerPage.loginLink).toBeVisible()
  })

  test('protected route redirects to /login when not authenticated', async ({ page }) => {
    await page.goto('/bookmarks')
    await expect(page).toHaveURL(/\/login/)
  })

  test('invalid credentials show error feedback', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.login('nobody_at_all@example.com', 'wrongpassword123')
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByTestId('compose-button-home')).not.toBeVisible()
  })

  test('registers a new user and lands on home', async ({ page }) => {
    const regSuffix = uniqueSuffix()
    const registerPage = new RegisterPage(page)
    await registerPage.goto()
    await registerPage.register({
      displayName: `New User ${regSuffix}`,
      email: `new_${regSuffix}@e2e.test`,
      handle: `new_${regSuffix}`.slice(0, 20),
      password: 'E2ePass!12345',
    })
    await expect(page).toHaveURL('/')
    await expect(page.getByTestId('user-menu-trigger').last()).toBeVisible()
  })

  test('session persists after page reload (BUG-4 regression guard)', async ({ page }) => {
    // This test exercises the full in-memory-token → /auth/refresh (cookie + CSRF)
    // → restored-session path. A failed refresh would redirect to /login.
    const { password, authUser } = getCreds()
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.login(authUser.email, password)
    await expect(page).toHaveURL('/')
    await expect(page.getByTestId('compose-button-home')).toBeVisible({ timeout: 10_000 })

    // Reload — clears the in-memory Zustand store; useBootstrap must re-hydrate via
    // POST /auth/refresh using the httpOnly cookie + CSRF double-submit header.
    await page.reload()
    await page.waitForLoadState('networkidle')

    // If still on '/' with the compose button, the refresh succeeded.
    await expect(page).toHaveURL('/')
    await expect(page.getByTestId('compose-button-home')).toBeVisible({ timeout: 10_000 })
  })

  test('full cycle: login with email → logout → login with handle', async ({ page }) => {
    const { password, authUser } = getCreds()

    // Login with email
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.login(authUser.email, password)
    await expect(page).toHaveURL('/')
    await expect(page.getByTestId('user-menu-trigger').last()).toBeVisible()

    // Logout
    const homePage = new HomePage(page)
    await homePage.logout()

    // Protected route should redirect to login
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)

    // Login with handle
    await loginPage.goto()
    await loginPage.login(authUser.handle, password)
    await expect(page).toHaveURL('/')
    await expect(page.getByTestId('user-menu-trigger').last()).toBeVisible()
  })
})
