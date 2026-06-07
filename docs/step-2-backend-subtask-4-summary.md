# Backend Phase 2 — Subtask 4: Posts + Entity Extraction + Threads/Reposts/Quotes Summary

**Completed:** 2026-06-07
**Status:** All deliverables implemented. typecheck ✓ lint ✓ build ✓ tests ✓ (172 passing — 48 new)

---

## Tables Created (Migration `1704067200004-create-posts.ts`)

### `posts`
- Snowflake BIGINT PK
- `author_id UUID NOT NULL REFERENCES users ON DELETE CASCADE`
- `text TEXT` (nullable — pure reposts have no text)
- `lang VARCHAR(10)` nullable
- `reply_to_id BIGINT REFERENCES posts ON DELETE SET NULL`
- `reply_root_id BIGINT REFERENCES posts ON DELETE SET NULL`
- `conversation_id BIGINT` (root post id of thread; no FK to avoid cycles)
- `repost_of_id BIGINT REFERENCES posts ON DELETE SET NULL`
- `quote_of_id BIGINT REFERENCES posts ON DELETE SET NULL`
- `reply_policy VARCHAR(10) CHECK('everyone','following','mentioned') DEFAULT 'everyone'`
- Denorm counters: `reply_count`, `repost_count`, `like_count`, `bookmark_count`, `view_count` (all INTEGER DEFAULT 0)
- `created_at TIMESTAMPTZ`, `deleted_at TIMESTAMPTZ` (soft-delete)
- **Indexes:**
  - `(author_id, id DESC)` — user timeline
  - `(reply_to_id, id) WHERE reply_to_id IS NOT NULL` — thread replies
  - `(conversation_id, id) WHERE conversation_id IS NOT NULL` — conversation group
  - `(repost_of_id) WHERE repost_of_id IS NOT NULL` — repost lookup
  - `(quote_of_id) WHERE quote_of_id IS NOT NULL` — quote lookup
  - `UNIQUE (author_id, repost_of_id) WHERE repost_of_id IS NOT NULL` — one repost per user per post (prevents duplicate reposts at DB level)
  - `GIN (to_tsvector('english', coalesce(text, '')))` — full-text search

### `mentions`
- Composite PK `(post_id, mentioned_user_id)`
- `post_id → posts ON DELETE CASCADE`
- `mentioned_user_id → users ON DELETE CASCADE`
- Index `(mentioned_user_id, post_id DESC)` — "posts mentioning user X"

### `hashtags`
- Snowflake BIGINT PK
- `tag CITEXT UNIQUE` — case-insensitive dedup at DB level
- `created_at TIMESTAMPTZ`

### `post_hashtags`
- Composite PK `(post_id, hashtag_id)`
- `post_id → posts ON DELETE CASCADE`
- `hashtag_id → hashtags ON DELETE CASCADE`
- Index `(hashtag_id, post_id DESC)` — tag timeline queries

---

## Entities Created

| Entity | File | Key |
|--------|------|-----|
| `Post` | `src/modules/posts/post.entity.ts` | Snowflake BIGINT PK; all self-FKs nullable |
| `Mention` | `src/modules/posts/mention.entity.ts` | Composite PK (post_id, mentioned_user_id) |
| `Hashtag` | `src/modules/posts/hashtag.entity.ts` | Snowflake BIGINT PK; tag citext unique |
| `PostHashtag` | `src/modules/posts/post-hashtag.entity.ts` | Composite PK (post_id, hashtag_id) |

---

## EntityExtractorService API (`src/modules/posts/entity-extractor.service.ts`)

Single-pass extraction of @mentions, #hashtags, and URLs from post text. Returns codepoint-accurate offsets.

```typescript
interface MentionEntity  { handle: string; userId: string; start: number; end: number; }
interface HashtagEntity  { tag: string; start: number; end: number; }
interface UrlEntity      { url: string; displayUrl: string; start: number; end: number; }
interface ExtractedEntities { mentions: MentionEntity[]; hashtags: HashtagEntity[]; urls: UrlEntity[]; }

// Main method — called inside post-create transaction
extractAndPersist(postId: string, text: string | null): Promise<ExtractedEntities>
```

**Algorithm:**
1. Single regex pass over text for @mentions, #hashtags, and http(s) URLs.
2. Byte offsets (from RegExp.exec) converted to codepoint offsets via codepoint-walk.
3. Mentions: batch lookup `WHERE handle = ANY(:handles)` (citext) → resolve to user IDs; unknown handles skipped.
4. Hashtags: sequential upsert (check existing by LOWER(tag) → use existing id; or insert new Snowflake id).
5. Writes `mentions` + `post_hashtags` rows with `INSERT ... ON CONFLICT DO NOTHING` (idempotent).
6. Returns `ExtractedEntities` for embedding in PostDto.

---

## PostsService API (`src/modules/posts/posts.service.ts`)

### Exported helper (tested)

```typescript
export function countPostLength(text: string): number
// Counts text in codepoints; each URL replaced with 23-char token.
// Used by create() and by frontend character counter (matching algorithm).
```

### Methods

| Method | Signature | Notes |
|--------|-----------|-------|
| `create` | `(authorId, CreatePostDto) → PostDto` | Validates length (280 cp), loads parent/quote, enforces reply_policy, transactional write + entity extraction + counter increments, enqueues fanout+search jobs, emits notifications |
| `repost` | `(authorId, originalPostId) → { reposted, count }` | Toggle: create new / restore soft-deleted / return idempotent if already active; UNIQUE(author_id, repost_of_id) enforced at DB |
| `unrepost` | `(authorId, originalPostId) → { reposted, count }` | Soft-delete repost row; idempotent if not found |
| `findOne` | `(postId, viewerId) → PostDto` | VisibilityService gated; tombstone (deleted=true, text=null) for soft-deleted |
| `softDelete` | `(postId, authorId) → void` | Author-only; enqueues search.index delete job |
| `getThread` | `(postId, viewerId, limit, cursor) → { ancestors, post, replies, cursor, hasMore }` | Ancestors: walk replyToId chain to root; replies ranked: author-first → like_count DESC → id ASC |
| `getReplies` | `(postId, viewerId, limit, cursor)` | Cursor-paginated replies |
| `getReposts` | `(postId, viewerId, limit, cursor)` | Returns `UserCardDto[]` of reposters |
| `getQuotes` | `(postId, viewerId, limit, cursor)` | Cursor-paginated quote posts |
| `getLikes` | `(postId, viewerId, limit, cursor)` | **Stub** — returns `[]`; implemented in EngagementModule (subtask 5) |

**Text length rule (spec §3.1):**
- Counted in Unicode codepoints (emoji = 1, not 2)
- Each URL replaced with 23-char token before counting
- Max 280 codepoints; empty text allowed only when `mediaIds` is non-empty

**Reply policy enforcement:**
- `everyone` — no restriction
- `following` — viewer must be active follower of parent author (or IS the author)
- `mentioned` — viewer must appear in `mentions` table for parent post (or IS the author)

**Counter mutations — no read-modify-write:**
```sql
UPDATE posts SET reply_count = reply_count + 1 WHERE id = $1
UPDATE posts SET repost_count = repost_count + 1 WHERE id = $1
UPDATE users SET posts_count = posts_count + 1 WHERE id = $1
```
All inside `DataSource.transaction()`.

---

## Endpoints Implemented

All registered on `PostsController` under global prefix `api/v1`.

| Method | Path | Guard | Notes |
|--------|------|-------|-------|
| POST | `/posts` | AuthGuard + RateLimitGuard | 300/3h rate limit |
| GET | `/posts/:id` | OptionalAuthGuard | Tombstone for deleted |
| DELETE | `/posts/:id` | AuthGuard | Author-only; 204 |
| GET | `/posts/:id/thread` | OptionalAuthGuard | Ancestors + ranked replies |
| GET | `/posts/:id/replies` | OptionalAuthGuard | Cursor paginated |
| GET | `/posts/:id/reposts` | OptionalAuthGuard | `UserCardDto[]` cursor |
| GET | `/posts/:id/quotes` | OptionalAuthGuard | `PostDto[]` cursor |
| GET | `/posts/:id/likes` | OptionalAuthGuard | Stub (empty) |
| POST | `/posts/:id/repost` | AuthGuard | Toggle; 201 |
| DELETE | `/posts/:id/repost` | AuthGuard | Toggle; 200 |

---

## Fanout / Search / Notification Seams

**Fanout (`fanout` queue):** `fanout.post` job enqueued on `create()` and `repost()`. Payload: `{ postId, authorId, repostOf? }`. **Processor:** registered in TimelineModule (subtask 6).

**Search (`search` queue):** `search.index` job enqueued on `create()` (action: 'upsert') and `softDelete()` (action: 'delete'). **Processor:** registered in SearchModule (subtask 8/Phase 8).

**Notification seam:** `PostsNotificationPort` interface + `NoopPostsNotificationService` (logs at debug). Methods: `notifyReply`, `notifyMention`, `notifyQuote`, `notifyRepost`. Phase 7 replaces `NoopPostsNotificationService` with a real implementation.

Both queues registered as **producer-only** in `PostsModule.imports`; no processor classes registered here. Consumers are added by their owning modules.

---

## Viewer Flags Stub

`PostsService.loadViewerFlags()` currently returns `{ liked: false, reposted: false, bookmarked: false }` for all posts. EngagementModule (subtask 5) adds the `likes` and `bookmarks` tables and fills in these flags.

---

## Key File Paths

| What | Where |
|------|-------|
| Migration | `src/infra/database/migrations/1704067200004-create-posts.ts` |
| Post entity | `src/modules/posts/post.entity.ts` |
| Mention entity | `src/modules/posts/mention.entity.ts` |
| Hashtag entity | `src/modules/posts/hashtag.entity.ts` |
| PostHashtag entity | `src/modules/posts/post-hashtag.entity.ts` |
| PostsService | `src/modules/posts/posts.service.ts` |
| PostsController | `src/modules/posts/posts.controller.ts` |
| PostsModule | `src/modules/posts/posts.module.ts` |
| EntityExtractorService | `src/modules/posts/entity-extractor.service.ts` |
| PostsNotificationPort | `src/modules/posts/posts-notification.port.ts` |
| NoopPostsNotificationService | `src/modules/posts/noop-posts-notification.service.ts` |
| CreatePostDto | `src/modules/posts/dto/create-post.dto.ts` |
| PostDto | `src/modules/posts/dto/post.dto.ts` |
| Unit tests (posts) | `tests/unit/posts/posts.service.spec.ts` |
| Unit tests (extractor) | `tests/unit/posts/entity-extractor.spec.ts` |

---

## What Engagement (Subtask 5) Builds On

1. **`Post` entity** — `likeCount`, `bookmarkCount` columns already exist; engagement module increments them.
2. **`PostsModule` TypeORM export** — `EngagementModule` imports `PostsModule` to get `Post` entity without re-registering.
3. **`loadViewerFlags()` stub** — Replace or extend `PostsService.loadViewerFlags()` to query `likes`/`bookmarks` tables.
4. **`getLikes()` stub** — Implement in `EngagementModule` or override via `PostsService` injection.
5. **Counter pattern** — Same `UPDATE ... SET x = x + 1` pattern used here; engagement uses it for `like_count`/`bookmark_count`.

## What Timeline (Subtask 6) Builds On

1. **`fanout.post` job payload** — `{ postId, authorId, repostOf? }` — consumer reads this in `TimelineModule`.
2. **`Post` entity** — timeline queries `posts` by author or conversation; entity already available via `PostsModule` export.
3. **`VisibilityService.filterPostPage()`** — timeline uses this for per-user visibility on home feed pages.
