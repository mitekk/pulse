/**
 * Auth helpers for integration tests.
 * Creates users and returns tokens for authenticated requests.
 */
import supertest from 'supertest';
import { NestFastifyApplication } from '@nestjs/platform-fastify';

export interface TestUser {
  id: string;
  handle: string;
  email: string;
  accessToken: string;
  /** Raw cookie string for cookie-bearing requests */
  cookies: string[];
}

let _userCounter = 0;

export function uniqueHandle(prefix = 'user'): string {
  return `${prefix}${++_userCounter}${Date.now().toString(36)}`;
}

export function uniqueEmail(prefix = 'user'): string {
  return `${prefix}${++_userCounter}${Date.now().toString(36)}@test.example`;
}

/**
 * Register a new user and return their credentials.
 * Uses the real /api/v1/auth/register endpoint.
 */
export async function createUser(
  app: NestFastifyApplication,
  overrides: { handle?: string; email?: string; password?: string; displayName?: string } = {},
): Promise<TestUser> {
  const handle = overrides.handle ?? uniqueHandle();
  const email = overrides.email ?? `${handle}@test.example`;
  const password = overrides.password ?? 'TestPass123!';

  const res = await supertest(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({
      handle,
      email,
      password,
      displayName: overrides.displayName ?? handle,
    })
    .expect(201);

  const cookies: string[] = (res.headers['set-cookie'] as string[] | string)
    ? Array.isArray(res.headers['set-cookie'])
      ? res.headers['set-cookie']
      : [res.headers['set-cookie']]
    : [];

  return {
    id: (res.body as { user: { id: string } }).user.id,
    handle,
    email,
    accessToken: (res.body as { accessToken: string }).accessToken,
    cookies,
  };
}

/** Returns Authorization header bearer token */
export function bearerHeader(user: TestUser): string {
  return `Bearer ${user.accessToken}`;
}

/**
 * Extract the csrf_token value from set-cookie headers
 */
export function extractCsrf(cookies: string[]): string | undefined {
  for (const cookie of cookies) {
    const match = /csrf_token=([^;]+)/.exec(cookie);
    if (match) return match[1];
  }
  return undefined;
}

/**
 * Extract the refresh_token cookie string for use in subsequent requests
 */
export function extractRefreshCookie(cookies: string[]): string | undefined {
  for (const cookie of cookies) {
    if (cookie.startsWith('refresh_token=')) return cookie.split(';')[0];
  }
  return undefined;
}

/**
 * Build a combined cookie header string with both refresh_token and csrf_token.
 * This is required for the CSRF double-submit pattern to work in integration tests.
 */
export function buildRefreshCookieHeader(cookies: string[]): string {
  const parts: string[] = [];
  for (const cookie of cookies) {
    if (cookie.startsWith('refresh_token=') || cookie.startsWith('csrf_token=')) {
      parts.push(cookie.split(';')[0]);
    }
  }
  return parts.join('; ');
}
