/**
 * Playwright global setup — runs once before the entire test suite.
 *
 * 1. Flushes Redis to clear rate-limit state from previous runs.
 * 2. Pre-creates all test users via the API (avoids per-spec registrations
 *    that can exceed the 10/600s rate limit on the register endpoint).
 * 3. Saves auth tokens to storageState files for reuse across spec files.
 *
 * Users created here:
 *   - AUTH_USER: used by auth.spec (login/logout/register tests use their own)
 *   - ENG_USER: used by engagement.spec (owns the engagement post)
 *   - POST_USER: used by post.spec
 *   - FOLLOW_A: user A for follow.spec
 *   - FOLLOW_B: user B for follow.spec (created by A, followed by A)
 */
import { chromium, request } from '@playwright/test'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:18080'
const PASSWORD = 'E2ePass!12345'
const STATE_DIR = path.join(__dirname, '.auth')

async function registerUser(
  apiContext: Awaited<ReturnType<typeof request.newContext>>,
  opts: { email: string; handle: string; displayName: string },
): Promise<{ accessToken: string; userId: string }> {
  const resp = await apiContext.post(`${BASE_URL}/api/v1/auth/register`, {
    data: { ...opts, password: PASSWORD },
    headers: { 'Content-Type': 'application/json' },
  })

  if (!resp.ok()) {
    const body = await resp.text()
    throw new Error(`Registration failed for ${opts.handle}: ${resp.status()} ${body}`)
  }

  const data = await resp.json() as { accessToken: string; user: { id: string } }
  return { accessToken: data.accessToken, userId: data.user.id }
}

async function postAsUser(
  apiContext: Awaited<ReturnType<typeof request.newContext>>,
  accessToken: string,
  text: string,
): Promise<string> {
  const resp = await apiContext.post(`${BASE_URL}/api/v1/posts`, {
    data: { text },
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!resp.ok()) throw new Error(`Post failed: ${resp.status()} ${await resp.text()}`)
  const data = await resp.json() as { post: { id: string } }
  return data.post.id
}

async function globalSetup() {
  // 1. Flush Redis to reset all rate-limit counters
  try {
    execSync('docker exec tweeter-redis-1 redis-cli FLUSHALL', { stdio: 'pipe' })
    console.log('[global-setup] Redis flushed — rate limit counters reset')
  } catch (err) {
    console.warn('[global-setup] Redis flush skipped:', String(err))
  }

  // Create state dir for saved auth
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true })
  }

  const api = await request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { Origin: BASE_URL },
  })

  const suffix = process.env.E2E_SUFFIX ?? Date.now().toString(36)

  // 2. Create all test users
  const users = {
    authUser: {
      email: `auth_${suffix}@e2e.test`,
      handle: `auth_${suffix}`.slice(0, 20),
      displayName: 'Auth Test User',
    },
    engUser: {
      email: `eng_${suffix}@e2e.test`,
      handle: `eng_${suffix}`.slice(0, 20),
      displayName: 'Engagement User',
    },
    postUser: {
      email: `post_${suffix}@e2e.test`,
      handle: `post_${suffix}`.slice(0, 20),
      displayName: 'Post User',
    },
    followA: {
      email: `fa_${suffix}@e2e.test`,
      handle: `fa_${suffix}`.slice(0, 20),
      displayName: 'Follow User A',
    },
    followB: {
      email: `fb_${suffix}@e2e.test`,
      handle: `fb_${suffix}`.slice(0, 20),
      displayName: 'Follow User B',
    },
  }

  console.log('[global-setup] Creating test users...')

  const authUserCreds = await registerUser(api, users.authUser)
  const engUserCreds = await registerUser(api, users.engUser)
  const postUserCreds = await registerUser(api, users.postUser)
  const followACreds = await registerUser(api, users.followA)
  const followBCreds = await registerUser(api, users.followB)

  // 3. Create the engagement post (needed by engagement.spec beforeAll)
  const engPostText = `Engagement post ${suffix}`
  await postAsUser(api, engUserCreds.accessToken, engPostText)
  console.log('[global-setup] Engagement post created:', engPostText)

  // 4. Create the follow B post (needed by follow.spec fan-out test)
  const followBPostText = `Fan out ${suffix}`
  await postAsUser(api, followBCreds.accessToken, followBPostText)
  console.log('[global-setup] Follow B post created:', followBPostText)

  await api.dispose()

  // 5. Save all credentials to a shared JSON file for specs to read
  const credsFile = path.join(STATE_DIR, 'test-users.json')
  const creds = {
    suffix,
    password: PASSWORD,
    authUser: users.authUser,
    engUser: { ...users.engUser, postText: engPostText },
    postUser: users.postUser,
    followA: users.followA,
    followB: { ...users.followB, postText: followBPostText },
  }
  fs.writeFileSync(credsFile, JSON.stringify(creds, null, 2))
  console.log('[global-setup] Credentials saved to', credsFile)
  console.log('[global-setup] Setup complete — 5 users created, storage states saved')
}

export default globalSetup
