# QA Agent Progress — Step 5 (E2E + CI)

## Completed

- [x] `playwright.config.ts` at repo root — chromium only, 1 worker, `reuseExistingServer`, retries on CI
- [x] Root `package.json` with `@playwright/test` dep + `test:e2e*` scripts
- [x] `tests/e2e/global-setup.ts` — Redis flush (rate-limit reset), 5 users created via API, creds saved to `.auth/test-users.json`
- [x] Page-object model in `tests/e2e/pages/` (LoginPage, RegisterPage, HomePage, ProfilePage)
- [x] `tests/e2e/helpers/auth-helper.ts` — all route interception workarounds REMOVED; now a clean `loginAndNavigateHome()` with no mocks
- [x] `tests/e2e/auth.spec.ts` — 7 tests including new BUG-4 reload-persistence regression guard
- [x] `tests/e2e/engagement.spec.ts` — 4 tests (like+persist, unlike, repost, bookmark+persist)
- [x] `tests/e2e/follow.spec.ts` — 3 tests (follow+count, unfollow+confirm, feed fan-out)
- [x] `tests/e2e/post.spec.ts` — 5 tests (compose, persist-after-reload, thread-nav, disabled-submit, whitespace)
- [x] `docker-compose.e2e.yml` — comment rewritten to reflect real reason (HTTP localhost cannot use Secure cookies; SSL is no longer the reason)

## Workarounds Removed (de-masked)

All Playwright route interceptions have been removed from `auth-helper.ts`:
- `**/api/v1/auth/refresh` interception — deleted; refresh must go through the real backend
- No-body POST Content-Type-stripping interceptions (like/repost/bookmark/follow) — deleted; real client no longer sets the header

The helper is now `loginAndNavigateHome()`: a clean UI login with no mock layer.

## Cookie/ENV Decision

**Decision: Keep `docker-compose.e2e.yml` with `NODE_ENV=test`.**

Empirically verified: when running the stack with `NODE_ENV=production`, Playwright's Chromium does NOT send the `refresh_token` and `csrf_token` cookies over plain HTTP (`http://localhost:18080`), because those cookies are set with `Secure` (which requires HTTPS). Chromium's "localhost is a secure context" rule applies to JS APIs but NOT to cookie delivery. Result: every page reload logs the user out.

`NODE_ENV=test` disables the `Secure` flag on cookies, allowing them to round-trip over plain HTTP. The comment in `docker-compose.e2e.yml` has been rewritten to accurately describe this reason (SSL is no longer the reason — that was fixed via `DATABASE_SSL` env var).

## E2E Suite — FINAL GREEN RESULT

**19/19 tests pass on two consecutive runs. Suite is fully green.**

```
19 tests using 1 worker (7 auth, 4 engagement, 3 follow, 5 post)
Run against NODE_ENV=test stack (docker-compose.yml + docker-compose.e2e.yml)

Run 1: 19/19 passed (39.3s)
Run 2: 19/19 passed (39.1s)

Key test: "session persists after page reload (BUG-4 regression guard)" — PASSES both runs
```

All tests pass with no route interception or masking. Real backend, real cookies, real CSRF flow.

## App Bugs Found and Fixed During E2E Work

### BUG-1: Frontend Dockerfile dev stage is last → wrong image built
- `frontend/Dockerfile` has `dev` as the LAST stage. `docker build` without `--target` uses the last stage.
- Result: nginx production image is never built; the dev image (with `npm run dev`) runs as "production".
- Fix applied: added `target: runner` to `docker-compose.yml` frontend build section.
- Status: FIXED in app code.

### BUG-2: NODE_ENV=production requires Postgres SSL, but compose postgres has no SSL
- `database.module.ts` enables `ssl: { rejectUnauthorized: false }` when `NODE_ENV=production`.
- The `docker-compose.yml` postgres service has no SSL configuration.
- Fix applied: `DATABASE_SSL` env var introduced; defaults to `false`.
- Status: FIXED in app code. `docker-compose.e2e.yml` is now only needed for the Secure-cookie issue.

### BUG-3: Empty-body POST requests send Content-Type: application/json → Fastify 400
- `apiClient.post(path)` (no body) sets `Content-Type: application/json` with no body.
- Fix applied: `request()` in `client.ts` only sets Content-Type when body is present.
- Status: FIXED in app code. Interception workarounds removed from tests.

### BUG-4: CSRF token not sent on refresh → session never restores on reload (FULLY FIXED)
- `attemptRefresh()` (401-retry path) was fixed to send `X-CSRF-Token`.
- `request()` function now also adds `X-CSRF-Token` for any path starting with `/auth/refresh` (bootstrap path).
- Status: FIXED (commit c80f684). Verified by "session persists after page reload" regression guard passing on every run.
- Severity: Was CRITICAL. Now resolved.

### BUG-5: ShallowPostDto missing media field → crash rendering reposts on profile page (FIXED)
- `toShallowDto()` in both `posts.service.ts` and `timeline.service.ts` omitted the `media` field.
- `PostCard.tsx` accessed `post.media.length` unconditionally; when the inner post of a repost entry was a `ShallowPostDto`, this crashed with "Cannot read properties of undefined (reading 'length')".
- Fix applied: added `media: []` to both `toShallowDto` functions, added `media: PostMediaDto[]` to `ShallowPostDto` interface, and added `post.media?.length` optional chaining in `PostCard.tsx`.
- Status: FIXED in this pass (commit 8bf1ee0).

### BUG-6: returnTo infinite redirect loop → 414 Request-URI Too Large (FIXED)
- When `/auth/refresh` failed (CSRF missing), `client.ts` built the returnTo URL from `window.location.pathname + window.location.search` without checking whether the page was already `/login`. Each bootstrap failure on the login page added another encoded layer to `returnTo`, eventually exceeding nginx's URI size limit.
- Fix applied: skip encoding returnTo when the current path starts with `/login`; redirect to clean `/login` instead.
- Status: FIXED in this pass (commit 8bf1ee0).

### BUG-7: follow.spec bootstrap race → CSRF cookie inconsistency between tests (FIXED)
- follow.spec `beforeEach` asserted the profile element visible before waiting for `networkidle`. Because the profile page uses `OptionalAuth`, the element appears before `useBootstrap`'s `/auth/refresh` completes. A subsequent `page.goto('/')` cancelled the in-flight refresh, leaving the CSRF cookie inconsistent for the next bootstrap, causing 403 FORBIDDEN.
- Fix applied: added `waitForLoadState('networkidle')` after each `goto()` in `beforeEach` and after the persistence-check `goto()` in test 12.
- Status: FIXED in this pass (commit 8bf1ee0). This was a test-side race condition exposing a real app fragility (no protection against concurrent bootstrap calls).

## Key Engineering Decisions

- **Shared browser context pattern**: `chromium.launch()` in `beforeAll`, login once per spec file via UI, use `sharedPage` directly.
- **All route interception removed**: test integrity requires real requests to reach the real backend.
- **Redis flush in global-setup**: ensures rate-limit counters are at zero before each run.
- **Single worker (`workers: 1`)**: auth rate limit is 10 req/600s per IP.
- **NODE_ENV=test for E2E**: required for non-Secure cookies over plain HTTP localhost.
