/**
 * seed.ts — Shared API seed helpers for E2E setup.
 *
 * Thin wrappers over the real backend HTTP API (same calls the integration
 * suite exercises). Used by the tour suite's global setup to build the world a
 * UI walkthrough needs to consume: users, follow edges, posts, engagement,
 * notifications, and a DM conversation.
 *
 * Every call goes through the real backend — no mocks. A non-2xx response throws
 * with the status + body so setup fails loudly rather than seeding a broken world.
 */
import type { APIRequestContext } from '@playwright/test'

export const SEED_PASSWORD = 'E2ePass!12345'

export interface SeededUser {
  email: string
  handle: string
  displayName: string
  accessToken: string
  userId: string
}

async function expectOk(
  label: string,
  resp: Awaited<ReturnType<APIRequestContext['post']>>,
): Promise<unknown> {
  if (!resp.ok()) {
    throw new Error(`${label} failed: ${resp.status()} ${await resp.text()}`)
  }
  return resp.json()
}

/** Headers for a request WITH a JSON body. */
function auth(accessToken: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  }
}

/**
 * Headers for a bodyless POST (follow/like/repost). The backend rejects an empty
 * body when Content-Type is application/json, so we send Authorization only.
 */
function bearer(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` }
}

export async function registerUser(
  api: APIRequestContext,
  opts: { email: string; handle: string; displayName: string },
): Promise<SeededUser> {
  const resp = await api.post('/api/v1/auth/register', {
    data: { ...opts, password: SEED_PASSWORD },
    headers: { 'Content-Type': 'application/json' },
  })
  const data = (await expectOk(`register ${opts.handle}`, resp)) as {
    accessToken: string
    user: { id: string }
  }
  return { ...opts, accessToken: data.accessToken, userId: data.user.id }
}

/** PATCH /users/me — used to open DM permissions or flip privacy. */
export async function patchMe(
  api: APIRequestContext,
  accessToken: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const resp = await api.patch('/api/v1/users/me', { data: patch, headers: auth(accessToken) })
  await expectOk('patch /users/me', resp)
}

export async function createPost(
  api: APIRequestContext,
  accessToken: string,
  body: { text?: string; replyToId?: string; quoteOfId?: string; replyPolicy?: string },
): Promise<{ id: string }> {
  const resp = await api.post('/api/v1/posts', { data: body, headers: auth(accessToken) })
  const data = (await expectOk('create post', resp)) as { post: { id: string } }
  return { id: data.post.id }
}

export async function followUser(
  api: APIRequestContext,
  accessToken: string,
  handle: string,
): Promise<void> {
  const resp = await api.post(`/api/v1/users/${handle}/follow`, { headers: bearer(accessToken) })
  await expectOk(`follow ${handle}`, resp)
}

export async function likePost(
  api: APIRequestContext,
  accessToken: string,
  postId: string,
): Promise<void> {
  const resp = await api.post(`/api/v1/posts/${postId}/like`, { headers: bearer(accessToken) })
  await expectOk(`like ${postId}`, resp)
}

export async function repostPost(
  api: APIRequestContext,
  accessToken: string,
  postId: string,
): Promise<void> {
  const resp = await api.post(`/api/v1/posts/${postId}/repost`, { headers: bearer(accessToken) })
  await expectOk(`repost ${postId}`, resp)
}

export async function createConversation(
  api: APIRequestContext,
  accessToken: string,
  recipientHandle: string,
): Promise<{ id: string }> {
  const resp = await api.post('/api/v1/conversations', {
    data: { recipientHandle },
    headers: auth(accessToken),
  })
  const data = (await expectOk(`conversation with ${recipientHandle}`, resp)) as {
    conversation: { id: string }
  }
  return { id: data.conversation.id }
}

export async function sendMessage(
  api: APIRequestContext,
  accessToken: string,
  conversationId: string,
  text: string,
  clientNonce: string,
): Promise<{ id: string }> {
  const resp = await api.post(`/api/v1/conversations/${conversationId}/messages`, {
    data: { text, clientNonce },
    headers: auth(accessToken),
  })
  const data = (await expectOk('send message', resp)) as { message: { id: string } }
  return { id: data.message.id }
}
