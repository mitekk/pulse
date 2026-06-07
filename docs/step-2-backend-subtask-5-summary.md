# Backend Phase 2 — Subtask 5: Engagement (Likes/Bookmarks) + ViewerFlags + Counter Reconcile Summary

**Completed:** 2026-06-07
**Status:** All deliverables implemented. typecheck ✓ lint ✓ build ✓ tests ✓ (212 passing — 40 new)

---

## Tables Created (Migration `1704067200005-create-likes-bookmarks.ts`)

### `likes`
- Composite PK `(user_id, post_id)` — enforces one-like-per-user at DB level
- `user_id → users ON DELETE CASCADE`
- `post_id → posts ON DELETE CASCADE`
- Index `(post_id, created_at DESC)` — for `GET /posts/:id/likes`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

### `bookmarks`
- Composite PK `(user_id, post_id)` — enforces one-bookmark-per-user at DB level
- `user_id → users ON DELETE CASCADE`
- `post_id → posts ON DELETE CASCADE`
- Index `(user_id, created_at DESC)` — for `GET /bookmarks`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

---

## Entities Created

| Entity | File | Key |
|--------|------|-----|
| `Like` | `src/modules/engagement/like.entity.ts` | Composite PK (user_id, post_id) |
| `Bookmark` | `src/modules/engagement/bookmark.entity.ts` | Composite PK (user_id, post_id) |

---

## ViewerFlagsService API

**File:** `src/modules/engagement/viewer-flags.service.ts`

```typescript
// Redis key constants (per-user sets — per ADR-0004 recommendation)
REDIS_KEY.liked(userId)      // → `liked:{userId}`       (Set of postIds)
REDIS_KEY.bookmarked(userId) // → `bookmarked:{userId}`  (Set of postIds)
REDIS_KEY.reposted(userId)   // → `reposted:{userId}`    (Set of postIds — managed by PostsModule)

// Methods
hydrate(viewerId: string | null, postIds: string[]): Promise<Map<string, PostViewerDto>>
hydrateOne(viewerId: string | null, postId: string): Promise<PostViewerDto>
backfillUserSets(userId: string): Promise<void>
```

**Algorithm:**
1. Pipeline `SISMEMBER liked:{userId} {postId}` + `SISMEMBER bookmarked:{userId} {postId}` + `SISMEMBER reposted:{userId} {postId}` for all postIds in one pipeline call.
2. `EXISTS liked:{userId}` to detect cache miss vs empty set.
3. On miss: `backfillUserSets()` fetches all liked/bookmarked postIds from DB → `SADD liked:{userId} ...` / `SADD bookmarked:{userId} ...`; then falls back to DB for the current request.
4. On pipeline error: graceful fallback to DB.
5. Empty user sets: sentinel key `liked:{userId}:seeded` (TTL 1h) to prevent repeat DB lookups.

**No TTL on sets** — per-user sets are invalidated on write (SADD/SREM on like/unlike/bookmark/unbookmark). The `counters.reconcile` job can rebuild them if needed.

---

## ViewerFlagsPort Pattern (no circular deps)

**Problem:** PostsModule needs viewer flags but can't import EngagementModule (circular).

**Solution:**
1. `src/modules/posts/viewer-flags.port.ts` — `VIEWER_FLAGS_PORT` interface declared in PostsModule
2. `src/modules/posts/noop-viewer-flags.service.ts` — default (all false), provided by PostsModule
3. `src/modules/engagement/viewer-flags.adapter.ts` — real impl, delegates to `ViewerFlagsService`
4. `EngagementModule` is `@Global()` and provides `VIEWER_FLAGS_PORT → ViewerFlagsAdapter`
5. Since EngagementModule is `@Global()`, the real implementation wins everywhere

**PostsService** now uses `viewerFlagsPort.hydrate()` for batch hydration on all list endpoints (paginatePostList, getThread replies) and `viewerFlagsPort.hydrateOne()` for single-post lookups.

---

## EngagementService API

**File:** `src/modules/engagement/engagement.service.ts`

| Method | Signature | Notes |
|--------|-----------|-------|
| `like` | `(userId, postId) → { liked: true, count }` | Idempotent; `UPDATE posts SET like_count = like_count + 1`; SADD liked:{userId}; HINCRBY counters:{postId} likes 1; no self-notify |
| `unlike` | `(userId, postId) → { liked: false, count }` | Idempotent; `GREATEST(like_count - 1, 0)` floor; SREM; HINCRBY -1 |
| `bookmark` | `(userId, postId) → { bookmarked: true }` | Idempotent; `bookmark_count + 1`; SADD bookmarked:{userId}; silent (no notify) |
| `unbookmark` | `(userId, postId) → { bookmarked: false }` | Idempotent; `GREATEST(bookmark_count - 1, 0)` floor; SREM |
| `getLikes` | `(postId, viewerId, limit, cursor) → { items: UserCardDto[], cursor, hasMore }` | Cursor by user_id; replaces subtask-4 stub |
| `getBookmarks` | `(userId, limit, cursor) → { items: PostDto[], cursor, hasMore }` | Cursor by post_id DESC; owner-only |

**Counter pattern:** All counter mutations use direct SQL (`UPDATE posts SET x = x + 1`) inside `DataSource.transaction()`. Redis hash (`counters:{postId}`) updated best-effort after the transaction with `HINCRBY`.

---

## EngagementController Routes

All registered under global prefix `api/v1` in `EngagementController`.

| Method | Path | Guard | Notes |
|--------|------|-------|-------|
| POST | `/posts/:id/like` | AuthGuard + RateLimitGuard | 1000/day rate limit (spec §15) |
| DELETE | `/posts/:id/like` | AuthGuard | 200 OK |
| POST | `/posts/:id/bookmark` | AuthGuard | 201 Created |
| DELETE | `/posts/:id/bookmark` | AuthGuard | 200 OK |
| GET | `/posts/:id/likes` | OptionalAuthGuard | Full impl (replaces stub) |
| GET | `/bookmarks` | AuthGuard | Self-only; cursor paginated |

**Note:** `GET /posts/:id/likes` stub removed from `PostsController`. Route is now exclusively in `EngagementController`.

---

## CountersReconcileProcessor

**File:** `src/modules/engagement/counters-reconcile.processor.ts`

- Queue: `counters`, job name: `counters.reconcile`
- Cron: `*/10 * * * *` (every 10 minutes), registered in `EngagementModule.onModuleInit()`
- Batch size: 500 posts per batch to avoid long-running transactions

**Algorithm:**
1. SELECT batch of posts with their true counts from source tables (subqueries: `COUNT(*) FROM likes`, `COUNT(*) FROM bookmarks`, `COUNT(*) FROM posts WHERE reply_to_id = ...`, `COUNT(*) FROM posts WHERE repost_of_id = ... OR quote_of_id = ...`)
2. For each post where any counter drifted: `UPDATE posts SET like_count=$2, bookmark_count=$3, reply_count=$4, repost_count=$5 WHERE id=$1`
3. Pipeline `HSET counters:{postId} {likes, bookmarks, replies, reposts}` for all corrected posts
4. Loop until batch < BATCH_SIZE (done)

---

## Redis Counter Model

```
counters:{postId}   — hash (likes, bookmarks, replies, reposts)
liked:{userId}      — set of postIds the user has liked
bookmarked:{userId} — set of postIds the user has bookmarked
reposted:{userId}   — set of postIds the user has reposted (managed by PostsModule)
```

Sets have no TTL; invalidated on write. Counter hashes have no TTL; corrected by reconcile cron.

---

## Module Structure

| File | Role |
|------|------|
| `src/modules/engagement/engagement.module.ts` | `@Global()` module; registers all providers; cron job |
| `src/modules/engagement/engagement.service.ts` | Like/unlike, bookmark/unbookmark, getLikes, getBookmarks |
| `src/modules/engagement/engagement.controller.ts` | HTTP endpoints |
| `src/modules/engagement/viewer-flags.service.ts` | Batch Redis → DB viewer flag hydration |
| `src/modules/engagement/viewer-flags.adapter.ts` | Implements ViewerFlagsPort; injected globally |
| `src/modules/engagement/counters-reconcile.processor.ts` | BullMQ processor for drift correction |
| `src/modules/engagement/like.entity.ts` | TypeORM entity |
| `src/modules/engagement/bookmark.entity.ts` | TypeORM entity |
| `src/modules/posts/viewer-flags.port.ts` | Port interface (VIEWER_FLAGS_PORT token) |
| `src/modules/posts/noop-viewer-flags.service.ts` | Default noop (all false) |
| `src/infra/database/migrations/1704067200005-create-likes-bookmarks.ts` | Migration |

---

## What Timeline (Subtask 6) Builds On

1. **`ViewerFlagsService`** — inject directly from `EngagementModule` (global) for batch hydration of timeline post pages. Call `hydrate(viewerId, postIds)` to get a map.
2. **`REDIS_KEY.liked/bookmarked/reposted`** — same key constants; timeline uses `SISMEMBER` pattern via ViewerFlagsService.
3. **`counters:{postId}` hash** — timeline can read from Redis hash for hot counter display without hitting Postgres.
4. **`EngagementService`** — exported from EngagementModule; timeline can inject it for like/bookmark operations if needed (e.g. "likes tab").
5. **`liked:{userId}` set** — also used by `GET /users/:handle/likes` (timeline subtask); `SMEMBERS` or intersection queries possible.

---

## Key File Paths

| What | Where |
|------|-------|
| Migration | `src/infra/database/migrations/1704067200005-create-likes-bookmarks.ts` |
| Like entity | `src/modules/engagement/like.entity.ts` |
| Bookmark entity | `src/modules/engagement/bookmark.entity.ts` |
| EngagementService | `src/modules/engagement/engagement.service.ts` |
| EngagementController | `src/modules/engagement/engagement.controller.ts` |
| EngagementModule | `src/modules/engagement/engagement.module.ts` |
| ViewerFlagsService | `src/modules/engagement/viewer-flags.service.ts` |
| ViewerFlagsAdapter | `src/modules/engagement/viewer-flags.adapter.ts` |
| ViewerFlagsPort | `src/modules/posts/viewer-flags.port.ts` |
| NoopViewerFlagsService | `src/modules/posts/noop-viewer-flags.service.ts` |
| CountersReconcileProcessor | `src/modules/engagement/counters-reconcile.processor.ts` |
| Unit tests | `tests/unit/engagement/engagement.service.spec.ts` |
| Unit tests | `tests/unit/engagement/viewer-flags.service.spec.ts` |
| Unit tests | `tests/unit/engagement/counters-reconcile.spec.ts` |
