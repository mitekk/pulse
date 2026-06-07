# Backend Phase 2 — Subtask 6: Timelines + Home Hybrid Fan-out + Cache Hydration Summary

**Completed:** 2026-06-07
**Status:** All deliverables implemented. typecheck ✓ lint ✓ build ✓ tests ✓ (248 passing — 36 new)

---

## Module Created: `src/modules/timeline/`

| File | Role |
|------|------|
| `timeline.module.ts` | `TimelineModule` — imports FanoutProcessor (consumes `fanout` queue), TimelineTrimProcessor (consumes `timeline` queue); registers `timeline.trim` repeatable cron (daily midnight); exports TimelineService + PostCacheService + REALTIME_PUBLISHER_PORT |
| `timeline.service.ts` | Full timeline business logic — home feed (hybrid fan-out), user tabs, hashtag timeline, block-purge, zset trim |
| `timeline.controller.ts` | HTTP endpoints for all 6 timeline routes under global `api/v1` prefix |
| `fanout.processor.ts` | BullMQ `fanout.post` worker — celebrity skip, batch follower paging, ZADD NX + ZREMRANGEBYRANK trim, realtime pub |
| `timeline-trim.processor.ts` | BullMQ `timeline.trim` worker — caps all users' home zsets to 800 entries |
| `post-cache.service.ts` | Write-through cache helper: `post:{id}` Redis key, 4h TTL, mget/mset/del/delMany |
| `realtime-publisher.port.ts` | `REALTIME_PUBLISHER_PORT` interface — injectable seam for subtask 8 |
| `noop-realtime-publisher.service.ts` | No-op implementation — logs at debug; subtask 8 replaces with Socket.IO |

---

## HTTP Routes Implemented

All registered under global prefix `api/v1` in `TimelineController`.

| Method | Path | Guard | Notes |
|--------|------|-------|-------|
| GET | `/timeline/home` | AuthGuard | Hybrid fan-out: zset read → cache → Postgres fallback → celebrity pull-merge → visibility+viewer flags |
| GET | `/timeline/hashtag/:tag` | OptionalAuthGuard | Normalize tag (strip #, lowercase) → `post_hashtags` join → cursor paginated; empty if tag unknown |
| GET | `/users/:handle/posts` | OptionalAuthGuard | Author's posts + reposts by snowflake ID desc |
| GET | `/users/:handle/replies` | OptionalAuthGuard | Posts with `reply_to_id IS NOT NULL` |
| GET | `/users/:handle/media` | OptionalAuthGuard | Non-reply, non-repost posts (Phase 6 MediaModule adds real `post_media` join) |
| GET | `/users/:handle/likes` | OptionalAuthGuard | Joined from `likes` table; 403 if private account + viewer not follower |

---

## Home Timeline Read Path (ADR-0004 Hybrid Fan-out)

```
1. ZREVRANGEBYSCORE home:{userId} → cursor page of postIds (Snowflake scored)
2. MGET post:{id}  → cache hit map
3. Postgres fallback for misses  → backfill post:{id} with 4h TTL (mset pipeline)
4. Reconstruct Post-like stubs for cached DTOs  → VisibilityService.filterPostPage
5. isMuted check per author  → remove muted author posts
6. Celebrity pull-merge: raw SQL → find celebrity followees → recent posts (7-day window)
7. Merge + deduplicate by postId  → sort by Snowflake score DESC
8. ViewerFlagsService.hydrate(viewerId, finalIds)  → viewer flags on full page
9. Build PostDto list  → encodeScoreId cursor → return
```

**Cold-start fallback:** empty `home:{userId}` zset → pull recent posts from all active followees
via `SELECT ... WHERE author_id = ANY(:ids) ORDER BY id DESC`. Returns empty on no followees.

---

## Fan-out Worker (fanout.processor.ts)

**Queue:** `fanout`, job name: `fanout.post`
**Payload:** `{ postId, authorId, repostOf? }` (enqueued by PostsService on create/repost)

**Algorithm:**
1. Load author's `followersCount` to detect celebrity status
2. If `followersCount > CELEBRITY_FOLLOWER_THRESHOLD` → skip push (pull-merge at read time)
3. Page through active followers in batches of 500
4. Per follower: `ZADD home:{followerId} NX <score> <postId>` + `ZREMRANGEBYRANK 0 -801` (cap at 800)
5. After all batches: `PUBLISH timeline:newPosts { postId, authorId, totalPushed }` to Redis pub/sub
6. Call `RealtimePublisherPort.notifyNewTimelinePosts` (no-op until subtask 8)

**Idempotency:** ZADD NX means re-queued jobs cannot double-add.

---

## Post Cache (post-cache.service.ts)

```
Key:   post:{id}          → JSON string of PostDto
TTL:   4 hours (14400s)   → configured via static constant
Write: PostCacheService.set(dto) / mset(dtos[])
Read:  PostCacheService.get(id) / mget(ids[]) → Map<id, PostDto | miss>
Del:   del(id) / delMany(ids[])
```

Used by:
- `getHomeFeed`: MGET for cache hydration; mset to backfill misses
- Subtask 8 (RealtimeModule): may call `del(postId)` on real-time counter update or edit

---

## RealtimePublisherPort Seam

```typescript
export const REALTIME_PUBLISHER_PORT = 'REALTIME_PUBLISHER_PORT';

export interface RealtimePublisherPort {
  notifyNewTimelinePosts(userId: string, count: number, previewIds: string[]): Promise<void>;
}
```

- Provided in `TimelineModule` with `NoopRealtimePublisherService` (debug log only)
- Exported from `TimelineModule` via token so subtask 8 can override:
  ```typescript
  // RealtimeModule (subtask 8) — in AppModule:
  { provide: REALTIME_PUBLISHER_PORT, useClass: RealSocketIoPublisherService }
  ```
- Additionally, `FanoutProcessor` publishes `timeline:newPosts` to Redis pub/sub channel
  after each successful fan-out. Subtask 8's `RedisService.subscriber` can subscribe to
  this channel and emit `timeline.newPosts` Socket.IO events to all connected clients.

---

## Block-Purge Hook

`TimelineService.purgeBlockedPostsFromZset(blockerId, blockedId)`:
1. Fetch all posts by `blockedId` → `ZREM home:{blockerId} ...postIds`
2. Fetch all posts by `blockerId` → `ZREM home:{blockedId} ...postIds`
3. Both directions removed in a single pipeline

**Called by:** The hook comment in `UsersService.block()` from subtask 3 is the integration point. Subtask 8 (or the final wiring pass) injects `TimelineService` into `UsersModule` via the port pattern and calls this method on block.

---

## Timeline Trim Cron

**Queue:** `timeline`, job name: `timeline.trim`
**Schedule:** `0 0 * * *` (daily midnight UTC), registered in `TimelineModule.onModuleInit()`

Iterates all non-deleted users in batches of 500 and calls `ZREMRANGEBYRANK home:{userId} 0 -801`
for each. Catches stragglers — normal fan-out already trims on write but this cron provides a
safety net.

---

## Unit Tests (Vitest)

| File | Tests | Coverage |
|------|-------|----------|
| `tests/unit/timeline/fanout.processor.spec.ts` | 10 | Celebrity skip, normal fan-out, author-not-found, NX idempotency, batch pagination, realtime publish |
| `tests/unit/timeline/post-cache.service.spec.ts` | 11 | set/get round-trip, cache miss, Redis error fallback, mget hits+misses, mset, del/delMany, postKey format |
| `tests/unit/timeline/timeline.service.spec.ts` | 15 | Cache hit path, cache miss + Postgres fallback, cold-start (empty zset), visibility filter, viewer flags, block-purge, getUserPosts, getUserReplies, getUserLikes (public + private + follower), hashtag timeline (found + not found + # strip) |

**36 new tests; 248 total passing.**

---

## What Realtime+DMs+Notifications (Subtask 8) Builds On

1. **`REALTIME_PUBLISHER_PORT`** — inject from `TimelineModule` or override globally. The no-op is replaced with a real Socket.IO emitter that targets `user:{userId}` room with `timeline.newPosts` event.
2. **Redis pub/sub channel `timeline:newPosts`** — subscribe via `RedisService.subscriber` in `RealtimeModule`. Payload: `{ postId, authorId, totalPushed }`. Emit `timeline.newPosts` to affected user rooms.
3. **`TimelineService.purgeBlockedPostsFromZset`** — call from the block handler (inject `TimelineService` into a port or wire directly in `UsersModule` with a circular-safe pattern).
4. **`PostCacheService.del(postId)`** — call when a post is edited, deleted, or counters are updated (e.g., from the `counters.reconcile` processor or from the engagement write path) to keep the cache consistent.
5. **`home:{userId}` zset** — notifications module can read the newest entry's score to determine when the user last received a push, useful for badge debouncing.

---

## Key File Paths

| What | Where |
|------|-------|
| TimelineModule | `src/modules/timeline/timeline.module.ts` |
| TimelineService | `src/modules/timeline/timeline.service.ts` |
| TimelineController | `src/modules/timeline/timeline.controller.ts` |
| FanoutProcessor | `src/modules/timeline/fanout.processor.ts` |
| TimelineTrimProcessor | `src/modules/timeline/timeline-trim.processor.ts` |
| PostCacheService | `src/modules/timeline/post-cache.service.ts` |
| RealtimePublisherPort | `src/modules/timeline/realtime-publisher.port.ts` |
| NoopRealtimePublisherService | `src/modules/timeline/noop-realtime-publisher.service.ts` |
| Unit tests (fanout) | `tests/unit/timeline/fanout.processor.spec.ts` |
| Unit tests (post cache) | `tests/unit/timeline/post-cache.service.spec.ts` |
| Unit tests (timeline) | `tests/unit/timeline/timeline.service.spec.ts` |
