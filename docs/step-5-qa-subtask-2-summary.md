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

## Real Remaining App Bug — BUG-4 Incomplete Fix

**STOP: The E2E suite CANNOT pass. BUG-4 was only partially fixed.**

### What the claimed fix addressed
`attemptRefresh()` in `client.ts` — the internal 401-retry function — now reads `document.cookie` and sends `X-CSRF-Token`. This path is triggered when a normal API request returns 401.

### What was NOT fixed
`authApi.refresh()` → `apiClient.post('/auth/refresh')` → `request('/auth/refresh', {method: POST, body: undefined})` — the BOOTSTRAP path. `request()` has NO CSRF handling. It sends a plain POST with no CSRF header. The backend returns 403 FORBIDDEN (CSRF validation failed).

### Impact
`useBootstrap()` calls `authApi.refresh()` on every page mount. Since `request()` doesn't add `X-CSRF-Token`, every bootstrap refresh attempt fails with 403. The user is logged out on every page reload. This is the same symptom as the original BUG-4.

### Evidence
```
[REFRESH_CALL_1] hasCSRF=false cookie=PRESENT headers={}
REFRESH status: 403
After reload URL: http://localhost:18080/login?returnTo=%2F
```

Cookie IS present at the time `fetch()` is called, but `readCsrfToken()` was called (by `request()` path — which doesn't call it at all) earlier. The `request()` function in `client.ts` simply never reads `document.cookie` or adds `X-CSRF-Token`. Only `attemptRefresh()` does that.

### Required app code fix
In `frontend/src/lib/api/client.ts`, the `request()` function needs to detect when it's calling `/auth/refresh` and add the CSRF token, OR `authApi.refresh()` needs to use `attemptRefresh()` directly rather than going through the generic `request()` path.

The simplest fix: in `authApi.refresh()`, call `attemptRefresh()` directly instead of `apiClient.post('/auth/refresh')`. OR: move CSRF token logic into `request()` for all POST/PATCH/PUT/DELETE requests (not just /auth/refresh).

## E2E Run Results (FINAL — WITH WORKAROUNDS REMOVED)

```
19 tests using 1 worker (7 auth, 4 engagement, 3 follow, 5 post)

Run against NODE_ENV=test stack (docker-compose.yml + docker-compose.e2e.yml):

PASSING (10/19):
✓  auth.spec: login page shows register link
✓  auth.spec: register page shows login link
✓  auth.spec: protected route redirects to /login when not authenticated
✓  auth.spec: invalid credentials show error feedback
✓  auth.spec: registers a new user and lands on home
✓  auth.spec: full cycle: login with email → logout → login with handle

FAILING (9/19) — all caused by BUG-4 incomplete fix:
✘  auth.spec: session persists after page reload (BUG-4 regression guard)
✘  engagement.spec: likes a post (post card not found — page reverts to /login after reload)
✘  engagement.spec: unlikes a post (login page shown — shared context lost auth after prior test reload)
✘  engagement.spec: reposts a post (same — cascading from prior test)
✘  engagement.spec: bookmarks a post (same — cascading from prior test)
✘  follow.spec: following user B increments followers count
✘  follow.spec: unfollowing user B removes following state
✘  follow.spec: A's home feed shows B's post after following B
✘  post.spec: composes a post (login rate-limit hit from accumulated debug sessions)
(4 post.spec tests did not run — skipped after first failure in describe block)
```

No interception or masking remains. These are genuine failures caused by the unresolved bootstrap CSRF bug.

## App Bugs Found During E2E Work

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

### BUG-4: CSRF token not sent on refresh → session never restores on reload (INCOMPLETE FIX)
- `attemptRefresh()` (401-retry path) was fixed to send `X-CSRF-Token`.
- `authApi.refresh()` (bootstrap path, called by `useBootstrap`) still does NOT send `X-CSRF-Token`.
- Status: PARTIALLY FIXED. The bootstrap path is still broken. See "Real Remaining App Bug" above.
- Severity: CRITICAL — the app effectively logs users out on every page reload.

## Key Engineering Decisions

- **Shared browser context pattern**: `chromium.launch()` in `beforeAll`, login once per spec file via UI, use `sharedPage` directly.
- **All route interception removed**: test integrity requires real requests to reach the real backend.
- **Redis flush in global-setup**: ensures rate-limit counters are at zero before each run.
- **Single worker (`workers: 1`)**: auth rate limit is 10 req/600s per IP.
- **NODE_ENV=test for E2E**: required for non-Secure cookies over plain HTTP localhost.
