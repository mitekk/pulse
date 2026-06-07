/**
 * auth-helper.ts — Shared E2E auth utilities
 *
 * == KNOWN APP BUGS WORKED AROUND HERE ==
 *
 * BUG 1: Empty-body POST with Content-Type: application/json
 *   The frontend's apiClient always sets `Content-Type: application/json` even when
 *   the POST body is empty (undefined). Fastify rejects these with 400:
 *   "Body cannot be empty when content-type is set to 'application/json'"
 *
 *   Affected endpoints:
 *   - POST /auth/refresh  — no body, just uses httpOnly cookie
 *   - POST /posts/:id/like, /posts/:id/unlike
 *   - POST /posts/:id/repost, DELETE /posts/:id/repost
 *   - POST /posts/:id/bookmark, DELETE /posts/:id/bookmark
 *
 * BUG 2: CSRF token missing on refresh
 *   attemptRefresh() in client.ts sends no X-CSRF-Token header, so the
 *   CSRF double-submit validation on /auth/refresh always fails.
 *
 * BUG 3: auth/refresh causes page-reload logout
 *   Because /auth/refresh fails (bugs 1+2), useBootstrap can't restore auth
 *   on every page.goto(). The Zustand in-memory token is cleared on page load.
 *
 * == WORKAROUNDS ==
 *
 * 1. Intercept POST /auth/refresh and return a synthetic response with the
 *    access token captured at login time.
 *
 * 2. Intercept no-body POST endpoints and re-forward the request without the
 *    Content-Type: application/json header (so Fastify accepts it).
 */

import type { BrowserContext, Page } from '@playwright/test'

/**
 * No-body POST/DELETE endpoint patterns — these are sent with Content-Type: application/json
 * but no body, causing Fastify 400. We intercept and re-send without the header.
 *
 * Pattern: any method that calls apiClient.post/delete with no body argument.
 */
const NO_BODY_POST_PATTERNS = [
  // Engagement actions
  '**/api/v1/posts/*/like',
  '**/api/v1/posts/*/repost',
  '**/api/v1/posts/*/bookmark',
  // Follow/unfollow
  '**/api/v1/users/*/follow',
]

/**
 * Logs in via the UI on `page`, captures the access token from the login API
 * response, then installs route interceptors on `context` that:
 * 1. Serve the captured token on every POST /auth/refresh request.
 * 2. Fix no-body POST requests by stripping the Content-Type: application/json header.
 *
 * Returns the captured access token.
 */
export async function loginAndSetupRefreshIntercept(
  context: BrowserContext,
  page: Page,
  email: string,
  password: string,
): Promise<string> {
  let capturedAccessToken: string | null = null

  // Intercept the login response to capture the access token
  await context.route('**/api/v1/auth/login', async (route) => {
    const response = await route.fetch()
    const body = await response.json() as { accessToken?: string }
    if (body.accessToken) {
      capturedAccessToken = body.accessToken
    }
    await route.fulfill({ response })
  })

  // Perform UI login
  await page.goto('/login')
  await page.getByTestId('input-email-or-handle').fill(email)
  await page.getByTestId('input-password').fill(password)
  await page.getByTestId('submit-login-form').click()
  await page.waitForURL('/', { timeout: 15_000 })

  // Remove the login interceptor now that we have the token
  await context.unroute('**/api/v1/auth/login')

  if (!capturedAccessToken) {
    throw new Error('Failed to capture access token from login response')
  }

  const token = capturedAccessToken

  // Install persistent refresh interceptor — returns the captured token on every
  // POST /auth/refresh, bypassing the no-body Content-Type bug and CSRF check.
  await context.route('**/api/v1/auth/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accessToken: token }),
    })
  })

  // Fix no-body POST endpoints: re-send without Content-Type: application/json
  // so Fastify doesn't reject the empty body.
  for (const pattern of NO_BODY_POST_PATTERNS) {
    await context.route(pattern, async (route, request) => {
      const headers = { ...request.headers() }
      // Only strip Content-Type if there's no actual body
      if (!request.postData()) {
        delete headers['content-type']
      }
      const response = await route.fetch({ headers })
      await route.fulfill({ response })
    })
  }

  return token
}
