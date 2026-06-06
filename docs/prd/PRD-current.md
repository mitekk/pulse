# PRD v1 — Microblogging Platform

## Source
- Captured at scaffold initialization from the pasted specification (this session).
- **Audience:** implementation by Claude Code.
- **Scope:** v1 full feature set.
- ⚠️ **Intake truncation:** the pasted spec was cut off mid-§C19 (frontend theming) by a message-size
  limit. The remainder of Part II (§C19 theming details, §C20 accessibility, performance, client testing)
  must be appended from the user's source document and versioned as `PRD-v1.1` before the frontend
  design-system step. Everything through §C19 (start) is captured verbatim below.

## Requirements

---

# Microblogging Platform — Functional & Technical Specification

**Audience:** implementation by Claude Code.
**Scope:** v1 full feature set — posts, follows, timelines, likes, reposts, replies/threads, quote posts, media, profiles, DMs, notifications, search, hashtags. Real-time via WebSockets.
**Stack:** NestJS (modular monolith), PostgreSQL, Redis. TypeScript throughout.

> This describes an original product. Pick your own name, logo, and visual identity. The mechanics below are standard social-feed patterns.

---

## 1. Architecture Overview

### 1.1 Topology
Modular monolith in NestJS, organized by domain module. One deployable, internal module boundaries kept clean so it can be split later.

```
apps/api            NestJS HTTP + WS gateway
  modules/
    auth            registration, login, sessions, tokens
    users           profiles, follow graph
    posts           posts, replies, reposts, quotes
    timeline        feed assembly (home, user, replies)
    engagement      likes, bookmarks
    media           upload, processing, serving
    messaging       DM conversations + messages
    notifications   notification creation + delivery
    search          full-text + hashtag + user search
    hashtags        tag extraction, trending
    realtime        WS gateway, room management, fan-out
  common/           guards, interceptors, pipes, filters
  infra/            db, redis, queue, storage clients
```

### 1.2 Data stores
- **PostgreSQL** — source of truth for all entities.
- **Redis** — three roles:
  - **Cache**: hydrated post objects, user profiles, counters.
  - **Timeline fan-out**: per-user home timeline as a capped sorted set (`zset`) of post IDs scored by timestamp/snowflake.
  - **Pub/Sub**: cross-instance event bus for real-time fan-out to WS rooms.
- **Queue** (BullMQ on Redis): async jobs — fan-out, media processing, notification delivery, search indexing, counter reconciliation.

### 1.3 ID strategy
Use **Snowflake-style 64-bit IDs** (time-ordered) for posts, messages, notifications. Benefits: chronological sortability without a separate timestamp index, no UUID index bloat, natural cursor pagination. Store as `BIGINT`. Users may keep UUIDs if preferred, but time-ordered entities should be snowflakes.

### 1.4 Cursor pagination (global rule)
All list endpoints use **keyset/cursor pagination**, never `OFFSET`. Cursor = opaque base64 of `(snowflake_id)` or `(score, id)`. Response shape:
```json
{ "items": [...], "cursor": "eyJ...", "hasMore": true }
```
Default page size 20, max 100.

---

## 2. Data Model (PostgreSQL)

Conventions: `snake_case` columns, `created_at`/`updated_at timestamptz` on every table, soft-delete via `deleted_at timestamptz NULL` where noted. All FKs indexed.

### 2.1 users
| column | type | notes |
|---|---|---|
| id | bigint PK | snowflake or uuid |
| handle | citext UNIQUE | `@handle`, 1–15 chars, `[A-Za-z0-9_]`, immutable-ish (allow change w/ cooldown) |
| display_name | text | 0–50 chars |
| email | citext UNIQUE | login |
| password_hash | text | argon2id |
| bio | text | 0–160 chars |
| location | text | 0–30 chars |
| website | text | validated URL |
| avatar_media_id | bigint FK media NULL | |
| banner_media_id | bigint FK media NULL | |
| is_verified | boolean default false | |
| is_private | boolean default false | protected account |
| followers_count | int default 0 | denormalized counter |
| following_count | int default 0 | denormalized |
| posts_count | int default 0 | denormalized |
| created_at / updated_at | timestamptz | |
| deleted_at | timestamptz NULL | |

Indexes: `UNIQUE(handle)`, `UNIQUE(email)`, `GIN` trigram on `handle`, `display_name` for search.

### 2.2 posts
Single table holds top-level posts, replies, reposts, and quotes — discriminated by columns.
| column | type | notes |
|---|---|---|
| id | bigint PK | snowflake |
| author_id | bigint FK users | |
| text | text | 0–280 chars (0 only if media or repost) |
| reply_to_id | bigint FK posts NULL | set if this is a reply |
| reply_root_id | bigint FK posts NULL | top of thread, for cheap thread queries |
| repost_of_id | bigint FK posts NULL | set if pure repost (no text) |
| quote_of_id | bigint FK posts NULL | set if quote post (has text + embeds target) |
| conversation_id | bigint | = root post id; groups a thread |
| reply_count | int default 0 | denormalized |
| repost_count | int default 0 | (reposts + quotes) |
| like_count | int default 0 | denormalized |
| bookmark_count | int default 0 | denormalized |
| view_count | bigint default 0 | optional, async incremented |
| lang | text NULL | detected language |
| reply_policy | enum('everyone','following','mentioned') default 'everyone' | who can reply |
| created_at | timestamptz | |
| deleted_at | timestamptz NULL | tombstone; keep row so threads don't break |

Rules:
- A **repost** has `repost_of_id` set, `text` empty/null, no media. Unique `(author_id, repost_of_id)` so a user can't repost the same post twice (toggle).
- A **quote** has `quote_of_id` set AND `text`/media — it's a normal post that embeds another.
- A **reply** has `reply_to_id`; `reply_root_id`/`conversation_id` copied from parent chain.
- Deleting sets `deleted_at`; API returns a tombstone placeholder so thread structure survives.

Indexes:
- `(author_id, id DESC)` — user timeline.
- `(reply_to_id, id)` — direct replies.
- `(conversation_id, id)` — thread fetch.
- `(repost_of_id)` partial where not null.
- `(quote_of_id)` partial where not null.
- `GIN` full-text on `to_tsvector(lang, text)` — search.

### 2.3 follows
| column | type | notes |
|---|---|---|
| follower_id | bigint FK users | |
| followee_id | bigint FK users | |
| state | enum('active','pending') | pending only for private accounts |
| created_at | timestamptz | |

PK `(follower_id, followee_id)`. Indexes both directions: `(followee_id, follower_id)` for "who follows me". `CHECK follower_id <> followee_id`.

### 2.4 likes
`(user_id, post_id)` PK, `created_at`. Index `(post_id)` for "who liked", `(user_id, id)` for "my likes".

### 2.5 bookmarks
Same shape as likes. Private to the user.

### 2.6 mentions
Extracted `@handles` per post: `(post_id, mentioned_user_id)`. Drives mention notifications + reply-policy checks.

### 2.7 hashtags & post_hashtags
- `hashtags(id, tag citext UNIQUE, created_at)`.
- `post_hashtags(post_id, hashtag_id)`, index `(hashtag_id, post_id DESC)` for tag timelines.

### 2.8 media
| column | type | notes |
|---|---|---|
| id | bigint PK | |
| owner_id | bigint FK users | |
| type | enum('image','gif','video') | |
| status | enum('pending','processing','ready','failed') | |
| storage_key | text | object storage path |
| mime | text | |
| width / height | int | |
| duration_ms | int NULL | video/gif |
| alt_text | text NULL | accessibility, 0–1000 chars |
| variants | jsonb | {thumb, small, medium, large, mp4...} keys |
| created_at | timestamptz | |

`post_media(post_id, media_id, position)` — up to 4 images OR 1 video/gif per post; `position` orders the grid.

### 2.9 conversations & messages (DMs)
- `conversations(id bigint PK, is_group bool default false, created_at)`.
- `conversation_participants(conversation_id, user_id, last_read_message_id bigint NULL, muted bool, joined_at)`. PK `(conversation_id, user_id)`.
- For 1:1, enforce a canonical conversation via a unique key on the sorted participant pair (e.g. `conversation_dyads(user_lo, user_hi, conversation_id UNIQUE)`).
- `messages(id bigint PK snowflake, conversation_id FK, sender_id FK, text, media_id bigint NULL, deleted_at, created_at)`. Index `(conversation_id, id DESC)`.

### 2.10 notifications
| column | type | notes |
|---|---|---|
| id | bigint PK snowflake | |
| recipient_id | bigint FK users | |
| type | enum('like','reply','repost','quote','follow','mention','follow_request','dm') | |
| actor_id | bigint FK users | who triggered it |
| post_id | bigint NULL | subject post if any |
| read_at | timestamptz NULL | |
| created_at | timestamptz | |

Index `(recipient_id, id DESC)`, partial `(recipient_id) where read_at is null` for unread count.
Aggregation: collapse "X, Y and 3 others liked your post" at read time by grouping `(type, post_id)` over a window — store raw rows, aggregate in the read model.

### 2.11 blocks & mutes
- `blocks(blocker_id, blocked_id, created_at)` PK pair. Blocking removes mutual follows, hides content both ways, prevents DMs/replies.
- `mutes(muter_id, muted_id, created_at)` — hides from timeline/notifications but no hard wall.

---

## 3. Core Mechanics & Business Rules

### 3.1 Posting
- Text limit **280** chars, counted by Unicode grapheme/codepoint policy (define one — recommend codepoints, with URLs counted as fixed-length 23, CJK weighting optional for v1: skip).
- On create: extract `@mentions`, `#hashtags`, URLs in a single pass → write `mentions`, `post_hashtags`, persist post → enqueue fan-out + notification + index jobs.
- `reply_policy` enforced on reply creation: if `following`, replier must be followed by author; if `mentioned`, replier must be in the parent's mentions.
- Empty text allowed only when media attached or it's a pure repost.

### 3.2 Threads / conversations
- `conversation_id` = root post id. A reply inherits root's `conversation_id` and sets `reply_root_id`.
- "Self-thread": consecutive replies by the author to their own post render as a connected thread.
- Thread fetch endpoint returns: ancestors (path to root), the focused post, and ranked replies (author replies first, then by engagement, then chronological).

### 3.3 Reposts vs quotes
- **Repost** = pointer, toggle on/off, shows in reposter's followers' timelines attributed as "reposted by". No own text.
- **Quote** = new post embedding the target as a card; target's `repost_count` increments; quote appears as its own post.
- Counters: `repost_count` on the target counts reposts + quotes combined (define and keep consistent).

### 3.4 Likes / bookmarks
- Toggle endpoints, idempotent. Update denormalized counter transactionally + adjust Redis counter; reconcile via periodic job.
- Bookmarks are private; no notification.

### 3.5 Follow graph
- Public account: follow is immediate, `state=active`, increments counters, notifies followee.
- Private account: follow creates `state=pending` → `follow_request` notification → followee accepts/declines. Only active follows see protected posts.
- Unfollow removes row, decrements counters.
- Block: removes any follow rows both directions, inserts block, purges relevant timeline entries.

### 3.6 Visibility rules (apply on every read)
A viewer may see a post if **all** hold:
1. Author not blocked-by/blocking viewer.
2. If author `is_private`, viewer is an active follower (or is the author).
3. Post not soft-deleted (else tombstone).
4. Author not muted → still visible on direct visit, suppressed from home timeline.

### 3.7 Counters
Denormalized columns are the displayed truth; Redis holds hot deltas; a reconciliation job recomputes from source tables on a schedule and corrects drift. Never compute counts with live `COUNT(*)` on the read path.

---

## 4. Timeline Assembly

### 4.1 Home timeline — hybrid fan-out
- **Fan-out-on-write (push)** for normal accounts: when a user posts/reposts, enqueue a job that pushes the post id into each *active follower's* Redis home `zset` (`home:{userId}`), scored by snowflake, capped to ~800 entries (trim with `ZREMRANGEBYRANK`).
- **Fan-out-on-read (pull)** for **high-follower accounts** (above a threshold, e.g. 10k followers — "celebrity" exception): do NOT push. At read time, merge the viewer's precomputed `zset` with recent posts pulled live from the accounts they follow that are flagged pull-based.
- Read path: `ZREVRANGE home:{userId}` for ids → hydrate from Redis post cache (fallback Postgres) → apply visibility filter → merge celebrity pull set → return cursor page.
- Reposts inserted into timeline as the repost event (so ordering reflects repost time), rendered with attribution.

### 4.2 Other timelines (pull, straightforward queries)
- **User timeline**: `posts WHERE author_id=? AND deleted_at IS NULL ORDER BY id DESC` (+ the user's reposts merged), keyset paginated.
- **Replies tab**: author's posts where `reply_to_id IS NOT NULL`.
- **Media tab**: author's posts having media.
- **Likes tab**: join `likes` for the user (respect privacy — usually self-only or public per setting).
- **Hashtag timeline**: `post_hashtags` join, newest first.
- **For-You ranking** (optional v1.1): keep chronological for v1; leave a ranking hook.

### 4.3 Real-time timeline updates
- New posts matching a viewer's follow set are published to their WS room; client shows a "N new posts" pill (don't auto-inject to avoid scroll jank). On click, prepend.

---

## 5. Real-Time Layer (WebSockets)

### 5.1 Gateway
- NestJS WS gateway (Socket.IO recommended for rooms + reconnection + fallback). One gateway, horizontally scaled with the **Redis adapter** so rooms span instances.
- Auth on connect: validate access token in the handshake; reject unauthenticated.

### 5.2 Rooms
- `user:{userId}` — personal channel: notifications, DM events, follow events, timeline pills.
- `conversation:{conversationId}` — joined when a DM thread is open: new messages, typing, read receipts.
- (Optional) `post:{postId}` — when viewing a post, live like/reply count bumps.

### 5.3 Events (server → client)
| event | payload | room |
|---|---|---|
| `notification.new` | notification dto | `user:{id}` |
| `timeline.newPosts` | `{count, previewIds}` | `user:{id}` |
| `dm.message` | message dto | `conversation:{id}` + recipients' `user:{id}` |
| `dm.typing` | `{conversationId, userId}` | `conversation:{id}` |
| `dm.read` | `{conversationId, userId, lastReadMessageId}` | `conversation:{id}` |
| `post.counters` | `{postId, like, reply, repost}` | `post:{id}` |
| `follow.update` | `{type, actorId}` | `user:{id}` |

### 5.4 Client → server
| event | payload |
|---|---|
| `dm.send` | `{conversationId, text, mediaId?, clientNonce}` |
| `dm.typing` | `{conversationId}` |
| `dm.markRead` | `{conversationId, lastReadMessageId}` |
| `subscribe.post` | `{postId}` / `unsubscribe.post` |

### 5.5 Fan-out path
Domain event (e.g. message created) → publish to Redis pub/sub channel → every API instance subscribed re-emits to its local sockets in the target room. This keeps WS fan-out correct across instances. Persist first, then emit (no lost-on-crash messages).

### 5.6 Delivery semantics
- Messages: `clientNonce` for idempotency + optimistic UI; server returns canonical id; dedupe on nonce.
- Offline users: events persisted (notifications, messages) and fetched on reconnect via REST; WS is for *live* delivery only, never the source of truth.

---

## 6. Direct Messages

- 1:1 (v1) with a path to groups (schema already supports it).
- Send: REST `POST /conversations/:id/messages` OR WS `dm.send` (both go through the same service). Persist → emit `dm.message` → create `dm` notification if recipient not currently in the room.
- Conversation list: ordered by last message id desc, with unread count (`messages.id > last_read_message_id`).
- Read receipts: `dm.markRead` updates `last_read_message_id`, emits `dm.read`.
- Typing: ephemeral, debounced, not persisted.
- Permissions: can DM if you follow each other, OR recipient allows DMs from anyone (user setting `dm_privacy: 'everyone'|'following'`), and neither blocks the other.
- Media in DMs reuses the media pipeline.

---

## 7. Notifications

- Generated as side effects of: like, reply, repost, quote, mention, follow, follow_request accept, dm.
- Write notification row → enqueue delivery → emit `notification.new` to `user:{recipient}` → push provider hook (web push/APNs/FCM) optional.
- **Suppression**: no self-notifications; respect mutes/blocks; collapse duplicates (re-like after unlike within a window shouldn't spam).
- **Unread badge**: maintained in Redis (`notif:unread:{userId}`), authoritative count reconciled from `read_at IS NULL`.
- Read model aggregates: group like/repost notifications by `post_id` → "A and 4 others…".
- Endpoints: list (cursor), mark-one-read, mark-all-read, unread-count.

---

## 8. Search & Hashtags

### 8.1 Search
- v1: **Postgres full-text** (`tsvector` GIN on post text) + trigram on user handle/display_name. Acceptable to low-mid scale.
- v1.1 hook: abstract a `SearchPort` so it can swap to OpenSearch/Elasticsearch/Meilisearch without touching callers.
- Search types: **Top** (blended), **Latest** (chronological), **People** (users), **Media** (posts w/ media).
- Query parsing: bare terms → text match; `#tag` → hashtag timeline; `@handle` → user lookup; `from:handle` operator optional.
- Apply visibility filters to results.

### 8.2 Hashtags & trending
- Extracted on post create, normalized lowercase, stored in `post_hashtags`.
- **Trending**: rolling count per tag over a time window (e.g. last 6h) using Redis sorted set with time-bucketed increments; decay older buckets. Recompute trends list on a schedule (e.g. every 5 min) into a cached payload. Optionally segment by location later — v1 global.
- Tag timeline endpoint reads `post_hashtags`.

---

## 9. Media Pipeline

1. **Upload init**: client requests upload → server returns a direct-to-storage presigned URL (S3-compatible / MinIO) + creates `media` row `status=pending`.
2. **Client uploads** binary directly to storage.
3. **Finalize**: client calls finalize with media id → enqueue processing job.
4. **Processing job**: validate mime/size, strip EXIF (privacy), generate variants (thumb/small/medium/large for images; transcode to web-friendly MP4 + poster for video; first-frame thumb for GIF), populate `variants` jsonb, set `status=ready`. On failure `status=failed`.
5. **Attach**: media id referenced in `post_media` at post-create time; reject if not `ready` or not owned by author.
6. **Serving**: serve via CDN in front of storage; URLs in `variants`. Signed URLs only if private accounts require it (v1 can serve public media openly).

Limits: images ≤ 4 per post, ≤ ~5MB each pre-processing; 1 video ≤ defined duration/size; GIF treated as looping video. `alt_text` supported and surfaced.

---

## 10. Auth & Security

- **Registration**: email + password (argon2id) + handle. Email verification flow (token, `verified` flag) — can be soft in v1 but build the table/flow.
- **Login**: returns short-lived **access JWT** (~15 min) + long-lived **refresh token** (rotating, stored hashed in `sessions` table, revocable). Refresh endpoint rotates and detects reuse.
- **Sessions table**: `(id, user_id, refresh_hash, user_agent, ip, created_at, expires_at, revoked_at)`. List/revoke sessions in settings.
- **WS auth**: pass access token in handshake `auth` payload; re-auth on token refresh.
- **Guards**: `AuthGuard` (valid access token), `OptionalAuthGuard` (public endpoints that personalize if logged in), ownership guards for mutate/delete.
- **Rate limiting** (Redis token bucket per user+route): posting, follow, like, DM send, search, login (stricter, per-IP). Return `429` with `Retry-After`.
- **Input validation**: `class-validator` DTOs on every endpoint; whitelist + forbid unknown props; global `ValidationPipe`.
- **Authorization on reads**: every read path runs visibility/block checks — never trust the client.
- **Abuse**: report endpoint (`reports` table: reporter, target type/id, reason) — storage only in v1, no moderation engine.
- **Secrets**: env-based config (`@nestjs/config`), no secrets in code.
- **Standard headers**: helmet, CORS allow-list, CSRF not needed for pure token-auth API (no cookies) — if you use cookie refresh tokens, add CSRF + `SameSite`.

---

## 11. REST API Surface

Base: `/api/v1`. All authed unless marked public. Cursor pagination on lists.

### Auth
```
POST   /auth/register            {email, handle, password, displayName?}
POST   /auth/login               {emailOrHandle, password}
POST   /auth/refresh             {refreshToken}
POST   /auth/logout              (revokes current session)
GET    /auth/me                  current user
POST   /auth/verify-email        {token}
GET    /auth/sessions            list sessions
DELETE /auth/sessions/:id        revoke
```

### Users / profiles
```
GET    /users/:handle            public profile (+ relationship flags if authed)
PATCH  /users/me                 update profile (display_name, bio, location, website, avatar/banner mediaId, is_private, dm_privacy)
GET    /users/:handle/posts      user timeline (cursor)
GET    /users/:handle/replies
GET    /users/:handle/media
GET    /users/:handle/likes      (privacy-gated)
GET    /users/:handle/followers  (cursor)
GET    /users/:handle/following  (cursor)
POST   /users/:handle/follow     follow / request
DELETE /users/:handle/follow     unfollow / cancel request
POST   /users/:handle/block      |  DELETE /users/:handle/block
POST   /users/:handle/mute       |  DELETE /users/:handle/mute
GET    /follow-requests          incoming pending (private accounts)
POST   /follow-requests/:id/accept | /decline
```

### Posts
```
POST   /posts                    {text?, mediaIds?, replyToId?, quoteOfId?, replyPolicy?}
GET    /posts/:id                single post (+ viewer relationship/engagement flags)
DELETE /posts/:id                soft delete (author only)
GET    /posts/:id/thread         ancestors + focused + ranked replies
GET    /posts/:id/replies        (cursor)
GET    /posts/:id/reposts        users who reposted
GET    /posts/:id/quotes         quote posts of this
GET    /posts/:id/likes          users who liked
POST   /posts/:id/like           | DELETE /posts/:id/like      (toggle)
POST   /posts/:id/repost         | DELETE /posts/:id/repost    (toggle)
POST   /posts/:id/bookmark       | DELETE /posts/:id/bookmark
```

### Timelines
```
GET    /timeline/home            hybrid fan-out feed (cursor)
GET    /timeline/hashtag/:tag    tag timeline
GET    /bookmarks                self bookmarks
```

### Media
```
POST   /media/upload-url         {type, mime, size} -> {mediaId, uploadUrl}
POST   /media/:id/finalize       triggers processing
GET    /media/:id                metadata/status
PATCH  /media/:id                {altText}
```

### Messaging
```
GET    /conversations            list (cursor, unread counts)
POST   /conversations            {recipientHandle} -> canonical 1:1 conversation
GET    /conversations/:id/messages   (cursor)
POST   /conversations/:id/messages   {text?, mediaId?, clientNonce}
POST   /conversations/:id/read       {lastReadMessageId}
POST   /conversations/:id/mute        | DELETE
```

### Notifications
```
GET    /notifications            (cursor, aggregated)
GET    /notifications/unread-count
POST   /notifications/read       {ids?} or all
```

### Search
```
GET    /search?q=&type=top|latest|people|media   (cursor)
GET    /search/suggest?q=        typeahead (users + tags)
GET    /trends                   cached trending tags
```

### Reports
```
POST   /reports                  {targetType, targetId, reason}
```

---

## 12. DTO / Response Shapes (key ones)

### PostDto
```json
{
  "id": "1750000000000000001",
  "author": { "id": "...", "handle": "...", "displayName": "...", "avatarUrl": "...", "isVerified": false },
  "text": "hello #world @bob",
  "createdAt": "2026-06-06T12:00:00Z",
  "entities": {
    "mentions": [{"handle":"bob","userId":"..."}],
    "hashtags": [{"tag":"world"}],
    "urls": [{"url":"...","start":..,"end":..}]
  },
  "media": [{ "id":"...","type":"image","variants":{...},"altText":null }],
  "counts": { "replies": 0, "reposts": 0, "likes": 0, "bookmarks": 0 },
  "viewer": { "liked": false, "reposted": false, "bookmarked": false },
  "replyToId": null,
  "quoteOf": null,            // embedded PostDto (shallow) if quote
  "repostOf": null,           // embedded PostDto if pure repost
  "repostedBy": null,         // {handle, displayName} when surfaced via repost in a feed
  "replyPolicy": "everyone",
  "deleted": false
}
```

### UserDto / ProfileDto
```json
{
  "id":"...","handle":"...","displayName":"...","bio":"...","location":"...","website":"...",
  "avatarUrl":"...","bannerUrl":"...","isVerified":false,"isPrivate":false,
  "counts":{"followers":0,"following":0,"posts":0},
  "viewer":{"following":false,"followedBy":false,"blocked":false,"muted":false,"followRequested":false},
  "createdAt":"..."
}
```

### NotificationDto (aggregated)
```json
{ "id":"...","type":"like","actors":[{...up to 3}],"otherCount":4,"post":{...shallow},"readAt":null,"createdAt":"..." }
```

### MessageDto
```json
{ "id":"...","conversationId":"...","senderId":"...","text":"...","media":null,"createdAt":"...","clientNonce":"..." }
```

---

## 13. Caching Strategy

| data | cache | invalidation |
|---|---|---|
| hydrated PostDto (sans viewer flags) | Redis `post:{id}` TTL ~ hours | on edit/delete/counter change |
| viewer flags (liked/reposted/bookmarked) | computed per request via pipelined Redis lookups on like/repost/bookmark sets | n/a |
| profile | Redis `user:{id}` | on profile update / counter change |
| counters | Redis hash, write-through | reconciliation job |
| home timeline | Redis zset `home:{id}` | fan-out write/trim |
| trends | Redis cached payload | scheduled recompute |
| unread notif count | Redis int | on new / read |

Hydration: fetch ids from timeline zset → `MGET post:{id}` → fill misses from PG in one query → backfill cache → attach per-viewer flags via pipelined `SISMEMBER` on `likes:{postId}` etc. (or per-user `liked:{userId}` sets — pick one and be consistent).

---

## 14. Background Jobs (BullMQ)

| job | trigger | work |
|---|---|---|
| `fanout.post` | post/repost created | push id to followers' home zsets (skip celebrity authors) |
| `media.process` | finalize | validate, EXIF strip, variants/transcode |
| `notify.deliver` | notif row created | emit WS + push provider |
| `search.index` | post create/delete | update tsvector / external index |
| `counters.reconcile` | cron | recompute denormalized counts from source |
| `trends.recompute` | cron (5m) | rebuild trending payload |
| `timeline.trim` | periodic | cap zsets |
| `session.cleanup` | cron | purge expired sessions |

Idempotent jobs, retries with backoff, dead-letter on repeated failure.

---

## 15. Validation & Limits (summary)
- text ≤ 280 codepoints; handle 1–15 `[A-Za-z0-9_]`; display_name ≤ 50; bio ≤ 160; alt_text ≤ 1000.
- media: ≤4 images or 1 video/gif per post.
- follow/like/repost/bookmark endpoints idempotent toggles.
- rate limits per route (define numbers in config; sane defaults: post 300/3h, follow 400/day, like 1000/day, DM 500/day, login 10/10min/IP).

---

## 16. Testing Expectations
- Unit: services (posting rules, visibility, reply-policy, follow state machine, counter math).
- Integration: each REST endpoint incl. auth + visibility edge cases (private accounts, blocks, mutes, deleted tombstones).
- E2E: post→fan-out→home timeline appearance; DM send→WS delivery→read receipt; follow-request→accept→protected post visibility.
- WS: multi-instance fan-out via Redis adapter; idempotent message nonce; reconnect backfill.
- Load smoke: timeline read latency with warm cache; celebrity-author read-path merge.

---

## 17. Build Order (suggested for Claude Code)
1. Project scaffold, config, DB + Redis + queue infra, migrations baseline, ID/snowflake util, cursor util, global pipes/guards/filters.
2. Auth + users + follow graph (+ visibility primitives, blocks/mutes).
3. Posts (create/read/delete, replies, reposts, quotes, threads) + entity extraction.
4. Engagement (likes/bookmarks) + counters + reconciliation.
5. Timeline: user timeline first (pull), then home hybrid fan-out + caching/hydration.
6. Media pipeline.
7. Real-time gateway + Redis adapter + rooms; wire timeline pills.
8. DMs (REST + WS).
9. Notifications (creation + delivery + aggregation + unread).
10. Hashtags + search + trends.
11. Reports, rate limiting hardening, session management UI endpoints.
12. Tests throughout; load smoke at the end.

---

## 18. Explicitly Out of Scope for v1
Algorithmic "For You" ranking, ads, monetization/subscriptions, communities/groups (DM schema is group-ready but UI/logic is 1:1), live audio, polls (easy add later), edit-post history, full moderation/trust-and-safety tooling, multi-language tsvector tuning, geo-segmented trends. Leave seams (ports/interfaces) where noted so these slot in.

---

# PART II — Client / Frontend Specification

**Audience:** implementation by Claude Code.
**Scope:** web client for the full v1 backend above. Real-time-first, optimistic UI, mobile-responsive.
**Stack:** React + TypeScript, Vite, TanStack Query (server state), Zustand (client/UI state), React Router, Socket.IO client, Tailwind CSS. Reasoning for each in §C2.

> Visual identity is a deliberate open decision — see §C19. This spec defines structure, behavior, data flow, and component contracts, not the final look. Branding (name, logo, color, type) is yours to set.

---

## C1. Architecture Overview

### C1.1 Shape
Single-page app, feature-foldered, talking to the REST API for source-of-truth reads/writes and to the WS gateway for live updates. The cache (TanStack Query) is the client's read model; WebSocket events mutate that cache rather than triggering refetches wherever possible.

```
src/
  app/                 router, providers, error boundaries, app shell
  lib/
    api/               typed REST client (one module per backend domain)
    realtime/          socket client, room manager, event router
    cache/             query keys, cache update helpers, optimistic utils
    auth/              token store, refresh logic, auth guard
    cursor/            cursor pagination helpers for infinite lists
  features/
    auth/              login, register, verify, session list
    timeline/          home feed, "new posts" pill, infinite scroll
    post/              composer, post card, thread view, actions
    profile/           profile header, tabs (posts/replies/media/likes)
    engagement/        like/repost/bookmark buttons (optimistic)
    follow/            follow button, requests, followers/following lists
    messaging/         conversation list, thread, composer, typing, receipts
    notifications/     list, unread badge, aggregation rendering
    search/            search page, tabs, typeahead, trends
    media/             uploader, gallery/grid, lightbox, alt-text
  components/          design-system primitives (Button, Avatar, Modal, …)
  hooks/               shared hooks (useInfiniteList, useIntersection, …)
  styles/              tokens, tailwind config, globals
```

### C1.2 State ownership (the core decision)
Three distinct kinds of state, deliberately separated:

| state kind | owner | examples |
|---|---|---|
| **Server state** (anything the API owns) | TanStack Query cache | posts, timelines, profiles, conversations, notifications, counts |
| **Real-time deltas** | WS event router → writes into the Query cache | new DM, notification, counter bumps, timeline pill count |
| **Client/UI state** | Zustand stores (small, scoped) | composer draft, open modals, theme, optimistic-pending registry, current-open-conversation id, "N new posts" buffer |

Rule: **do not** mirror server data into Zustand. Zustand holds only ephemeral UI and cross-cutting client flags. This avoids the classic dual-source-of-truth drift.

---

## C2. Stack Rationale (brief)
- **TanStack Query** — purpose-built for cursor/infinite lists, cache invalidation, optimistic mutations with rollback, and request dedupe. It is the backbone given how feed/thread/DM-heavy this app is.
- **Zustand** — minimal, no-boilerplate client state for the few genuinely-local things; avoids Redux ceremony.
- **Socket.IO client** — matches the backend gateway choice (rooms, reconnection, fallback) from §5.
- **React Router** — nested routes map cleanly to the app shell + modal-route pattern (composer/lightbox as routes).
- **Vite** — fast dev/build, first-class TS.
- **Tailwind** — fast, consistent spacing/responsive primitives; tokens drive theming (§C19). Swap for CSS Modules/vanilla-extract if preferred — keep tokens either way.

---

## C3. Routing Map

`*` = requires auth (redirect to `/login`, preserve `returnTo`). `~` = personalizes if authed, public otherwise.

```
/login                      public      login
/register                   public      registration
/verify-email               public      email verification (token in query)

/                           *           home timeline
/explore                    ~           trends + search entry
/search?q=&type=            ~           search results (tabs)
/notifications              *           notifications list
/notifications/mentions     *           mentions filter
/messages                   *           conversation list (master)
/messages/:conversationId   *           conversation thread (detail)
/bookmarks                  *           bookmarks
/settings                   *           settings hub
/settings/sessions          *           active sessions
/settings/account           *           profile edit, privacy, dm privacy

/:handle                    ~           profile (Posts tab)
/:handle/replies            ~           profile replies
/:handle/media              ~           profile media
/:handle/likes              ~           profile likes (privacy-gated)
/:handle/followers          ~           followers list
/:handle/following          ~           following list
/:handle/status/:postId     ~           thread view (focused post)

# Modal routes (render over the backdrop route via background-location)
/compose                    *           composer modal
/:handle/status/:postId/photo/:idx  ~   media lightbox
/compose/dm                 *           new-message modal
```

**Modal-as-route pattern:** use React Router `location.state.background` so the composer and lightbox open over the current page (and survive deep-links by rendering full-page if no background). This mirrors the expected UX where composing doesn't lose your feed scroll position.

---

## C4. App Shell & Layout

### C4.1 Responsive frame
Three breakpoints drive a shifting layout:

- **Desktop (≥1100px):** three columns — left nav rail (icons + labels, compose button), center content (max ~600px), right sidebar (search box, trends, who-to-follow).
- **Tablet (700–1099px):** collapsed left rail (icons only), center, no right sidebar (trends move into `/explore`).
- **Mobile (<700px):** single column; top bar; **bottom tab bar** (Home, Search, Notifications, Messages); floating compose FAB; left nav becomes a drawer from avatar tap.

### C4.2 Persistent elements
- Center column header is **contextual + sticky** (page title, back button on detail views, tab strips on profile/search).
- Unread badges on Notifications and Messages nav items, fed by WS + reconciled counts.
- Scroll position **preserved per route** when navigating back (TanStack Query keeps data warm; restore scroll offset).

---

## C5. Real-Time Integration (client)

### C5.1 Connection lifecycle
- Connect once on authenticated app mount; pass access token in handshake `auth`.
- On token refresh, re-emit auth (or reconnect) so the socket stays valid.
- Auto-reconnect (Socket.IO default) with backoff; on `reconnect`, run **backfill** (see C5.4).
- Disconnect on logout; clear room subscriptions.

### C5.2 Room manager
A small client module tracks desired room memberships and joins/leaves as the UI changes:
- `user:{me}` — joined for the whole session.
- `conversation:{id}` — join on opening a DM thread, leave on close.
- `post:{id}` — join when a thread/post detail is on screen, leave on unmount (optional; throttle).

### C5.3 Event router → cache writes
A single subscriber maps WS events to TanStack Query cache mutations (no refetch):

| event | cache effect |
|---|---|
| `dm.message` | append to that conversation's message infinite-list cache; bump conversation in list; if not the open conversation, increment its unread + global messages badge |
| `dm.typing` | set transient typing flag in messaging Zustand store (auto-expire ~4s) |
| `dm.read` | update other participant's `lastReadMessageId` for receipt ticks |
| `notification.new` | prepend to notifications cache; increment unread badge store |
| `timeline.newPosts` | increment "N new posts" buffer in timeline store (do **not** inject — see C7.3) |
| `post.counters` | patch the cached PostDto counts for that id wherever it appears |
| `follow.update` | refresh relationship flag on relevant profile cache entry; maybe notification |

### C5.4 Reconnect backfill
WS is live-only, never source of truth. On reconnect:
- Refetch unread counts (notifications, messages).
- Invalidate the open conversation's latest page so any missed messages load.
- Optionally refetch first page of home timeline silently to repair gaps.

### C5.5 Optimistic + nonce for DMs
Sending a DM: generate `clientNonce`, optimistically append a "sending" message, emit `dm.send` (or REST). On the echoed `dm.message`/response, reconcile by nonce (replace temp with canonical id, clear sending state). On failure, mark the bubble failed with retry.

---

## C6. Data Fetching Patterns

### C6.1 Query keys (stable, hierarchical)
```
['timeline','home']
['timeline','hashtag', tag]
['post', postId]
['post', postId, 'thread']
['post', postId, 'replies']
['profile', handle]
['profile', handle, tab]            // posts|replies|media|likes
['profile', handle, 'followers'|'following']
['conversations']
['conversation', id, 'messages']
['notifications']
['notifications','unreadCount']
['search', type, q]
['trends']
['bookmarks']
['me']
```

### C6.2 Infinite lists
Every feed/list uses `useInfiniteQuery` with the backend cursor. A shared `useInfiniteList` hook wraps: fetch, `getNextPageParam: last => last.cursor ?? undefined`, intersection-observer sentinel to auto-load, and a flattened `items` selector. Virtualize long lists (home, thread replies, DM history) with a windowing lib for performance.

### C6.3 Hydration of viewer flags
PostDto already includes `viewer.{liked,reposted,bookmarked}` and `counts` from the backend, so the client renders straight from cache. Optimistic toggles patch these locally (C8).

---

## C7. Timeline (Home)

### C7.1 Behavior
- Infinite, reverse-chronological (matches backend v1).
- Each item is a `PostCard`. Reposts render with a "reposted by X" attribution row above the original author block; quotes render the embedded post as a nested card.
- Pull-to-refresh on mobile; "back to top" affordance.

### C7.2 PostCard composition
A single `PostCard` handles all variants via props:
- normal post
- reply (optionally with "replying to @x" context line)
- repost wrapper (attribution + inner original)
- quote (post body + embedded shallow card of `quoteOf`)
- tombstone (`deleted: true` → "this post was deleted")
Includes: author block (avatar, name, handle, relative time, overflow menu), text with **rich entity rendering** (mentions/hashtags/URLs as links — see C12), media grid, and the action bar (reply, repost, like, bookmark, share, view count).

### C7.3 "N new posts" pill
WS `timeline.newPosts` increments a buffered count shown as a top pill ("Show N posts"). Clicking it invalidates/prepends the latest page and scrolls to top. **Never auto-inject** to avoid scroll jank — matches §4.3 of the backend spec.

---

## C8. Engagement (optimistic)

Like / repost / bookmark buttons mutate immediately on tap with rollback on error. Pattern (TanStack `useMutation`):
1. `onMutate`: cancel in-flight queries for the post, snapshot, optimistically flip `viewer.liked` and adjust `counts.likes` in **every** cached location the post appears (timeline, thread, profile, search) via a shared `patchPostInCaches(postId, updater)` helper.
2. `onError`: restore snapshot.
3. `onSettled`: optional reconcile (the WS `post.counters` event will also keep counts honest across clients).

Repost button offers a menu: **Repost** (toggle) or **Quote** (opens composer with `quoteOfId`). Bookmark is silent/private.

---

## C9. Composer

### C9.1 Modes
- New post, reply (`replyToId`), quote (`quoteOfId`) — same component, different context header and embedded preview.
- Opens as modal route (`/compose`) or inline at top of home / in thread.

### C9.2 Features
- **Live character counter** to 280 using the same counting policy as the backend (codepoints; URLs counted as fixed 23). Ring indicator that turns warning/over near/at limit; disable submit when over.
- **Entity highlighting** while typing: mentions, hashtags, URLs styled live (lightweight tokenizer, not a heavy rich-text editor).
- **Mention autocomplete**: on `@` + chars, query `/search/suggest`, show a user dropdown, insert handle.
- **Hashtag autocomplete**: on `#`, suggest existing/trending tags.
- **Media attach**: up to 4 images or 1 video/gif (mirror backend limits); per-image **alt-text** entry; reorder; remove; upload progress (C13).
- **Reply-policy selector** (everyone / people you follow / only mentioned) on new top-level posts.
- **Draft persistence**: keep draft in Zustand (and optionally localStorage) so closing the modal doesn't lose text; restore on reopen.
- Submit → optimistic insert into the relevant list (home top / thread) with "sending" state, reconcile on response.

### C9.3 Validation
Disable submit unless: `text` non-empty OR media attached OR it's a repost; respect over-limit; block submit while media still `processing`.

---

## C10. Thread / Conversation View

Route `/:handle/status/:postId`. Renders, top to bottom:
1. **Ancestors** — the path from root to the focused post's parent (rendered as connected, slightly condensed cards with thread connector lines).
2. **Focused post** — larger, full timestamp, full action bar, view count, "who can reply" note.
3. **Reply composer** (respecting reply policy; disabled with explanation if viewer can't reply).
4. **Ranked replies** — order from backend (author replies, then engagement, then chrono), infinite-scrolled, with nested "show more replies" affordances for deep sub-threads.

Self-threads (author replying to self) render as a visually connected chain. Deleted nodes in the path render as tombstones so structure survives.

---

## C11. Profile

### C11.1 Header
Banner, avatar (overlapping), display name, `@handle`, verified mark, bio with rich entities, location/website/join-date, followers/following counts (tappable → lists). Relationship-aware primary button:
- self → "Edit profile"
- not following → "Follow" (or "Follow" → pending state for private accounts: shows "Requested")
- following → "Following" (hover/long-press → "Unfollow" confirm)
- blocked → "Blocked" state + unblock
Overflow menu: mute, block, report, copy link, message (if allowed).

### C11.2 Tabs
`Posts | Replies | Media | Likes` — each its own infinite list and query key. Likes tab honors privacy (hidden/blocked per backend). Media tab is a grid. Empty states per tab.

### C11.3 Private accounts
If `isPrivate` and viewer not an active follower: show header + "These posts are protected" lock state instead of the timeline; Follow becomes a request.

---

## C12. Rich Text / Entity Rendering

A shared `RichText` renderer takes `text` + `entities` from PostDto and produces linked segments:
- `@mention` → link to `/:handle`, styled accent.
- `#hashtag` → link to `/search?q=%23tag&type=top` (or `/explore` tag timeline), accent.
- URL → external link, display shortened host, `rel="noopener noreferrer"`, truncate long URLs.
Never parse client-side from raw text for source of truth — use the backend-provided `entities` offsets so rendering matches what was stored/notified. (A lightweight live tokenizer is used **only** in the composer for highlighting, not for persistence.)

---

## C13. Media (client)

### C13.1 Upload flow (matches §9)
1. User selects file(s) → client validates type/size/count locally first (fast feedback).
2. `POST /media/upload-url` → receive `{mediaId, uploadUrl}`.
3. **Direct upload** the binary to `uploadUrl` (storage), tracking progress per file.
4. `POST /media/:id/finalize` → poll `GET /media/:id` (or rely on a WS/processing signal) until `status: ready`.
5. Attach `mediaId`(s) to the post on submit; block submit until all `ready`.
- Show per-image thumbnails, progress bars, retry on failure, and an **alt-text** field per image (surfaced and required-optional per your policy).

### C13.2 Display
- **Image grid**: 1–4 layout patterns (1 full, 2 split, 3 = one tall + two stacked, 4 = 2×2). Respect aspect ratios, lazy-load, blur-up using a tiny variant.
- **Lightbox** (modal route): full-size with swipe/keyboard nav across a post's images, alt-text shown, pinch-zoom on touch.
- **Video/GIF**: inline player, GIF autoplays muted/looping, video click-to-play with controls; poster from `variants`.

---

## C14. Messaging (DMs)

### C14.1 Layout
Master–detail: `/messages` = conversation list; `/messages/:id` = thread. On mobile, list and thread are separate full screens with back nav.

### C14.2 Conversation list
Each row: participant avatar/name, last-message preview, relative time, **unread dot/count**. Ordered by latest message. Unread state from `messages.id > last_read_message_id`. Live-bumped via WS `dm.message`.

### C14.3 Thread
- Infinite history (reverse paginate older on scroll up; virtualize).
- **Message bubbles** grouped by sender and time proximity; own messages aligned opposite; show send time, **delivery/read ticks** from `dm.read`.
- **Typing indicator** from `dm.typing` (debounced; auto-expire).
- Composer: text + media (reuses media pipeline), `clientNonce` optimistic send (C5.5), failed-state retry.
- **Read on view**: when thread is open and bottom is visible, emit `dm.markRead` with the latest message id; clear unread.
- Permission gating: if DMs not allowed (not mutual follow and recipient `dm_privacy: following`, or blocked), disable composer with explanation.

### C14.4 New message
`/compose/dm` modal: search users (typeahead) → start/get canonical 1:1 conversation → navigate to thread.

---

## C15. Notifications (client)

- **Badge**: unread count from `['notifications','unreadCount']`, live-incremented by WS `notification.new`, reconciled on focus/reconnect.
- **List**: infinite, rendering **aggregated** items from backend ("A and 4 others liked your post") — render up to 3 actor avatars + "and N others", link to subject post/profile.
- Per-type rendering: like/repost/quote/reply/mention/follow/follow_request/dm, each with appropriate icon, actors, and target.
- **Follow requests** (private accounts): inline Accept/Decline actions that call the follow-request endpoints and optimistically update.
- **Mark read**: mark-all on opening the page (or per-item on click); update badge.
- **Mentions sub-tab**: filtered view.

---

## C16. Search & Explore (client)

- **Search box** (header/right sidebar/explore): debounced typeahead via `/search/suggest` → shows users + tags; Enter → results page.
- **Results page** `/search?q=&type=`: tabs **Top | Latest | People | Media**, each an infinite list with its own query key; preserves `q` across tabs.
- Recognizes `#tag` (→ tag timeline) and `@handle` (→ user) inputs; supports `from:` operator if backend enables it.
- **Explore / Trends**: render cached `/trends`; each trend links to its tag timeline; "who to follow" suggestions block.

---

## C17. Auth (client)

### C17.1 Token handling
- Access token in memory (Zustand/auth store); refresh token per backend choice:
  - If backend uses **httpOnly cookie** refresh → client just calls `/auth/refresh`; nothing stored in JS (preferred, safer).
  - If **body** refresh token → store in memory + persist carefully; prefer cookie approach.
- **Axios/fetch interceptor**: on `401`, attempt a single refresh, queue concurrent failed requests, replay on success; on refresh failure → logout + redirect `/login`.
- **Auth guard** wrapper on `*` routes; redirect with `returnTo`.

### C17.2 Screens
- **Register**: email, handle (live availability check via lightweight endpoint or on-submit), password (strength meter), display name; client-side validation mirroring backend limits (§15).
- **Login**: emailOrHandle + password; error states; rate-limit `429` surfaced with retry timing.
- **Verify email**: reads token from query, calls endpoint, success/failure states.
- **Sessions** (`/settings/sessions`): list active sessions (device/UA/IP/last-seen), revoke individual, "log out everywhere".

---

## C18. Component Library (design-system primitives)

Build these once, reuse everywhere. All themeable via tokens (§C19), all accessible (§C20):
`Button` (variants: primary/secondary/ghost/danger, sizes, loading), `IconButton`, `Avatar` (sizes, verified ring option), `Modal`/`Dialog` (focus-trapped, route-aware), `Drawer` (mobile nav), `Tabs`, `Menu`/`Dropdown` (overflow actions), `Tooltip`, `Toast` (success/error, e.g. failed actions), `Spinner`/`Skeleton`, `TextInput`/`TextArea` (with counter variant), `Toggle`/`Switch`, `Badge`/`Counter`, `EmptyState`, `ConfirmDialog`, `RelativeTime`, `LinkifiedText` (RichText), `MediaGrid`, `Lightbox`, `InfiniteList` wrapper, `PostCard`, `UserCard`/`UserRow`, `FollowButton`, `ActionBar`.

---

## C19. Theming & Visual Identity (OPEN DECISION)

This is intentionally unspecified so the product is your own. Implement a **token layer** so any aesthetic can be applied without touching components:

- **Design tokens** (CSS variables): color (bg, surface, surface-raised, text, text-muted, accent, accent-contrast, success, danger, border, overlay), radius scale, spacing scale, font families (display + body), font sizes/line-heights, shadow scale, z-index scale, motion durations/easings.
- **Light & dark themes** both required; theme toggle in settings, respect `prefers-color-scheme` by default, persist choice.
- **Typography**: pick a distinctive display face + readable body

> ⚠️ **[INTAKE TRUNCATED HERE]** — the source message exceeded its size limit mid-§C19. The remainder of
> Part II (rest of §C19 theming, §C20 accessibility, performance, client testing, any §C21+) must be appended
> from the user's source document and re-versioned as `PRD-v1.1` before the frontend design-system/theming step.
