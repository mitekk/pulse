# Step 5 re-entry — Coverage gate fix + integration flake

Re-entered Step 5 from the Step 5.5 review blocker (CI red on backend coverage).

## Problem
`npm run test:coverage` enforced an 80% **lines** gate over all of `src/**`, but the
unit suite only owns services/utils/guards/etc. Controllers, processors, adapters, the
WS gateway, modules, DTOs, entities and infra are exercised by the **integration suite**
(171 tests) under a separate config that contributed nothing to that number. Unit-only
coverage was 58.9% → the gate could never pass → CI's `unit-test` job failed before
e2e/build ran.

## Decision — combined coverage gate
Measure the **true** coverage by merging unit + integration v8 coverage and gating the
merged number at 80% lines. Nothing is excluded to "make the number" — controllers etc.
count as the integration-tested code they are.

Mechanism (two-run + merge, keeps the suites independently runnable):
- `vitest.config.ts` (unit): threshold removed, `json` reporter added → `coverage/coverage-final.json`.
- `vitest.integration-coverage.config.ts` (new): integration config with v8 coverage → `coverage-integration/coverage-final.json`.
- `scripts/merge-coverage.mjs`: merges both via `istanbul-lib-coverage`, enforces 80% lines, exits non-zero on miss.
- `package.json`: `test:coverage:integration`, `test:coverage:combined` scripts.
- `ci.yml`: `unit-test` job runs `npm run test` (fast, no DB); the 80% gate runs as a
  combined step in the `integration-test` job (which has Postgres + Redis services).

## Result
- Unit 408/408, Integration 171/171.
- **Combined coverage: 83.21% lines (2577/3097) — PASS.**

Reproduce locally:
```bash
docker compose -f docker-compose.yml -f docker-compose.test.yml up -d db redis
# (create + migrate tweeter_test if needed)
cd backend && npm run test:coverage:combined
```

## Integration flake found + fixed (unrelated to coverage)
While verifying, the integration suite intermittently failed with a 404 on
`POST /api/v1/posts` (the failing test moved between runs). Root cause: `truncateAll`
flushed only `flushdb()` (db 0) between tests, so Redis state survived across **repeated
local runs**; under the test Redis's `allkeys-lru` + 256mb cap, live keys got evicted
mid-test. It reproduced under the plain integration config too (not coverage-related),
and **did not affect CI** (fresh Redis container per run).

Fix: `tests/integration/helpers/app.ts` `truncateAll` now uses `flushall()` (the test
Redis is dedicated; full flush is the correct isolation primitive). Verified: a full
clean run is 171/171, and `reports.test.ts` alone now passes 9/9 even against a dirty
Redis (the `beforeEach` flushall self-heals).

## Cleanup
- Removed orphaned `vitest.combined.config.ts` (single-invocation variant, unreferenced).
- `.gitignore`: added `coverage-*/` so coverage artifacts aren't committed.
