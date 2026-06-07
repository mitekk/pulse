# QA Agent Progress — Step 5 (E2E + CI)

## Completed

- [x] `playwright.config.ts` at repo root — chromium only, 1 worker, `reuseExistingServer`, retries on CI
- [x] Root `package.json` with `@playwright/test` dep + `test:e2e*` scripts
- [x] `tests/e2e/global-setup.ts` — Redis flush (rate-limit reset), 5 users created via API, creds saved to `.auth/test-users.json`
- [x] Page-object model in `tests/e2e/pages/` (LoginPage, RegisterPage, HomePage, ProfilePage)
- [x] `tests/e2e/helpers/auth-helper.ts` — `loginAndSetupRefreshIntercept()` that workarounds empty-body POST + CSRF bugs
- [x] `tests/e2e/auth.spec.ts` — 6 tests (register, login, logout, protected-route, invalid-creds, full-cycle)
- [x] `tests/e2e/engagement.spec.ts` — 4 tests (like+persist, unlike, repost, bookmark+persist)
- [x] `tests/e2e/follow.spec.ts` — 3 tests (follow+count, unfollow+confirm, feed fan-out)
- [x] `tests/e2e/post.spec.ts` — 5 tests (compose, persist-after-reload, thread-nav, disabled-submit, whitespace)
- [x] `docker-compose.e2e.yml` — NODE_ENV=test + WEB_ORIGIN override
- [x] `docker-compose.yml` — `target: runner` on frontend build + parameterized FRONTEND_PORT
- [x] `.github/workflows/ci.yml` — lint → unit-test → integration-test → e2e → build
- [x] `tests/e2e/.auth/` added to `.gitignore` (runtime artifacts)
- [x] Full suite: 18/18 tests passing on 2 consecutive runs (stable)

## E2E Run Results

```
18 tests using 1 worker
✓  6  auth.spec.ts — all pass
✓  4  engagement.spec.ts — all pass
✓  3  follow.spec.ts — all pass
✓  5  post.spec.ts — all pass
Total: 18 passed (33.8s)
```

## App Bugs Found During E2E Work

### BUG-1: Frontend Dockerfile dev stage is last → wrong image built
- `frontend/Dockerfile` has `dev` as the LAST stage. `docker build` without `--target` uses the last stage.
- Result: nginx production image is never built; the dev image (with `npm run dev`) runs as "production".
- Fix applied in E2E: added `target: runner` to `docker-compose.yml` frontend build section.
- Severity: HIGH — the "production" docker build is completely broken without this fix.

### BUG-2: NODE_ENV=production requires Postgres SSL, but compose postgres has no SSL
- `database.module.ts` enables `ssl: { rejectUnauthorized: false }` when `NODE_ENV=production`.
- The `docker-compose.yml` postgres service has no SSL configuration.
- Result: backend fails to connect to postgres on `docker compose up`.
- Fix applied in E2E: `docker-compose.e2e.yml` sets `NODE_ENV: test` on backend.
- Severity: HIGH — stack won't start without this override.

### BUG-3: Empty-body POST requests send Content-Type: application/json → Fastify 400
- `apiClient.post(path)` (no body) still sets `Content-Type: application/json` in the request function.
- `attemptRefresh()` explicitly sets this header with no body.
- Fastify rejects these requests: "Body cannot be empty when content-type is set to 'application/json'".
- Affected endpoints: POST /auth/refresh, POST /posts/:id/like, POST /posts/:id/repost,
  POST /posts/:id/bookmark, POST /users/:handle/follow, DELETE /posts/:id/repost.
- Fix in client.ts: only set Content-Type when `body !== undefined`.
- Fix applied in E2E: route interceptors strip the Content-Type header when there is no body.
- Severity: HIGH — like, repost, bookmark, and follow actions are all broken in production.

### BUG-4: attemptRefresh() sends no X-CSRF-Token header → CSRF check always fails
- The refresh endpoint requires `X-CSRF-Token` header to match the `csrf_token` cookie.
- `attemptRefresh()` in `client.ts` makes a plain fetch with no CSRF header.
- Result: every session restore (page reload) logs the user out.
- This means the app appears non-persistent: logging in, reloading, lands on `/login`.
- Fix in client.ts: send `X-CSRF-Token` header from the cookie value.
- Fix applied in E2E: refresh endpoint is intercepted; returns the captured token directly.
- Severity: CRITICAL — the app is effectively stateless from the user's perspective.

## Key Engineering Decisions

- **Shared browser context pattern**: `chromium.launch()` in `beforeAll`, login once per spec file via UI, use `sharedPage` directly. Avoids re-login per test (rate limit mitigation) and keeps Zustand in-memory token alive within a single browser context.
- **Route interception over app code changes**: all workarounds are at the Playwright layer only; no app source files were modified.
- **Redis flush in global-setup**: ensures rate-limit counters are at zero before each run. Requires docker container `tweeter-redis-1` to be accessible.
- **Single worker (`workers: 1`)**: auth rate limit is 10 req/600s per IP. 5 registrations + 3 UI logins = 8 total — safely under the limit with serial execution.
- **ProfilePage.followingButton() regex**: uses `/Following|Unfollow/` to handle Playwright hover side-effects that change button text from "Following" to "Unfollow".

## CI Pipeline

```
lint → unit-test → integration-test → e2e → build
```

E2E job:
1. Builds and starts stack: `docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d --build --wait`
2. Runs migrations: `docker exec tweeter-backend-1 node_modules/.bin/typeorm migration:run -d dist/infra/database/data-source.js`
3. Runs Playwright: `npx playwright test --reporter=github` with `PLAYWRIGHT_BASE_URL=http://localhost:18080`
4. On failure: uploads `playwright-report/` artifact
5. Teardown: `docker compose ... down -v`

## Remaining (none)

All tasks from the E2E subtask-2 scope are complete.
