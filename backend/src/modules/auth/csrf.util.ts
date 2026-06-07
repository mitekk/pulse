import * as crypto from 'crypto';

/**
 * CSRF Double-Submit Cookie Pattern
 *
 * On login/register:
 *   1. Generate a random CSRF token.
 *   2. Set it in a NON-httpOnly cookie named `csrf_token` so JS can read it.
 *   3. The client must echo this value in the `X-CSRF-Token` request header on refresh calls.
 *
 * On refresh (POST /auth/refresh):
 *   1. Read `csrf_token` cookie (Fastify: req.cookies.csrf_token).
 *   2. Read `X-CSRF-Token` request header.
 *   3. Compare with timingSafeEqual — reject if missing or mismatch.
 *
 * Why this works: a cross-origin attacker who triggers the cookie automatically
 * cannot read the cookie value (SameSite=Strict) and therefore cannot set the
 * header to the correct value. A same-origin attacker can read the cookie (it's
 * not httpOnly) and set the header, but they already have full DOM access — CSRF
 * is not the relevant threat model there.
 */
export class CsrfUtil {
  static generate(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Returns true when cookie value === header value using constant-time comparison.
   * Returns false for any missing or length-mismatched inputs.
   */
  static validate(cookieValue: string | undefined, headerValue: string | undefined): boolean {
    if (!cookieValue || !headerValue) return false;
    try {
      const a = Buffer.from(cookieValue);
      const b = Buffer.from(headerValue);
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }
}
