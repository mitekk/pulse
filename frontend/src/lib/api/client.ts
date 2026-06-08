// ============================================================
// Typed fetch client
// - Sends Authorization: Bearer <accessToken> from auth store
// - Includes credentials for httpOnly refresh cookie
// - 401 interceptor: single refresh attempt, queues concurrent failures, replays on success
// - Logout + redirect to /login?returnTo= on refresh failure
// ============================================================

import type { ApiErrorBody, ApiErrorResponse } from '@/types/api'

const API_BASE = '/api/v1'

// ── API Error class ───────────────────────────────────────
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: ApiErrorBody['details'] | undefined

  constructor(
    status: number,
    code: string,
    message: string,
    details?: ApiErrorBody['details'],
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

// ── Token store interface (avoids circular import with auth store) ──
interface TokenStore {
  getAccessToken: () => string | null
  setAccessToken: (token: string | null) => void
  logout: () => void
}

let tokenStore: TokenStore | null = null

export function registerTokenStore(store: TokenStore): void {
  tokenStore = store
}

// ── Refresh state ─────────────────────────────────────────
let isRefreshing = false
type QueueEntry = { resolve: (token: string) => void; reject: (err: unknown) => void }
const refreshQueue: QueueEntry[] = []

function drainQueue(token: string): void {
  refreshQueue.forEach((entry) => entry.resolve(token))
  refreshQueue.length = 0
}

function rejectQueue(err: unknown): void {
  refreshQueue.forEach((entry) => entry.reject(err))
  refreshQueue.length = 0
}

// Reads the JS-readable csrf_token cookie for double-submit CSRF on /auth/refresh.
function readCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

async function attemptRefresh(): Promise<string> {
  const csrfToken = readCsrfToken()
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    // No request body → do NOT set Content-Type (Fastify rejects an empty
    // application/json body with 400). Send the CSRF double-submit header
    // read from the JS-readable csrf_token cookie set at login/refresh.
    headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
  })
  if (!res.ok) {
    throw new ApiError(res.status, 'REFRESH_FAILED', 'Session expired')
  }
  const data = (await res.json()) as { accessToken: string }
  return data.accessToken
}

// ── Core request function ──────────────────────────────────
export async function request<T>(
  path: string,
  options: RequestInit = {},
  isRetry = false,
): Promise<T> {
  const accessToken = tokenStore?.getAccessToken()

  const headers = new Headers(options.headers)
  // Only declare a JSON content-type when an actual body is present. A bodyless
  // POST (like/repost/bookmark/follow) with Content-Type: application/json is
  // rejected by Fastify with 400 ("Body cannot be empty…").
  if (
    options.body !== undefined &&
    options.body !== null &&
    !headers.has('Content-Type') &&
    !(options.body instanceof FormData)
  ) {
    headers.set('Content-Type', 'application/json')
  }
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }
  // CSRF double-submit for the cookie-authenticated refresh route. This is the
  // path used by the eager bootstrap refresh (authApi.refresh on app mount);
  // the lazy 401-retry path (attemptRefresh) sets the same header itself.
  if (path.startsWith('/auth/refresh') && !headers.has('X-CSRF-Token')) {
    const csrfToken = readCsrfToken()
    if (csrfToken) headers.set('X-CSRF-Token', csrfToken)
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  })

  // A 401 from the public auth endpoints themselves (refresh/login/register) is a
  // normal auth failure — logged out or bad credentials — NOT an expired-access-token
  // case. Never try to refresh (you can't refresh a refresh) and never hard-redirect:
  // doing so turns the bootstrap refresh on /login into a redirect→reload loop. Let the
  // caller handle it (the bootstrap simply shows the login form).
  const isAuthRoute =
    path.startsWith('/auth/refresh') ||
    path.startsWith('/auth/login') ||
    path.startsWith('/auth/register')

  if (res.status === 401 && !isRetry && tokenStore && !isAuthRoute) {
    // Try to refresh
    if (isRefreshing) {
      // Queue this request until refresh completes
      return new Promise<T>((resolve, reject) => {
        refreshQueue.push({
          resolve: (newToken: string) => {
            tokenStore!.setAccessToken(newToken)
            resolve(request<T>(path, options, true))
          },
          reject,
        })
      })
    }

    isRefreshing = true
    try {
      const newToken = await attemptRefresh()
      tokenStore.setAccessToken(newToken)
      drainQueue(newToken)
      return request<T>(path, options, true)
    } catch (err) {
      rejectQueue(err)
      tokenStore.logout()
      // Avoid encoding an already-login URL into returnTo — that would create an
      // exponentially growing returnTo=%2Flogin%3FreturnTo%3D... chain, ultimately
      // producing a 414 Request-URI Too Large nginx error.
      const currentPath = window.location.pathname + window.location.search
      const returnTo = currentPath.startsWith('/login') ? '' : encodeURIComponent(currentPath)
      window.location.href = returnTo ? `/login?returnTo=${returnTo}` : '/login'
      throw err
    } finally {
      isRefreshing = false
    }
  }

  if (!res.ok) {
    let errorBody: ApiErrorResponse | null = null
    try {
      errorBody = (await res.json()) as ApiErrorResponse
    } catch {
      // Not JSON
    }
    throw new ApiError(
      res.status,
      errorBody?.error?.code ?? 'UNKNOWN_ERROR',
      errorBody?.error?.message ?? `HTTP ${res.status}`,
      errorBody?.error?.details,
    )
  }

  if (res.status === 204) {
    return undefined as unknown as T
  }

  return res.json() as Promise<T>
}

// ── Convenience methods ────────────────────────────────────
export const apiClient = {
  get: <T>(path: string, init?: RequestInit) =>
    request<T>(path, { ...init, method: 'GET' }),

  post: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>(path, {
      ...init,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>(path, {
      ...init,
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  put: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>(path, {
      ...init,
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(path: string, init?: RequestInit) =>
    request<T>(path, { ...init, method: 'DELETE' }),
}
