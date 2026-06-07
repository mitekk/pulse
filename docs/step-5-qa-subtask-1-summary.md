# QA Progress — Step 5, Sub-task 1: Integration tests (VERIFIED)

## Outcome
**Integration tests already existed** (built during the backend phase) and are now
**verified green against real Postgres + Redis**.

- `npm run test:integration` → **10 files / 171 tests passing** (~106s).
- No `.skip` / `.only` / `.todo` anywhere in `tests/integration/`.
- Coverage of all 11 domains: auth, users, posts, timeline, engagement, messaging,
  notifications, reports, search, media.

## Harness (already in place)
- `backend/vitest.integration.config.ts` — swc transform for Nest decorators, `fileParallelism: false`, 30s test timeout, coverage off.
- `tests/integration/helpers/app.ts` — boots full NestJS+Fastify app via `Test.createTestingModule`, explicit entity list (no glob), **overrides all ports to real impls** (NotificationPort, PostsNotificationPort, DmNotificationPort, TrendsIncrementPort, RealtimePublisherPort, ViewerFlagsPort), supertest against `getHttpServer()`.
- `tests/integration/helpers/db.ts`, `helpers/auth.ts` — fixtures.
- `truncateAll()` — 300ms settle + Redis flushdb + TRUNCATE all tables RESTART IDENTITY CASCADE between tests.

## How to run (documented in vitest.integration.config.ts)
```bash
docker compose -f docker-compose.yml -f docker-compose.test.yml up -d db redis   # db→5433, redis→6380
# create tweeter_test DB if missing, then:
DATABASE_URL=postgresql://tweeter:tweeter@localhost:5433/tweeter_test npm run migration:run
npm run test:integration
```

## Notes / known gaps (non-blocking)
- `media.test.ts` upload-url test asserts `[500,503]` (storage-unavailable path) rather than the happy presigned-URL path — integration suite intentionally does NOT depend on MinIO, so CI needs only Postgres+Redis. The real media happy path is exercised by the Step 5.7 smoke test against the full Docker stack (MinIO up).
- `globalSetup` is NOT wired in the vitest config; migrations are applied manually (or by CI step) against `tweeter_test` before the run. The unused `setup/global.ts` + `setup/global.mjs` perform drop+migrate if wired — left as-is; manual/CI migration is the documented flow.

## Remaining for Step 5
- Sub-task 2: **E2E (Playwright)** — `tests/e2e/` + `playwright.config.ts` + page-object model + root e2e package, against the dockerized stack. (MISSING)
- Sub-task 3: **CI** — `.github/workflows/ci.yml` (lint→unit→integration→e2e→build). (MISSING)
