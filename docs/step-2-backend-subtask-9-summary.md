# Backend Phase 2 — Subtask 9: Search + Hashtags/Trends + Reports + Rate-Limit Hardening + Session Cleanup

**Completed:** 2026-06-07
**Status:** All deliverables implemented. typecheck ✓ lint ✓ build ✓ tests ✓ (408 passing — 36 new)
**npm audit:** 0 vulnerabilities

---

## Modules Created

### `SearchModule` (`src/modules/search/`)

| File | Purpose |
|------|---------|
| `search.port.ts` | `SearchPort` interface + `SEARCH_PORT` token (swap seam per ADR-0005) |
| `postgres-search.adapter.ts` | `PostgresSearchAdapter` — FTS via Postgres GIN expression index + pg_trgm |
| `search-query-parser.ts` | `parseSearchQuery()` + `buildTsQuery()` — intent routing (#tag, @handle, FTS) |
| `search.service.ts` | `SearchService` — orchestrates search + visibility + hydration |
| `search.index.processor.ts` | `SearchIndexProcessor` — BullMQ `search` queue processor (no-op; GIN index is expression-based) |
| `search.controller.ts` | `GET /api/v1/search` + `GET /api/v1/search/suggest` |
| `search.module.ts` | Module wiring |

### `HashtagsModule` (`src/modules/hashtags/`)

| File | Purpose |
|------|---------|
| `trends.service.ts` | Time-bucketed Redis counters + decay recompute + cache |
| `trends-recompute.processor.ts` | BullMQ `trends` queue processor — runs `trends.recompute` every 5 min |
| `trends.controller.ts` | `GET /api/v1/trends` |
| `hashtags.module.ts` | Module wiring + `OnModuleInit` cron registration |

### `ReportsModule` (`src/modules/reports/`)

| File | Purpose |
|------|---------|
| `report.entity.ts` | TypeORM entity (Snowflake PK, reporter FK ON DELETE SET NULL) |
| `dto/create-report.dto.ts` | Validated request DTO |
| `dto/report.dto.ts` | Response DTO |
| `reports.service.ts` | Store-only report creation |
| `reports.controller.ts` | `POST /api/v1/reports` (10/h rate limit) |
| `reports.module.ts` | Module wiring |

### Migration

| File | Content |
|------|---------|
| `1704067200009-create-reports.ts` | `reports` table: Snowflake PK, reporter FK ON DELETE SET NULL, target_type CHECK, reason CHECK, indexes on reporter_id + (target_type, target_id) |

---

## Cross-Module Wiring

### Trends ← Entity Extraction

- `TrendsIncrementPort` + `NoopTrendsIncrementService` added to `PostsModule` (no circular dep)
- `EntityExtractorService` calls `trendsIncrement.incrementTags()` fire-and-forget after hashtag persistence
- `AppModule` overrides port with `TrendsService` (from `HashtagsModule`)

### Session Cleanup

- `SessionCleanupProcessor` added to `AuthModule`
- `sessions` BullMQ queue registered in `AuthModule`
- Cron job `session.cleanup` registered via `OnModuleInit` (every 6 hours)
- Deletes: expired sessions (`expires_at < NOW()`) + old-revoked sessions (`revoked_at` > 30d)

---

## Search Architecture

### FTS Index

The `posts` table has a **functional GIN expression index**:
```sql
CREATE INDEX idx_posts_fts ON posts USING GIN (to_tsvector('english', coalesce(text, '')));
```
Postgres maintains this automatically on INSERT/UPDATE/DELETE. The `search.index` BullMQ processor is therefore a **no-op** — kept only as the external-engine swap seam (ADR-0005). No stored tsvector column update is needed.

### Query Types

| Type | SQL Strategy | Cursor |
|------|-------------|--------|
| `top` | FTS + blended relevance (ts_rank × engagement) | `{ score, id }` base64url |
| `latest` | FTS + chronological (id DESC) | `{ id }` base64url |
| `media` | FTS + INNER JOIN post_media | `{ id }` base64url |
| `people` | pg_trgm ILIKE on handle/display_name | `{ id }` base64url |

### Query Parsing

| Input pattern | Intent |
|-------------|--------|
| `#tag` | Delegates to `TimelineService.getHashtagTimeline()` |
| `@handle` | Delegates to `UsersService.getProfile()` |
| `from:handle terms` | FTS with fromHandle extracted ([NICE] — parsed, not filtered in adapter yet) |
| `bare terms` | FTS with `plainto_tsquery` |

---

## Trends Architecture

```
Post create
  → EntityExtractorService.extractAndPersist()
    → TrendsIncrementPort.incrementTags(tags)
      → Redis INCR trending:bucket:{tag}:{minuteBucket} (TTL: 2h)

Every 5 min (cron)
  → TrendsRecomputeProcessor → TrendsService.recomputeTrends()
    → SCAN trending:bucket:* keys
    → Decay weights: <15m → ×4, <30m → ×2, <60m → ×1, <120m → ×0.5, older → skip
    → Sort DESC, take top 10
    → SETEX trends:cache <payload> 600

GET /api/v1/trends
  → TrendsService.getTrends()
    → GET trends:cache (fallback: [])
```

---

## Rate-Limit Hardening

All limits per spec §15, applied with `@RateLimit` + `RateLimitGuard`:

| Endpoint | Limit | Window | Key prefix |
|----------|-------|--------|-----------|
| `POST /posts` | 300 | 3h | post |
| `POST /users/:handle/follow` | 400 | 24h | follow |
| `POST /posts/:id/like` | 1000 | 24h | like |
| `POST /conversations/:id/messages` | 500 | 24h | dm |
| `POST /auth/login` | 10 | 10min | auth:login |
| `POST /auth/register` | 10 | 10min | auth:register |
| `GET /search` | 60 | 60s | search |
| `GET /search/suggest` | 120 | 60s | search-suggest |
| `POST /reports` | 10 | 1h | report |

`Retry-After` header added to all 429 responses (uses Redis TTL of the rate-limit key).

---

## Unit Tests Added (36 new)

| File | Tests | Coverage |
|------|-------|----------|
| `tests/unit/search/search-query-parser.spec.ts` | 12 | Intent parsing, operator extraction, edge cases |
| `tests/unit/search/search.service.spec.ts` | 12 | #tag routing, @handle routing, FTS types, suggest, cursor pass-through |
| `tests/unit/search/trends.service.spec.ts` | 10 | incrementTags, getTrends, recomputeTrends decay/sort/cap |
| `tests/unit/reports/reports.service.spec.ts` | 6 | create (all fields, all reasons, Snowflake ID) |
| `tests/unit/search/rate-limit.spec.ts` | 7 | 429 enforcement, key schemes, Retry-After code |
| `tests/unit/search/session-cleanup.spec.ts` | 6 | cleanup job, delete logic, unknown-job guard |

**Total tests before:** 372
**Total tests after:** 408 (+36)

---

## Key File Paths

| What | Where |
|------|-------|
| SearchPort | `src/modules/search/search.port.ts` |
| PostgresSearchAdapter | `src/modules/search/postgres-search.adapter.ts` |
| SearchService | `src/modules/search/search.service.ts` |
| SearchController | `src/modules/search/search.controller.ts` |
| SearchIndexProcessor | `src/modules/search/search.index.processor.ts` |
| SearchQueryParser | `src/modules/search/search-query-parser.ts` |
| TrendsService | `src/modules/hashtags/trends.service.ts` |
| TrendsRecomputeProcessor | `src/modules/hashtags/trends-recompute.processor.ts` |
| TrendsController | `src/modules/hashtags/trends.controller.ts` |
| HashtagsModule | `src/modules/hashtags/hashtags.module.ts` |
| TrendsIncrementPort | `src/modules/posts/trends-increment.port.ts` |
| NoopTrendsIncrementService | `src/modules/posts/noop-trends-increment.service.ts` |
| Report entity | `src/modules/reports/report.entity.ts` |
| ReportsService | `src/modules/reports/reports.service.ts` |
| ReportsController | `src/modules/reports/reports.controller.ts` |
| SessionCleanupProcessor | `src/modules/auth/session-cleanup.processor.ts` |
| Reports migration | `src/infra/database/migrations/1704067200009-create-reports.ts` |
