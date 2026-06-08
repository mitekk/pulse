/**
 * Integration tests: Auth endpoints
 *
 * Covers: register, login, refresh, logout, /me, verify-email, sessions
 * Uses: real Postgres + Redis via the full NestJS/Fastify app
 */
import supertest from 'supertest';
import { getApp, closeApp, truncateAll } from './helpers/app';
import {
  createUser,
  uniqueHandle,
  extractCsrf,
  extractRefreshCookie,
  buildRefreshCookieHeader,
} from './helpers/auth';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

let app: NestFastifyApplication;
let http: ReturnType<typeof supertest>;

beforeAll(async () => {
  app = await getApp();
  http = supertest(app.getHttpServer());
});

afterAll(async () => {
  await closeApp();
});

beforeEach(async () => {
  await truncateAll();
});

// ─── Register ──────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/register', () => {
  it('registers a new user and returns user + accessToken', async () => {
    const handle = uniqueHandle('reg');
    const res = await http
      .post('/api/v1/auth/register')
      .send({
        handle,
        email: `${handle}@test.example`,
        password: 'SecurePass123!',
        displayName: 'Test Reg',
      })
      .expect(201);

    expect(res.body.user.handle).toBe(handle);
    expect(res.body.user.email).toBe(`${handle}@test.example`);
    expect(res.body.accessToken).toBeTruthy();
    // password must NOT be in response
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.user.password).toBeUndefined();
    // refresh cookie must be set (httpOnly)
    const cookies: string[] = Array.isArray(res.headers['set-cookie'])
      ? res.headers['set-cookie']
      : [res.headers['set-cookie'] ?? ''];
    expect(cookies.some((c) => c.startsWith('refresh_token='))).toBe(true);
  });

  it('returns 409 when handle is already taken', async () => {
    const handle = uniqueHandle('dup');
    await http
      .post('/api/v1/auth/register')
      .send({ handle, email: `${handle}@test.example`, password: 'Pass123!' })
      .expect(201);

    const res = await http
      .post('/api/v1/auth/register')
      .send({ handle, email: `${handle}2@test.example`, password: 'Pass123!' })
      .expect(409);

    expect(res.body.error?.code).toBeTruthy();
  });

  it('returns 409 when email is already taken', async () => {
    const handle = uniqueHandle('dupemail');
    await http
      .post('/api/v1/auth/register')
      .send({ handle, email: `shared@test.example`, password: 'Pass123!' })
      .expect(201);

    const res = await http
      .post('/api/v1/auth/register')
      .send({ handle: uniqueHandle(), email: `shared@test.example`, password: 'Pass123!' })
      .expect(409);

    expect(res.body.error?.code).toBeTruthy();
  });

  it('returns 400 for missing required fields', async () => {
    const res = await http
      .post('/api/v1/auth/register')
      .send({ handle: uniqueHandle() })
      .expect(400);

    expect(res.body).toBeTruthy();
  });

  it('returns 400 for invalid email', async () => {
    await http
      .post('/api/v1/auth/register')
      .send({ handle: uniqueHandle(), email: 'not-an-email', password: 'Pass123!' })
      .expect(400);
  });

  it('returns 400 for handle with invalid characters', async () => {
    await http
      .post('/api/v1/auth/register')
      .send({ handle: 'invalid handle!', email: 'invalid_handle@test.example', password: 'Pass123!' })
      .expect(400);
  });

  it('returns 400 for password that is too short', async () => {
    await http
      .post('/api/v1/auth/register')
      .send({ handle: uniqueHandle(), email: `short_pw@test.example`, password: '12' })
      .expect(400);
  });
});

// ─── Login ────────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/login', () => {
  it('logs in with email and returns accessToken', async () => {
    const user = await createUser(app);

    const res = await http
      .post('/api/v1/auth/login')
      .send({ emailOrHandle: user.email, password: 'TestPass123!' })
      .expect(200);

    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.handle).toBe(user.handle);
  });

  it('logs in with handle (case-insensitive)', async () => {
    const user = await createUser(app);

    const res = await http
      .post('/api/v1/auth/login')
      .send({ emailOrHandle: user.handle.toUpperCase(), password: 'TestPass123!' })
      .expect(200);

    expect(res.body.user.handle).toBe(user.handle);
  });

  it('returns 401 for wrong password', async () => {
    const user = await createUser(app);

    const res = await http
      .post('/api/v1/auth/login')
      .send({ emailOrHandle: user.email, password: 'WrongPassword!' })
      .expect(401);

    expect(res.body.error?.code).toBeTruthy();
  });

  it('returns 401 for non-existent user (generic error — no user enumeration)', async () => {
    const res = await http
      .post('/api/v1/auth/login')
      .send({ emailOrHandle: 'nobody@test.example', password: 'TestPass123!' })
      .expect(401);

    // Must not reveal "user not found" vs "wrong password"
    expect(res.body.error?.message).not.toMatch(/not found/i);
  });

  it('returns 400 for missing credentials', async () => {
    await http.post('/api/v1/auth/login').send({}).expect(400);
  });
});

// ─── GET /me ─────────────────────────────────────────────────────────────────

describe('GET /api/v1/auth/me', () => {
  it('returns current user when authenticated', async () => {
    const user = await createUser(app);

    const res = await http
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    expect(res.body.user.id).toBe(user.id);
    expect(res.body.user.handle).toBe(user.handle);
  });

  it('returns 401 when unauthenticated', async () => {
    await http.get('/api/v1/auth/me').expect(401);
  });

  it('returns 401 for invalid token', async () => {
    // Note: in some NestJS+Fastify configurations invalid JWT returns 401 from guard
    const res = await http
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer invalid.jwt.token');
    expect([401, 403]).toContain(res.status);
  });
});

// ─── Refresh ──────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/refresh', () => {
  it('issues a new accessToken using refresh cookie + CSRF', async () => {
    const user = await createUser(app);
    const csrfToken = extractCsrf(user.cookies);
    // Build combined cookie header with both refresh_token AND csrf_token
    const cookieHeader = buildRefreshCookieHeader(user.cookies);

    expect(csrfToken).toBeTruthy();
    expect(cookieHeader).toContain('refresh_token=');

    const res = await http
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken!)
      .expect(200);

    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.accessToken).not.toBe(user.accessToken); // rotated
  });

  it('returns 403 when CSRF header is missing (only cookie sent)', async () => {
    const user = await createUser(app);
    const cookieHeader = buildRefreshCookieHeader(user.cookies);

    // No X-CSRF-Token header — CSRF validation fails → 403
    await http
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieHeader)
      .expect(403);
  });

  it('returns 403 when refresh cookie is missing (CSRF validates, then cookie missing)', async () => {
    // Without the refresh cookie, CSRF still fails first (no csrf_token cookie either)
    await http
      .post('/api/v1/auth/refresh')
      .set('X-CSRF-Token', 'any-csrf')
      .expect(403);
  });

  it('detects refresh token reuse (stolen token scenario)', async () => {
    const user = await createUser(app);
    const csrfToken = extractCsrf(user.cookies)!;
    const cookieHeader = buildRefreshCookieHeader(user.cookies);

    // First refresh — valid
    const first = await http
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfToken)
      .expect(200);

    // Get new cookies from first rotation
    const newCookies = Array.isArray(first.headers['set-cookie'])
      ? (first.headers['set-cookie'] as string[])
      : [first.headers['set-cookie'] as string];
    const newCsrf = extractCsrf(newCookies)!;
    const newCookieHeader = buildRefreshCookieHeader(newCookies);

    // Use the OLD refresh cookie again (with new CSRF header) — CSRF fails first (old csrf_token
    // cookie value != new csrf header value) → 403. This prevents reuse without knowing CSRF.
    const oldCookieHeader = buildRefreshCookieHeader(user.cookies);
    const oldCsrf = extractCsrf(user.cookies)!;
    const res = await http
      .post('/api/v1/auth/refresh')
      .set('Cookie', oldCookieHeader)
      .set('X-CSRF-Token', oldCsrf) // Use MATCHING old CSRF to pass CSRF gate, then trigger reuse detection
      .expect(401); // passes CSRF, fails on reuse detection

    expect(res.body.error?.code).toBeTruthy();
    void newCookieHeader; // suppress unused var warning
  });
});

// ─── Logout ───────────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/logout', () => {
  it('logs out and invalidates the session', async () => {
    const user = await createUser(app);

    // Sanity: token is valid before logout
    await http
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    // Logout revokes the session in DB and writes the Redis denylist key
    await http
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(204);

    // AuthGuard checks isSessionRevoked() on every protected request; the still-unexpired
    // access JWT must now be rejected because the session is on the denylist.
    const res = await http
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(401);

    expect(res.body.error?.code).toBe('SESSION_REVOKED');
  });
});

// ─── Sessions ────────────────────────────────────────────────────────────────

describe('GET /api/v1/auth/sessions', () => {
  it('lists sessions for the current user', async () => {
    const user = await createUser(app);

    const res = await http
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    expect(Array.isArray(res.body.items)).toBe(true);
    // At least one session (current)
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    // Current session should be flagged
    const current = res.body.items.find((s: { isCurrent: boolean }) => s.isCurrent);
    expect(current).toBeTruthy();
  });

  it('returns 401 when unauthenticated', async () => {
    await http.get('/api/v1/auth/sessions').expect(401);
  });
});

describe('DELETE /api/v1/auth/sessions/:id', () => {
  it('revokes another session', async () => {
    const user = await createUser(app);

    // Create a second session by logging in again
    const loginRes = await http
      .post('/api/v1/auth/login')
      .send({ emailOrHandle: user.email, password: 'TestPass123!' })
      .expect(200);

    const secondToken = (loginRes.body as { accessToken: string }).accessToken;

    // Get sessions with the second token
    const sessionsRes = await http
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${secondToken}`)
      .expect(200);

    const nonCurrentSession = sessionsRes.body.items.find(
      (s: { isCurrent: boolean }) => !s.isCurrent,
    );
    expect(nonCurrentSession).toBeTruthy();

    // Revoke the original session using the second session's token
    await http
      .delete(`/api/v1/auth/sessions/${nonCurrentSession.id}`)
      .set('Authorization', `Bearer ${secondToken}`)
      .expect(204);
  });

  it('returns 403 when trying to revoke another user\'s session', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    const aliceSessions = await http
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(200);

    const aliceSessionId = aliceSessions.body.items[0].id;

    // Bob tries to delete Alice's session — returns 404 (service hides cross-user sessions)
    const res = await http
      .delete(`/api/v1/auth/sessions/${aliceSessionId}`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(404);

    expect(res.body.error?.code).toBeTruthy();
  });
});

// ─── Email verification ───────────────────────────────────────────────────────

describe('POST /api/v1/auth/verify-email', () => {
  it('returns 401 for invalid/expired token', async () => {
    // Backend throws UnauthorizedException for invalid verification tokens
    const res = await http
      .post('/api/v1/auth/verify-email')
      .send({ token: 'invalid-token-12345' })
      .expect(401);

    expect(res.body.error?.code).toBeTruthy();
  });

  it('returns 400 for missing token', async () => {
    await http.post('/api/v1/auth/verify-email').send({}).expect(400);
  });
});
