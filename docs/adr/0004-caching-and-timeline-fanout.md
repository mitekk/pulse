# ADR-0004: Caching & Home-Timeline Fan-out — Redis 7 with Hybrid Push/Pull Fan-out and BullMQ

- **Date**: 2026-06-07
- **Status**: Accepted
- **Deciders**: Lead architect; celebrity threshold default (10 000, env-configurable) confirmed at Step 1 gate

## Context and Problem Statement

The platform's home timeline is the highest-read, highest-write intersection in the system. Every post creation by any user must be delivered to every follower's timeline; every timeline read must return a consistent, ordered, low-latency page of posts. Two failure modes exist at scale: pure push fan-out creates write amplification proportional to follower count (a user with 1M followers triggers 1M Redis writes per post); pure pull fan-out at read time creates read amplification proportional to the number of accounts a user follows (querying every followee's recent posts on every page load). The spec (§14) mandates BullMQ for async jobs and Redis (§table) for timeline zsets, but does not prescribe which fan-out model to use. The choice must be made before any timeline code is written because it determines the data model for `home:{userId}` in Redis.

## Decision Drivers

- Write amplification from pure push is bounded only by follower count — an account with 10 000+ followers would create tens of thousands of Redis writes per post, degrading the fan-out job queue under viral activity.
- Read amplification from pure pull is bounded by the number of accounts followed — typically 100–500 for a normal user, but a page load that joins 500 followee timelines in real time is a Postgres throughput problem.
- The home timeline zset (`home:{userId}`, Snowflake-scored) must cap at ~800 entries to bound Redis memory per user — fan-out jobs must enforce this cap.
- Counters (likes, replies, reposts) are updated far more frequently than they are read; writing through to Postgres on every increment would create hot-row contention. Redis hash counters with periodic reconciliation are the standard solution.
- BullMQ is locked by spec §14; the fan-out, counter reconciliation, trend recomputation, and timeline trim jobs are all async by definition.
- Socket.IO horizontal scaling requires a shared pub/sub channel between API instances — Redis pub/sub is the natural choice given Redis is already in the stack.

## Considered Options

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| Hybrid fan-out: push for normal accounts (≤ threshold), pull-merge for celebrity accounts (> threshold) | Bounds write amplification for celebrity posts; bounds read amplification for normal timelines; threshold is configurable | Celebrity pull-merge at read time adds complexity (must merge push-zset with live celebrity queries and deduplicate); threshold detection requires `users.followers_count` to be accurate and cheap to query | **Selected** |
| Pure push fan-out | Simple read path (only one Redis zset per user); no per-request Postgres queries for timeline | Write amplification unbounded for celebrity accounts; a viral post from a 1M-follower account creates 1M BullMQ sub-jobs; catastrophic under load | Rejected |
| Pure pull fan-out | No write amplification; no zset to maintain; always consistent | Every page load queries recent posts from every followed account; at 500 followees this is 500 Postgres queries or a complex UNION — unacceptable read latency for the most common operation in the app | Rejected |
| Pure pull with aggressive timeline cache (pre-materialized per user on read) | Addresses pull latency; cache hit rate high for active users | Cache invalidation becomes identical to push fan-out — you must invalidate and re-materialize every follower's cache on every post; reverts to push complexity with worse semantics | Rejected |

## Decision Outcome

**Chosen**: Hybrid fan-out via BullMQ. On post/repost creation, a `fanout.post` job is enqueued. The job fetches all active followers and for each follower whose `followers_count` is ≤ `CELEBRITY_FOLLOWER_THRESHOLD` (default 10 000, env-configurable), it issues `ZADD home:{followerId} <snowflake_score> <postId>` + `ZREMRANGEBYRANK` to cap the zset at 800. Celebrity authors' posts are not pushed; instead, at read time, the celebrity pull-merge path queries recent posts from followed celebrity accounts in Postgres, merges with the zset results, deduplicates by post ID, and re-sorts by Snowflake score before returning the cursor page.

Redis roles beyond fan-out: `post:{id}` (hydrated PostDto, ~4h TTL), `user:{id}` (hydrated UserDto, ~1h TTL) for cache-aside read paths; `counters:{postId}` hash for hot counter deltas (reconciled to Postgres every 10 minutes by the `counters.reconcile` cron job); `notif:unread:{userId}` integer for the notification badge; `trends` + `trending:bucket:{tag}:{bucket}` for the trending computation; BullMQ queue backing; Socket.IO Redis adapter for cross-instance WS event delivery; `fanout:*` pub/sub channels for real-time domain event propagation.

**Rationale**: The hybrid model caps write amplification at `CELEBRITY_FOLLOWER_THRESHOLD` writes per post for the vast majority of accounts, while containing the celebrity read-merge overhead to the small number of celebrity accounts a given user follows — typically zero or a handful. The threshold is an env var so it can be tuned without a deploy. Detecting celebrity status dynamically via `users.followers_count` (a denormalized counter, reconciled) avoids a separate "celebrity flag" field that would need to be toggled explicitly. BullMQ is already mandated by the spec; using it for fan-out means the post creation HTTP response is not blocked by Redis writes and the fan-out is naturally retried on failure. The Redis pub/sub channel for Socket.IO ensures that a WS event emitted by one API instance reaches users connected to any other instance — essential for correctness in a horizontally scaled deployment.

**Positive Consequences**:
- Normal post creation is O(1) in the HTTP response path; fan-out is async and retried.
- Timeline reads for normal users hit only Redis (zset + cache) on the hot path — Postgres is consulted only for cache misses and for the celebrity pull-merge.
- Counter increments are non-blocking (Redis HINCRBY); the 10-minute reconciliation cron corrects any drift without requiring distributed transactions.

**Negative Consequences / Risks**:
- Celebrity pull-merge at read time adds a conditional Postgres query on every home timeline page load for users who follow at least one celebrity account. This query must be index-optimized (`(author_id, id DESC)` on `posts`) and must be bounded by a time window (e.g., posts in the last 7 days) to prevent full-table scans.
- The `CELEBRITY_FOLLOWER_THRESHOLD` creates a cliff: an account crossing the threshold has its future posts no longer pushed to follower zsets, but its historical posts remain in those zsets. A brief inconsistency window exists until zsets are trimmed. This is accepted as an eventual-consistency trade-off.
- Counter drift between Redis and Postgres is always possible under network partition or crash. The reconciliation cron corrects this but introduces a ≤10-minute window of potentially stale counts. `UPDATE ... SET count = count + 1` (not read-modify-write) is required for all Postgres counter increments to prevent race conditions.
- BullMQ fan-out jobs must be idempotent — a retried job must not double-add a post to a follower's zset. Using `ZADD NX` (only add if not present) satisfies this.

## Links

- Related: ADR-0001 (BullMQ runs in-process within the NestJS monolith; seam to separate worker service exists)
- Related: ADR-0002 (Snowflake IDs used as zset scores for time-ordered pagination)
- Implemented in: `apps/api/src/modules/timeline/`, `apps/api/src/infra/redis/`, `apps/api/src/infra/queue/`
