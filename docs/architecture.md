# Architecture Plan — Microblogging Platform

**PRD source:** `docs/prd/PRD-current.md` (v1)
**Planned:** 2026-06-07
**Status:** awaiting confirmation

---

## Goal

Build a full-featured v1 microblogging platform (posts, follow graph, timelines, DMs, notifications, search, media, real-time) as a NestJS modular monolith backed by PostgreSQL and Redis, delivering every feature in the PRD spec.

---

## Greenfield Assumptions

No starter codebase exists. All stack choices below are locked by the human's intake answers and override any framework rule-file defaults where they conflict.

| Concern | Choice | Rationale |
|---|---|---|
| Backend framework | NestJS modular monolith (TypeScript) | Spec-locked; module boundaries kept clean for future split |
| Frontend framework | React + Vite + TypeScript | CLAUDE.md default; spec Part II confirms |
| Database | PostgreSQL 16 | Relational; follow graph, visibility, joins |
| Cache / pubsub | Redis 7 | Timeline zsets, post/user cache, BullMQ, Socket.IO adapter, pubsub |
| Queue | BullMQ (in-process, Redis-backed) | Spec §14; seam to split to worker service later |
| Real-time | Socket.IO + `@socket.io/redis-adapter` | Spec §5; rooms, reconnect, horizontal scale |
| ORM / migrations | TypeORM (NestJS-native) with raw `.query()` for keyset/FTS paths; no `synchronize`, reversible migrations only | Avoids fighting raw SQL; see ADR |
| Password hashing | argon2id | Spec §10 + security.md |
| Auth tokens | Short-lived access JWT (~15m, memory) + rotating refresh token (httpOnly cookie, hashed in `sessions` table) | Spec §10 reconciled with security.md |
| ID strategy | Snowflake BIGINT for posts/messages/notifications/sessions; **UUID for users (locked)** | Spec §1.3 |
| Pagination | Keyset/cursor everywhere; `{ items, cursor, hasMore }` envelope | Spec §1.4 overrides api.md offset default |
| Object storage | MinIO (local dev / self-hosted); S3-compatible interface | Media pipeline §9 |
| Input validation | `class-validator` DTOs, global `ValidationPipe`, whitelist + forbid-unknown | Spec §10 |
| Search | Postgres FTS + trigram behind `SearchPort` interface | Spec §8.1; swap to OpenSearch later |
| Frontend state | TanStack Query (server state) + Zustand (UI/client state) + React Hook Form + Zod | Spec Part II §C1.2 |

---

## Component & Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client (Browser)                        │
│  React SPA (Vite)                                               │
│  TanStack Query ←→ REST /api/v1      Zustand (UI state)         │
│  Socket.IO client ←────────────────────WS /socket.io            │
└───────────┬─────────────────────────────────┬───────────────────┘
            │ HTTP                             │ WebSocket
            ▼                                 ▼
┌───────────────────────────────────────────────────────────────┐
│                  NestJS API (port 3000)                        │
│                                                               │
│  HTTP Layer (Fastify transport)                               │
│    GlobalPipes │ AuthGuard │ RateLimitGuard │ ExceptionFilter  │
│                                                               │
│  Domain Modules:                                              │
│    auth      users     posts     timeline   engagement        │
│    media     messaging notifications search  hashtags         │
│    realtime                                                   │
│                                                               │
│  Common:  guards │ interceptors │ pipes │ filters             │
│  Infra:   db(TypeORM) │ redis │ queue(BullMQ) │ storage(MinIO)│
│                                                               │
│  WS Gateway (Socket.IO)                                       │
│    rooms: user:{id}  conversation:{id}  post:{id}            │
└──────┬──────────────────────────┬──────────────────────────┬──┘
       │ TypeORM                  │ ioredis                  │ BullMQ
       ▼                          ▼                          ▼
┌─────────────┐    ┌──────────────────────────┐    ┌────────────────┐
│ PostgreSQL  │    │          Redis            │    │  MinIO/S3      │
│ 16-alpine   │    │  - post:{id} cache (TTL) │    │  (media files) │
│             │    │  - user:{id} cache (TTL) │    └────────────────┘
│ Tables:     │    │  - home:{userId} zset    │
│ users       │    │  - counters hash         │
│ posts       │    │  - notif:unread:{userId} │
│ follows     │    │  - trends cached payload │
│ likes       │    │  - BullMQ queues         │
│ bookmarks   │    │  - Socket.IO adapter     │
│ media       │    │  - Redis pub/sub         │
│ post_media  │    └──────────────────────────┘
│ mentions    │
│ hashtags    │
│ post_htags  │
│ convs       │
│ conv_parts  │
│ conv_dyads  │
│ messages    │
│ notifs      │
│ blocks      │
│ mutes       │
│ sessions    │
│ reports     │
└─────────────┘
```

**Cross-instance fan-out path:**
Domain event (e.g. message created) → Redis pub/sub channel → every API instance subscribed → re-emit to local sockets in target room → client cache update.

---

## NestJS Module Map (spec §1.1)

```
apps/api/src/
  modules/
    auth/           AuthModule      — registration, login, token rotation, sessions
    users/          UsersModule     — profiles, follow graph, blocks, mutes, visibility
    posts/          PostsModule     — CRUD, replies, reposts, quotes, entity extraction
    timeline/       TimelineModule  — home hybrid fan-out, user/replies/media/likes tabs
    engagement/     EngagementModule — likes, bookmarks, denorm counters
    media/          MediaModule     — presigned upload, finalize, processing job
    messaging/      MessagingModule — DM conversations, messages, read receipts
    notifications/  NotificationsModule — creation, delivery, aggregation, unread
    search/         SearchModule    — FTS + trigram, SearchPort interface
    hashtags/       HashtagsModule  — extraction, tag timeline, trending
    realtime/       RealtimeModule  — Socket.IO gateway, room manager, Redis pub/sub
  common/
    guards/         AuthGuard, OptionalAuthGuard, OwnershipGuard, RateLimitGuard
    interceptors/   LoggingInterceptor, TransformInterceptor
    pipes/          global ValidationPipe (whitelist, forbidNonWhitelisted)
    filters/        AllExceptionsFilter → standard error envelope
    decorators/     CurrentUser, Public
  infra/
    database/       TypeORM config, SnowflakeUtil, CursorUtil
    redis/          RedisModule (ioredis), pub/sub service
    queue/          BullMQ config, job definitions
    storage/        MinioStorageService (S3-compatible interface → StoragePort)
```

---

## Data Model Summary

All tables use `snake_case`. Every table has `created_at` (and `updated_at` where mutable). Soft-delete via `deleted_at` where noted. All FKs have an index.

### ID Strategy
- **Posts, messages, notifications, sessions:** Snowflake BIGINT — time-ordered, cursor-friendly. Serialized as **strings** in all JSON (DTOs).
- **Users:** UUID (locked) — avoids enumeration for public-facing ids.
- Snowflake util: epoch + machine id + sequence; fits in JavaScript safe integer range when stringified.

### Tables & Key Relationships

| Table | PK | Key FKs / Constraints | Key Indexes |
|---|---|---|---|
| `users` | uuid | — | `UNIQUE(handle citext)`, `UNIQUE(email citext)`, GIN trigram on `handle`, `display_name` |
| `sessions` | bigint snowflake | `user_id → users` | `(user_id, expires_at)` for session list/cleanup |
| `posts` | bigint snowflake | `author_id → users`, `reply_to_id`, `reply_root_id`, `repost_of_id`, `quote_of_id` (all self-FK nullable) | `(author_id, id DESC)`, `(reply_to_id, id)`, `(conversation_id, id)`, partial `(repost_of_id)`, partial `(quote_of_id)`, GIN tsvector FTS; `UNIQUE(author_id, repost_of_id)` partial where not null |
| `follows` | `(follower_id, followee_id)` | both → users; CHECK `follower_id <> followee_id` | `(followee_id, follower_id)` for followers list |
| `likes` | `(user_id, post_id)` | both FKs | `(post_id)`, `(user_id, post_id)` |
| `bookmarks` | `(user_id, post_id)` | both FKs | `(user_id, post_id DESC)` |
| `mentions` | `(post_id, mentioned_user_id)` | both FKs | — |
| `hashtags` | bigint | `UNIQUE(tag citext)` | — |
| `post_hashtags` | `(post_id, hashtag_id)` | both FKs | `(hashtag_id, post_id DESC)` for tag timeline |
| `media` | bigint snowflake | `owner_id → users` | `(owner_id, created_at DESC)` |
| `post_media` | `(post_id, media_id)` | both FKs | — |
| `conversations` | bigint snowflake | — | — |
| `conversation_participants` | `(conversation_id, user_id)` | both FKs | `(user_id, conversation_id)` |
| `conversation_dyads` | `(user_lo, user_hi)` | `UNIQUE(user_lo, user_hi)` | — |
| `messages` | bigint snowflake | `conversation_id`, `sender_id` | `(conversation_id, id DESC)` |
| `notifications` | bigint snowflake | `recipient_id`, `actor_id`, `post_id` (null) | `(recipient_id, id DESC)`, partial `(recipient_id) WHERE read_at IS NULL` |
| `blocks` | `(blocker_id, blocked_id)` | both FKs | `(blocked_id)` |
| `mutes` | `(muter_id, muted_id)` | both FKs | `(muted_id)` |
| `reports` | bigint snowflake | `reporter_id → users` | `(target_type, target_id)` |

### Important Notes
- `posts.conversation_id` = root post id; groups a thread.
- `posts.repost_count` counts reposts + quotes combined.
- `conversation_dyads` enforces canonical 1:1 conversations: `user_lo < user_hi` ordering.
- `citext` extension required for case-insensitive handle/email lookups.
- `pg_trgm` extension required for GIN trigram indexes.
- Migrations: reversible up/down SQL via TypeORM migrations. **Never** `synchronize: true`.

---

## Home Timeline: Hybrid Fan-out Design

**Push (normal accounts, ≤ threshold followers):**
1. Post/repost created → `fanout.post` BullMQ job.
2. Job fetches all active followers, skips "celebrity" (> N followers, e.g. 10k).
3. For each follower: `ZADD home:{followerId} <snowflake_score> <postId>` + `ZREMRANGEBYRANK home:{followerId} 0 -(CAP+1)` (cap ~800).

**Pull (celebrity accounts):**
- At read time: fetch `ZREVRANGE home:{userId}` IDs (push-set) + live query recent posts from followed celebrity accounts → merge + dedupe + sort.

**Read path:**
1. `ZREVRANGEBYSCORE home:{userId}` → cursor page of IDs.
2. `MGET post:{id}` → Redis cache hits.
3. Misses → batch Postgres query → backfill cache.
4. Apply visibility filter (blocks, private, deleted).
5. Per-viewer flags: pipelined `SISMEMBER liked:{userId} {postId}` (or equivalent).
6. Return cursor page.

**Repost timeline entry:** scored by repost snowflake ID (repost time), not original post time.

---

## Redis Roles & Key Taxonomy

| Key pattern | Structure | TTL / Cap | Purpose |
|---|---|---|---|
| `post:{id}` | string (JSON) | ~4h TTL | Hydrated PostDto sans viewer flags |
| `user:{id}` | string (JSON) | ~1h TTL | Hydrated UserDto/ProfileDto |
| `home:{userId}` | zset (score=snowflake) | cap ~800 | Home timeline post IDs |
| `counters:{postId}` | hash (likes, replies, reposts, bookmarks) | no TTL; reconciled | Hot counter deltas |
| `notif:unread:{userId}` | int | no TTL; reconciled | Unread notification badge |
| `trends` | string (JSON) | ~5min TTL | Cached trending tags payload |
| `trending:bucket:{tag}:{minute_bucket}` | int | ~12h TTL | Time-bucketed tag increments for trending |

**Pub/sub channels:** `fanout:timeline`, `fanout:notification`, `fanout:dm`, `fanout:counters` — any instance publishes, all instances subscribe and re-emit to local sockets.

---

## WebSocket Rooms & Events

**Rooms:**
- `user:{id}` — joined on connect for the authenticated user; personal delivery channel.
- `conversation:{id}` — joined when a DM thread is open; left on close.
- `post:{id}` — joined when thread detail view is active (optional, throttled joins).

**Server → client events** (per spec §5.3):

| Event | Payload | Room |
|---|---|---|
| `notification.new` | NotificationDto | `user:{id}` |
| `timeline.newPosts` | `{ count: number, previewIds: string[] }` | `user:{id}` |
| `dm.message` | MessageDto | `conversation:{id}` + recipients' `user:{id}` |
| `dm.typing` | `{ conversationId: string, userId: string }` | `conversation:{id}` |
| `dm.read` | `{ conversationId: string, userId: string, lastReadMessageId: string }` | `conversation:{id}` |
| `post.counters` | `{ postId: string, likes: number, replies: number, reposts: number }` | `post:{id}` |
| `follow.update` | `{ type: 'followed'|'unfollowed'|'requested', actorId: string }` | `user:{id}` |

**Client → server events** (per spec §5.4):

| Event | Payload |
|---|---|
| `dm.send` | `{ conversationId: string, text?: string, mediaId?: string, clientNonce: string }` |
| `dm.typing` | `{ conversationId: string }` |
| `dm.markRead` | `{ conversationId: string, lastReadMessageId: string }` |
| `subscribe.post` | `{ postId: string }` |
| `unsubscribe.post` | `{ postId: string }` |

---

## BullMQ Job List

| Queue | Job | Trigger | Work |
|---|---|---|---|
| `fanout` | `fanout.post` | post/repost created | Push postId into follower home zsets; skip celebrity authors |
| `media` | `media.process` | finalize called | Validate mime/size, strip EXIF, generate variants, transcode video, update status |
| `notifications` | `notify.deliver` | notification row created | Emit WS `notification.new`; push provider hook (no-op v1) |
| `search` | `search.index` | post create/delete | Update tsvector column or external index (SearchPort) |
| `counters` | `counters.reconcile` | cron (every 10m) | Recompute denorm counts from source tables, correct Redis + Postgres drift |
| `trends` | `trends.recompute` | cron (every 5m) | Rebuild trending payload from time-bucketed Redis counters |
| `timeline` | `timeline.trim` | cron (every 1h) | Ensure home zsets are capped at 800 |
| `sessions` | `session.cleanup` | cron (every 6h) | Delete expired/revoked sessions |

All jobs: idempotent, retries with exponential backoff, dead-letter queue on repeated failure.

---

## Ordered Task List

> Execution sequence: data model → migrations → API routes → auth → frontend → tests → Docker → CI

### Backend Phase 1 — Foundation [MVP]

- [MVP] Initialize NestJS app with Fastify adapter; set up `@nestjs/config`, helmet, CORS allow-list.
- [MVP] TypeORM config; `pg_trgm` + `citext` extensions; migration baseline (empty schema).
- [MVP] `SnowflakeUtil` — 64-bit ID generator (epoch, machine ID, sequence).
- [MVP] `CursorUtil` — opaque base64 encode/decode for `(id)` and `(score, id)` cursors.
- [MVP] Global `ValidationPipe` (whitelist, forbidNonWhitelisted), `AllExceptionsFilter` (error envelope), `LoggingInterceptor`.
- [MVP] `RedisModule` (ioredis singleton), `BullMQ` module config, `StoragePort` interface + `MinioStorageService`.
- [MVP] `RateLimitGuard` (Redis token bucket, per-user+route and per-IP for auth routes).
- [MVP] `GET /health` — returns `{ status: "ok" }`, pings DB + Redis.
- [MVP] `Dockerfile` (multi-stage builder/runner, non-root user).
- [MVP] Root `docker-compose.yml` — PostgreSQL 16, Redis 7 (maxmemory + allkeys-lru), MinIO, backend service with health checks.
- [MVP] `docker-compose.override.yml` — backend volume mount + `tsx watch` hot reload; dev ports.
- [MVP] `.env.example` with all required vars.

### Backend Phase 2 — Auth + Users + Follow Graph [MVP]

- [MVP] Migration: `users`, `sessions` tables + indexes.
- [MVP] Auth: register (argon2id hash, email-verification token), login (access JWT + rotating refresh token hashed in sessions), refresh (detect reuse, rotate), logout (revoke session).
- [MVP] Refresh token in httpOnly + Secure + SameSite=Strict cookie; CSRF double-submit protection on the refresh route.
- [MVP] `AuthGuard`, `OptionalAuthGuard`, `CurrentUser` decorator.
- [MVP] `GET /api/v1/auth/me`, `GET /api/v1/auth/sessions`, `DELETE /api/v1/auth/sessions/:id`.
- [MVP] `POST /api/v1/auth/verify-email`.
- [MVP] Migration: `follows`, `blocks`, `mutes` tables + indexes.
- [MVP] Users module: `GET /api/v1/users/:handle` (profile + relationship flags), `PATCH /api/v1/users/me`.
- [MVP] Follow endpoints: follow/unfollow, pending state for private accounts, accept/decline.
- [MVP] Block/mute endpoints + `VisibilityService` (apply on every read: blocks, private, muted, deleted).
- [MVP] Follow-request list + accept/decline endpoints.
- [MVP] `GET /api/v1/users/:handle/followers`, `GET /api/v1/users/:handle/following` (cursor).

### Backend Phase 3 — Posts + Entity Extraction + Threads [MVP]

- [MVP] Migration: `posts`, `mentions`, `hashtags`, `post_hashtags` tables + all indexes (including GIN tsvector).
- [MVP] `PostsService`: create (text length in codepoints, URL=23), reply (policy check), repost (toggle, unique), quote, soft-delete (tombstone).
- [MVP] Entity extractor: single-pass mention + hashtag + URL extraction on post create.
- [MVP] `GET /api/v1/posts/:id` (+ viewer engagement flags), `DELETE /api/v1/posts/:id`.
- [MVP] `GET /api/v1/posts/:id/thread` — ancestors + focused + ranked replies.
- [MVP] `GET /api/v1/posts/:id/replies`, `/reposts`, `/quotes`, `/likes` (cursor).
- [MVP] `POST /api/v1/posts/:id/repost` | `DELETE` (toggle).

### Backend Phase 4 — Engagement + Counters [MVP]

- [MVP] Migration: `likes`, `bookmarks` tables + indexes.
- [MVP] Like/unlike toggle (idempotent), bookmark/unbookmark toggle; update denorm counters transactionally + Redis counter.
- [MVP] `GET /api/v1/bookmarks` (self, cursor).
- [MVP] `counters.reconcile` BullMQ cron job — recompute from source, correct drift.

### Backend Phase 5 — Timelines [MVP]

- [MVP] `TimelineService`: user timeline (pull, keyset), replies tab, media tab, likes tab (privacy-gated).
- [MVP] Home timeline read path: zset fetch → cache hydration → visibility filter → merge celebrity pull → cursor page.
- [MVP] `fanout.post` BullMQ job — push to follower home zsets, skip celebrity threshold.
- [MVP] Celebrity detection flag + pull-merge on read path.
- [MVP] `GET /api/v1/timeline/home`, `GET /api/v1/users/:handle/posts|replies|media|likes`.
- [MVP] `GET /api/v1/timeline/hashtag/:tag`.

### Backend Phase 6 — Media Pipeline [MVP]

- [MVP] Migration: `media`, `post_media` tables.
- [MVP] `POST /api/v1/media/upload-url` — generate presigned MinIO URL, create media row `status=pending`.
- [MVP] `POST /api/v1/media/:id/finalize` — enqueue `media.process` job.
- [MVP] `media.process` BullMQ job — validate mime/size, strip EXIF (sharp/ffmpeg), generate variants (thumb/small/medium/large for images; MP4 transcode + poster for video; first-frame for GIF), update `variants` jsonb + `status=ready`.
- [MVP] `GET /api/v1/media/:id` (metadata/status), `PATCH /api/v1/media/:id` (alt text).
- [MVP] Attach media: validate `status=ready` + ownership at post-create time.

### Backend Phase 7 — Realtime + DMs + Notifications [MVP]

- [MVP] Migration: `conversations`, `conversation_participants`, `conversation_dyads`, `messages` tables.
- [MVP] Socket.IO gateway + `@socket.io/redis-adapter`; auth on connect (access token in handshake); room join/leave lifecycle.
- [MVP] Redis pub/sub service — publish domain events, all instances subscribe + re-emit.
- [MVP] DM REST endpoints: `GET /api/v1/conversations`, `POST /api/v1/conversations`, `GET /api/v1/conversations/:id/messages`, `POST /api/v1/conversations/:id/messages`, `POST /api/v1/conversations/:id/read`, `POST|DELETE /api/v1/conversations/:id/mute`.
- [MVP] WS `dm.send` event handler (same service as REST); clientNonce dedup.
- [MVP] `dm.typing` ephemeral relay; `dm.markRead` relay + DB update.
- [MVP] Migration: `notifications` table.
- [MVP] `NotificationsService` — create on like/reply/repost/quote/mention/follow/follow_request/dm; suppress self-notifs; respect mutes/blocks; collapse duplicates.
- [MVP] `notify.deliver` job — emit WS `notification.new`; unread badge in Redis.
- [MVP] `GET /api/v1/notifications` (cursor, aggregated), `GET /api/v1/notifications/unread-count`, `POST /api/v1/notifications/read`.
- [MVP] `timeline.newPosts` WS event — emit after fan-out job completes.

### Backend Phase 8 — Search + Hashtags + Trends + Reports + Hardening [MVP]

- [MVP] `SearchPort` interface; `PostgresSearchAdapter` implementation (FTS + trigram).
- [MVP] `search.index` BullMQ job — update tsvector on post create/delete.
- [MVP] `GET /api/v1/search?q=&type=` (cursor, types: top/latest/people/media).
- [MVP] `GET /api/v1/search/suggest?q=` — typeahead (users + tags).
- [MVP] `trends.recompute` cron job — time-bucketed Redis counters → sorted trends list.
- [MVP] `GET /api/v1/trends` — return cached trends payload.
- [MVP] Migration: `reports` table.
- [MVP] `POST /api/v1/reports` — store only in v1.
- [MVP] Rate-limit hardening: per-route limits as per spec §15 (post 300/3h, follow 400/day, like 1000/day, DM 500/day, login 10/10min/IP).
- [MVP] `session.cleanup` cron job.
- [NICE] `from:handle` search operator.
- [NICE] OpenAPI doc generation (`@nestjs/swagger`).

---

### Frontend Phase 1 — Shell + Auth [MVP]

- [MVP] Vite + React + TypeScript scaffold; Tailwind + token layer (CSS vars: color, radius, spacing, typography, motion).
- [MVP] React Router v6 nested routes; modal-as-route pattern (`location.state.background`).
- [MVP] App shell: three-column desktop / collapsed tablet / bottom-tab mobile; sticky contextual header.
- [MVP] Auth store (Zustand): access token in memory, axios/fetch interceptor (401 → refresh → replay queue → logout).
- [MVP] AuthGuard wrapper; `returnTo` redirect preserve.
- [MVP] `/login`, `/register` pages (client-side validation mirroring §15 limits); handle live-availability check.
- [MVP] `/verify-email` page (token from query param).
- [MVP] Light + dark theme toggle; `prefers-color-scheme` default; persisted in localStorage.
- [MVP] `docker-compose.override.yml` frontend volume + `npm run dev` hot reload.

### Frontend Phase 2 — API Client + Real-time Infrastructure [MVP]

- [MVP] Typed REST client modules (`lib/api/`) — one file per backend domain; all return typed responses aligned to DTOs in spec §12.
- [MVP] Shared types (`types/api.ts`) — `PostDto`, `UserDto`, `ProfileDto`, `NotificationDto`, `MessageDto`, all with string IDs.
- [MVP] TanStack Query config: query keys per spec §C6.1; staleTime, gcTime.
- [MVP] `useInfiniteList` hook — wraps `useInfiniteQuery` with cursor `getNextPageParam`, intersection-observer sentinel, flattened `items`.
- [MVP] Socket.IO client: connect on auth mount, access token in handshake; reconnect backfill (refetch unread counts, invalidate open conversation).
- [MVP] Room manager: join `user:{me}` on session; `conversation:{id}` on DM open; `post:{id}` on thread view.
- [MVP] Event router — maps WS events to Query cache mutations (no refetch): `dm.message`, `dm.typing`, `dm.read`, `notification.new`, `timeline.newPosts`, `post.counters`, `follow.update`.
- [MVP] Token refresh: re-emit auth to socket on access token rotation.

### Frontend Phase 3 — Timeline + PostCard + Composer + Thread [MVP]

- [MVP] `PostCard` component — handles normal, reply, repost (attribution), quote (embedded card), tombstone variants; rich entity rendering (`RichText` with mention/hashtag/URL links using backend `entities` offsets).
- [MVP] `ActionBar` — reply, repost menu (Repost | Quote), like, bookmark, share; `data-testid` on every button.
- [MVP] Engagement optimistic mutations (`patchPostInCaches` helper — patches post in all query caches by ID).
- [MVP] Home timeline page: `useInfiniteList` + `InfiniteList` wrapper + virtualizer; "N new posts" pill (WS-driven, no auto-inject); pull-to-refresh mobile.
- [MVP] `PostComposer` — new post / reply / quote modes; character counter (codepoints, URL=23, ring indicator); entity highlighting (live tokenizer, composer only); mention autocomplete (`/search/suggest`); hashtag autocomplete; reply-policy selector; draft in Zustand.
- [MVP] Media attach in composer: file select → validate → upload-url → direct upload → finalize → poll ready; progress bars; alt-text per image; reorder/remove; block submit while processing.
- [MVP] `/compose` modal route; inline composer at top of home + in thread.
- [MVP] Thread view (`/:handle/status/:postId`): ancestors chain + focused post + reply composer (reply-policy aware) + ranked replies infinite.
- [MVP] `/:handle/status/:postId/photo/:idx` lightbox modal route: full-size image, swipe/keyboard nav, alt-text, pinch-zoom.

### Frontend Phase 4 — Profile + Follow [MVP]

- [MVP] Profile header: banner, avatar, display name, handle, verified mark, rich bio, location/website/join date, counts.
- [MVP] Relationship-aware `FollowButton` — Follow / Requested / Following / Blocked states; private-account pending state.
- [MVP] Overflow menu: mute, block, report, copy link, message.
- [MVP] Profile tabs: Posts / Replies / Media / Likes (each `useInfiniteList`); Media tab as grid; Likes privacy gate.
- [MVP] Private-account lock state (not following viewer).
- [MVP] `/settings/account` — profile edit form (PATCH /users/me); `is_private` toggle; `dm_privacy` toggle.
- [MVP] Followers / following lists (`/:handle/followers`, `/:handle/following`).
- [NICE] "Who to follow" suggestions block (right sidebar / explore).

### Frontend Phase 5 — Notifications + Search + Explore [MVP]

- [MVP] Notifications list: infinite, aggregated rendering (up to 3 actor avatars + "and N others"); per-type icons; mark-all-read on page open; unread badge.
- [MVP] Follow-request inline Accept/Decline actions.
- [MVP] Mentions sub-tab filter.
- [MVP] Search page (`/search?q=&type=`): tabs Top / Latest / People / Media; each `useInfiniteList`; debounced typeahead via `/search/suggest`; `#tag` and `@handle` short-circuit routing.
- [MVP] Explore/Trends page: cached `/trends` list; each trend links to tag timeline; "who to follow" block.
- [NICE] `from:handle` search operator support.

### Frontend Phase 6 — Messaging [MVP]

- [MVP] Conversation list (`/messages`): unread dots; ordered by latest message; live-bumped via WS `dm.message`.
- [MVP] Conversation thread (`/messages/:id`): infinite history (reverse paginate on scroll up); virtualized message bubbles; grouped by sender + time proximity; delivery/read ticks from `dm.read`; typing indicator from `dm.typing` (Zustand, auto-expire 4s).
- [MVP] DM composer: text + media (media pipeline); clientNonce optimistic send; failed-state retry.
- [MVP] Read-on-view: emit `dm.markRead` when bottom visible; clear unread.
- [MVP] DM permission gate: disable composer if not allowed (explain).
- [MVP] New message modal (`/compose/dm`): user typeahead → `POST /conversations` → navigate to thread.

### Frontend Phase 7 — Design System + DX + Docker [MVP]

- [MVP] Design-system primitives (spec §C18): `Button` (variants/sizes/loading), `IconButton`, `Avatar` (sizes, verified ring), `Modal`/`Dialog` (focus-trap, route-aware), `Drawer`, `Tabs`, `Menu`/`Dropdown`, `Tooltip`, `Toast`, `Spinner`/`Skeleton`, `TextInput`/`TextArea` (counter variant), `Toggle`, `Badge`/`Counter`, `EmptyState`, `ConfirmDialog`, `RelativeTime`, `LinkifiedText`, `MediaGrid`, `InfiniteList`, `UserCard`/`UserRow`.
- [MVP] `data-testid` coverage on all interactive elements.
- [MVP] `Dockerfile` (multi-stage, non-root user, Vite build).
- [MVP] `docker-compose.yml` frontend service entry.
- [NICE] `prefers-reduced-motion` support; WCAG 2.1 AA audit (§C20 pending in PRD-v1.1).
- [NICE] Scroll position restore per-route.
- [NICE] List virtualization (home, DM history, thread replies).

---

### QA Phase [MVP]

- [MVP] Unit tests (Vitest): PostsService (posting rules, visibility, reply-policy, thread assembly), EngagementService (counter math, idempotency), SnowflakeUtil, CursorUtil, VisibilityService.
- [MVP] Integration tests (`tests/integration/`): every REST endpoint incl. auth flows, visibility edge cases (private accounts, blocks, mutes, deleted tombstones, celebrity fan-out path).
- [MVP] E2E tests (Playwright, `tests/e2e/`): post → fan-out → home timeline appearance; DM send → WS delivery → read receipt; follow-request → accept → protected post visibility.
- [MVP] WS tests: multi-instance fan-out via Redis adapter; idempotent message nonce.
- [MVP] CI workflow (`.github/workflows/ci.yml`): lint → unit-test → integration-test → e2e → build (job sequence per ci.md).
- [MVP] 80% line coverage gate.
- [NICE] Load smoke: timeline read latency with warm cache; celebrity-author read-path merge.

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Snowflake ID exceeds JS `Number.MAX_SAFE_INTEGER` | High | Always serialize as strings in DTOs; use `BigInt` in Node internals; test JSON serialization in TypeORM entity transformer |
| Fan-out job overload with large follower counts (celebrity threshold) | High | Celebrity pull-merge path must be implemented before any real load; threshold in config, not hardcoded |
| Redis home zset warm-cold split: new users have empty zsets | Medium | On first home timeline read with empty zset, fall back to pull-from-postgres for recent posts from followees |
| TypeORM keyset pagination fighting ORM abstractions | Medium | Use raw `.query()` for all cursor/keyset queries; TypeORM for entity management only |
| Socket.IO Redis adapter version compatibility with NestJS gateway | Medium | Pin versions; test in Docker with two backend replicas before wiring production fan-out |
| Media processing (ffmpeg/sharp) in-process memory pressure | Medium | Run `media.process` job in a separate BullMQ worker thread (Node `worker_threads`) or separate service if memory is constrained |
| `citext` extension requires superuser on some managed PG hosts | Low | Document in README; MinIO presigned URLs require correct host/port config in Docker networking |
| PRD §C19+/§C20 truncation — accessibility spec incomplete | Low | Block only the frontend theming/design-system task on PRD-v1.1; all other frontend tasks can proceed |
| Counter drift under high write concurrency | Low | Reconciliation cron covers this; use `UPDATE ... SET count = count + 1` (not read-modify-write) for all increments |

---

## Open Questions

> These are genuine blockers or decisions that must be made before the affected phase begins.

1. **User ID type — RESOLVED: UUID.** Locked by the human at the Step 1 confirmation gate. `users.id` is `uuid`; all time-ordered entities (posts/messages/notifications/sessions) remain Snowflake BIGINT. Captured in ADR-0002.

2. **Celebrity threshold value:** The fan-out cutover threshold (spec says "e.g. 10k") must be a configurable env var. Confirm the default and whether to detect dynamically or mark accounts explicitly.

3. **Viewer-flag implementation for likes/reposts:** Two viable patterns — `SISMEMBER liked:{userId} {postId}` (per-post sets) vs. `SISMEMBER user-liked:{userId} {postId}` (per-user sets). Pick one and stick to it everywhere (backend ADR decision).

4. **Video transcoding tooling:** `ffmpeg` binary available in the runner Docker image? If using `sharp` for images (recommended), a separate `ffmpeg` install is needed for video. Confirm approach before Phase 6.

5. **PRD-v1.1 (§C19+/§C20):** Frontend theming details (typography, motion scale, etc.) and accessibility spec are truncated. The human must append and re-run `/prd` before the frontend Phase 7 (design-system) task is dispatched.

6. **Email sending for verification — RESOLVED: log-only in dev.** Locked by the human. Build the full verification flow + tables, but in dev/Docker log the token to the backend console instead of sending real email (no SMTP provider dependency). Document in `.env.example` and README. A real provider can slot in behind the same service interface later.

### Also resolved at the gate
- **Celebrity threshold:** env var `CELEBRITY_FOLLOWER_THRESHOLD=10000`, detected dynamically via `users.followers_count`.
- **Viewer-flag Redis pattern:** deferred to the backend ADR; recommendation is per-user sets (`user-liked:{userId}` etc.) for efficient pipelined hydration across a page of posts.
- **Video transcoding:** install `ffmpeg` in the backend image; `sharp` for images.

---

## DX Requirements

Both addressed as [MVP] tasks:

- **Backend hot reload:** `tsx watch src/main.ts` via `docker-compose.override.yml` volume mount. Code changes reflect without image rebuild.
- **Frontend HMR:** Vite dev server with `server.proxy` for `/api` and WS proxy for Socket.IO. Works inside Docker via the override file.
- **`docker-compose.override.yml`** provided for both services (Phase 1 backend, Phase 7 frontend).
- **README DX section:** setup steps, env vars, `docker compose up`, `npm run test`, log access, port map — written during the committer agent's final checkpoint.
