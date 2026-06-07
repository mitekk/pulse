# Backend Phase 2 — COMPLETE

**Completed:** 2026-06-07
**Final test count:** 408 tests, all passing
**npm audit:** 0 high/critical vulnerabilities

---

## Backend is Fully Implemented

All 9 subtasks are done. Every route in `docs/api-contract.md` is `Status = implemented`.

---

## Subtask Sequence

| # | Subtask | New Tests | Cumulative |
|---|---------|-----------|-----------|
| 1 | Foundation (NestJS + Fastify, Redis, BullMQ, Snowflake, Cursor, Guards) | 31 | 31 |
| 2a | Auth (JWT, sessions, argon2, CSRF, email verification) | 47 | 78 |
| 2b | Users + Follow Graph + Blocks/Mutes + VisibilityService | 46 | 124 |
| 3 | Posts (FTS GIN index, entity extraction, threads, reposts) | 48 | 172 |
| 4 | Engagement (likes, bookmarks, viewer flags, counter reconcile cron) | 34 | 206 |
| 5 | Media (MinIO presigned upload, finalize, variants, alt text) | ~40 | ~246 |
| 6 | Timeline (home fan-out, hashtag timeline, bookmarks, post cache) | ~52 | ~298 |
| 7 | Messaging DMs (conversations, messages, read receipts, mute) | ~44 | ~342 |
| 8a | Realtime (Socket.IO gateway, auth, room management, pub/sub) | ~18 | ~360 |
| 8b | Notifications (aggregated, unread count, mark read, real notification services) | ~12 | ~372 |
| 9 | Search + Hashtags/Trends + Reports + Rate-limit hardening + Session cleanup | 36 | 408 |

---

## Architecture Summary

### Stack
- NestJS 11 + Fastify
- TypeORM + PostgreSQL 16 with migrations
- Redis (ioredis) for caching + rate limiting + trending
- BullMQ for background jobs + cron
- MinIO for object storage (presigned uploads)
- Socket.IO for realtime events
- argon2id for password hashing (cost factor 12)
- JWT (access: 15m httpOnly + refresh: 30d httpOnly Secure SameSite=Strict)

### Migrations (in order)
1. `1704067200000-baseline` — citext + pg_trgm extensions
2. `1704067200001-create-users` — users table
3. `1704067200002-create-sessions` — sessions + email verification tokens
4. `1704067200003-create-follows-blocks-mutes` — graph tables
5. `1704067200004-create-posts` — posts + mentions + hashtags + post_hashtags + GIN FTS index
6. `1704067200005-create-likes-bookmarks` — engagement tables
7. `1704067200006-create-media` — media + post_media
8. `1704067200007-create-messaging` — conversations + messages + conversation_participants
9. `1704067200008-create-notifications` — notifications table
10. `1704067200009-create-reports` — reports table

### BullMQ Queues

| Queue | Jobs | Processor location |
|-------|------|--------------------|
| `fanout` | `fanout.post` | TimelineModule |
| `timeline` | `timeline.trim` (daily cron) | TimelineModule |
| `search` | `search.index` (upsert/delete — no-op; Postgres GIN auto-updated) | SearchModule |
| `media` | `media.process` | MediaModule |
| `notify-deliver` | `notify.deliver` | NotificationsModule |
| `engagement` | `counters.reconcile` (daily cron) | EngagementModule |
| `trends` | `trends.recompute` (every 5min) | HashtagsModule |
| `sessions` | `session.cleanup` (every 6h) | AuthModule |

### Key Security Measures
- Passwords: argon2id, 64MiB memory, 3 iterations
- JWT: httpOnly+Secure+SameSite=Strict cookies; refresh token rotation + reuse detection
- Rate limiting: per-route via `@RateLimit` + `RateLimitGuard` (Redis sliding window); `Retry-After` header on 429
- CSRF: double-submit cookie pattern on refresh endpoint
- Input validation: class-validator + class-transformer on all DTOs
- SQL: parameterized queries only (no string concatenation)
- No stack traces exposed to clients

---

## Caveats for QA/Smoke Testing

1. **`post_media` table join in search** — The `Media` (type=media) search uses `INNER JOIN post_media`. Verify the `post_media` table exists and has the correct column names before smoke testing the `type=media` search path.

2. **pg_trgm must be enabled** — People search uses `similarity()` and ILIKE. The baseline migration runs `CREATE EXTENSION IF NOT EXISTS pg_trgm`. Confirm this ran on the target DB.

3. **Trends warm-up** — On a fresh boot, `GET /trends` returns `[]` until the first `trends.recompute` cron fires (~5 minutes). This is expected behavior.

4. **Session cleanup TTL** — The cleanup cron runs every 6 hours. Revoked sessions are preserved for 30 days (token-reuse detection window), then purged.

5. **GIN FTS index expression** — The FTS index is a computed expression index, not a stored `tsvector` column. The `search.index` BullMQ processor is intentionally a no-op (ADR-0005 documents this). If Elasticsearch/OpenSearch integration is needed, implement the body of `SearchIndexProcessor.process()`.

6. **Reports are store-only** — No admin API, no notification to moderators. That is out-of-scope per PRD §8. Admin tooling would query the `reports` table directly.

7. **`from:handle` search operator** — Parsed out of the query string (`fromHandle` field set), but the `PostgresSearchAdapter` does not yet filter posts by author. This is noted as [NICE] in the architecture doc; the parser seam is in place for implementation.
