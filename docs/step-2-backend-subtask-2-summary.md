# Backend Phase 2 — Subtask 2a: Migrations + Auth Module Summary

**Completed:** 2026-06-07
**Status:** All deliverables implemented. typecheck ✓ lint ✓ build ✓ tests ✓ (78 passing)

---

## Tables Created (Migrations)

### `users` (migration `1704067200001-create-users.ts`)
- UUID PK (`gen_random_uuid()`), `handle citext UNIQUE`, `email citext UNIQUE`
- `password_hash`, `display_name`, `bio`, `location`, `website`
- `avatar_media_id` / `banner_media_id` — plain UUID columns, no FK yet (added in Phase 6 media migration)
- `is_verified`, `is_private`, `dm_privacy` CHECK('everyone','following') DEFAULT 'following'
- Denorm counters: `followers_count`, `following_count`, `posts_count` (integer DEFAULT 0)
- `email_verified_at`, `created_at`, `updated_at`, `deleted_at`
- GIN trigram indexes on `handle` + `display_name` for typeahead

### `email_verification_tokens` (same migration)
- UUID PK, `user_id → users ON DELETE CASCADE`
- `token_hash VARCHAR(64) UNIQUE` — SHA-256 hex of raw token (raw never stored)
- `expires_at`, `used_at` (null = not yet used), `created_at`
- Design choice: separate table (not a column) so tokens can be re-issued, invalidated, and expired independently of the users row

### `sessions` (migration `1704067200002-create-sessions.ts`)
- Snowflake BIGINT PK, `user_id → users ON DELETE CASCADE`
- `refresh_hash VARCHAR(64) UNIQUE` — SHA-256 hex of raw 256-bit refresh token
- `family_id UUID` — groups all tokens in a rotation lineage; reuse detection revokes by family
- `user_agent`, `ip`, `created_at`, `expires_at`, `revoked_at`
- Indexes: `(user_id, expires_at)` for session list/cleanup cron, `(family_id)` for O(1) family revocation

---

## Auth Endpoints (all `Status = implemented` in api-contract.md)

| Route | Notes |
|---|---|
| `POST /api/v1/auth/register` | argon2id hash, email verify token issued (logged to console in dev), access JWT + refresh cookie + CSRF cookie returned |
| `POST /api/v1/auth/login` | email OR handle lookup (citext), timing-safe dummy hash on miss (no user enumeration), same cookie/token response |
| `POST /api/v1/auth/refresh` | CSRF double-submit validated first; reuse detection revokes full family on stale token; rotates refresh token and session |
| `POST /api/v1/auth/logout` | Revokes current session; clears both cookies |
| `GET /api/v1/auth/me` | Returns UserDto for authenticated user |
| `POST /api/v1/auth/verify-email` | Validates token hash, marks used_at, sets email_verified_at |
| `GET /api/v1/auth/sessions` | Lists active non-expired sessions; marks isCurrent |
| `DELETE /api/v1/auth/sessions/:id` | Ownership-checked revocation; clears cookies if revoking own session |

---

## Token / Cookie / CSRF Model

- **Access JWT** (~15m): `{ sub: userId, handle, sessionId }` — signed with `JWT_ACCESS_SECRET`. Delivered in response body. Held in client memory (Zustand auth store).
- **Refresh token**: 32-byte random hex. Stored as SHA-256 hash in `sessions.refresh_hash`. Delivered in `httpOnly + Secure + SameSite=Strict` cookie scoped to `/api/v1/auth/refresh`. Rotates on every use.
- **Reuse detection**: if a revoked session's `refresh_hash` is presented, the entire `family_id` group is revoked and `REFRESH_TOKEN_REUSE` is thrown.
- **CSRF**: `csrf_token` non-httpOnly cookie (JS-readable). Client must echo as `X-CSRF-Token` header on refresh calls. `CsrfUtil.validate()` uses `timingSafeEqual`.
- **Rate limits**: register 10/10min per IP, login 10/10min per IP (via `RateLimitGuard`).

---

## Guards Available

| Guard | File | Export | Use |
|---|---|---|---|
| `AuthGuard` | `common/guards/auth.guard.ts` | via `AuthModule` | Verifies Bearer JWT; respects `@Public()`; populates `request.user` |
| `OptionalAuthGuard` | `common/guards/optional-auth.guard.ts` | via `AuthModule` | Same as above but never rejects; user is undefined if unauthenticated |

Both guards exported from `AuthModule`. Future modules import `AuthModule` or inject guards directly.

`@CurrentUser()` decorator returns `AuthenticatedUser = AccessTokenPayload & { id: string }` (typed in `common/decorators/current-user.decorator.ts`).

---

## MailerPort

- **Interface**: `src/modules/auth/mailer.port.ts` — `MAILER_PORT` injection token + `sendEmailVerification()` method signature
- **Dev implementation**: `ConsoleMailer` — logs verification token + verify-email curl command to backend console (no SMTP dependency)
- **Swap path**: replace `useClass: ConsoleMailer` with a real provider in `auth.module.ts`

---

## Key File Paths

| What | Where |
|---|---|
| Users migration | `src/infra/database/migrations/1704067200001-create-users.ts` |
| Sessions migration | `src/infra/database/migrations/1704067200002-create-sessions.ts` |
| User entity | `src/modules/users/user.entity.ts` |
| Session entity | `src/modules/auth/session.entity.ts` |
| EmailVerificationToken entity | `src/modules/auth/email-verification-token.entity.ts` |
| AuthService | `src/modules/auth/auth.service.ts` |
| AuthController | `src/modules/auth/auth.controller.ts` |
| AuthModule | `src/modules/auth/auth.module.ts` |
| AuthGuard | `src/common/guards/auth.guard.ts` |
| OptionalAuthGuard | `src/common/guards/optional-auth.guard.ts` |
| MailerPort | `src/modules/auth/mailer.port.ts` |
| ConsoleMailer | `src/modules/auth/console-mailer.service.ts` |
| CsrfUtil | `src/modules/auth/csrf.util.ts` |
| Unit tests | `tests/unit/auth/auth.service.spec.ts`, `tests/unit/auth/csrf.util.spec.ts` |

---

## New Env Vars

No new env vars — JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, JWT_ACCESS_EXPIRY, JWT_REFRESH_EXPIRY were already seamed in Phase 1 config.

---

## What Subtask 2b (Users + Follows + Blocks/Mutes) Builds On

1. **`User` entity** — already registered in `AuthModule` via `TypeOrmModule.forFeature`. `UsersModule` should import `TypeOrmModule.forFeature([User])` too, or re-export from `AuthModule`.
2. **`AuthGuard` / `OptionalAuthGuard`** — import `AuthModule` in `UsersModule` to get both guards.
3. **`@CurrentUser()`** — already typed as `AuthenticatedUser` with `id` field.
4. **`UserDto`** — extend or reuse for `ProfileDto` (add `bio`, `location`, `counts`, `viewer` relationship flags).
5. **`sessions` table** — already created; subtask 2b does not need to touch it.
6. **`follows`, `blocks`, `mutes` migrations** — subtask 2b creates these tables.
7. **`VisibilityService`** — subtask 2b implements this using blocks/mutes/private-account logic.
8. **NotificationPort note**: follow/like/etc. in subtask 2b will need to emit notifications. Add a `NotificationPort` interface + no-op impl in subtask 2b; Phase 7 swaps in the real implementation. Auth does not emit notifications, so the seam is not needed here.
