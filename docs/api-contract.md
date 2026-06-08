# API Contract — Microblogging Platform

**Base path:** `/api/v1`
**PRD source:** `docs/prd/PRD-current.md` (v1)
**Planned:** 2026-06-07
**Status:** all endpoints `planned` — backend agent updates to `implemented` as routes land.

## Conventions

- All IDs are **strings** (Snowflake BIGINT or UUID serialized as string) in all request/response bodies.
- All timestamps are **ISO 8601 UTC** strings (`2026-06-07T12:00:00Z`).
- All list endpoints return cursor pagination: `{ "items": [...], "cursor": "eyJ...", "hasMore": true }`.
- Default page size: 20. Max: 100. Query param: `?limit=N&cursor=<opaque>`.
- Error shape: `{ "error": { "code": "SCREAMING_SNAKE_CASE", "message": "...", "details": [{ "field": "...", "message": "..." }] } }`.
- Auth column: **Yes** = `AuthGuard` (valid access JWT in `Authorization: Bearer`); **Optional** = `OptionalAuthGuard` (personalizes if authed); **No** = public.
- Refresh token delivered/consumed via `httpOnly; Secure; SameSite=Strict` cookie (not in body).

---

## Auth

| Method | Path | Auth? | Request Body | Response Body | Status |
|--------|------|-------|--------------|---------------|--------|
| POST | `/api/v1/auth/register` | No | `{ email: string, handle: string, password: string, displayName?: string }` | `{ user: UserDto, accessToken: string }` + sets refresh cookie | implemented |
| POST | `/api/v1/auth/login` | No | `{ emailOrHandle: string, password: string }` | `{ user: UserDto, accessToken: string }` + sets refresh cookie | implemented |
| POST | `/api/v1/auth/refresh` | No (cookie) | — (reads refresh cookie + X-CSRF-Token header) | `{ accessToken: string }` + rotates refresh cookie | implemented |
| POST | `/api/v1/auth/logout` | Yes | — | 204 No Content; clears refresh cookie | implemented |
| GET | `/api/v1/auth/me` | Yes | — | `{ user: UserDto }` | implemented |
| POST | `/api/v1/auth/verify-email` | No | `{ token: string }` | `{ message: "Email verified" }` | implemented |
| GET | `/api/v1/auth/sessions` | Yes | — | `{ items: SessionDto[], cursor: string, hasMore: boolean }` | implemented |
| DELETE | `/api/v1/auth/sessions/:id` | Yes | — | 204 No Content | implemented |

**SessionDto:**
```
{ id: string, userAgent: string, ip: string, createdAt: string, expiresAt: string, isCurrent: boolean }
```

---

## Users & Profiles

| Method | Path | Auth? | Request Body | Response Body | Status |
|--------|------|-------|--------------|---------------|--------|
| GET | `/api/v1/users/:handle` | Optional | — | `{ user: ProfileDto }` | implemented |
| PATCH | `/api/v1/users/me` | Yes | `{ displayName?: string, bio?: string, location?: string, website?: string, avatarMediaId?: string, bannerMediaId?: string, isPrivate?: boolean, dmPrivacy?: 'everyone'|'following' }` | `{ user: ProfileDto }` | implemented |
| GET | `/api/v1/users/:handle/posts` | Optional | `?cursor=&limit=` | `{ items: PostDto[], cursor: string, hasMore: boolean }` | implemented |
| GET | `/api/v1/users/:handle/replies` | Optional | `?cursor=&limit=` | `{ items: PostDto[], cursor: string, hasMore: boolean }` | implemented |
| GET | `/api/v1/users/:handle/media` | Optional | `?cursor=&limit=` | `{ items: PostDto[], cursor: string, hasMore: boolean }` | implemented |
| GET | `/api/v1/users/:handle/likes` | Optional | `?cursor=&limit=` | `{ items: PostDto[], cursor: string, hasMore: boolean }` (privacy-gated: 403 if not allowed) | implemented |
| GET | `/api/v1/users/:handle/followers` | Optional | `?cursor=&limit=` | `{ items: UserCardDto[], cursor: string, hasMore: boolean }` | implemented |
| GET | `/api/v1/users/:handle/following` | Optional | `?cursor=&limit=` | `{ items: UserCardDto[], cursor: string, hasMore: boolean }` | implemented |
| POST | `/api/v1/users/:handle/follow` | Yes | — | `{ state: 'active'|'pending' }` 201 | implemented |
| DELETE | `/api/v1/users/:handle/follow` | Yes | — | 204 No Content | implemented |
| POST | `/api/v1/users/:handle/block` | Yes | — | 201 `{ blocked: true }` | implemented |
| DELETE | `/api/v1/users/:handle/block` | Yes | — | 204 No Content | implemented |
| POST | `/api/v1/users/:handle/mute` | Yes | — | 201 `{ muted: true }` | implemented |
| DELETE | `/api/v1/users/:handle/mute` | Yes | — | 204 No Content | implemented |

---

## Follow Requests (private accounts)

| Method | Path | Auth? | Request Body | Response Body | Status |
|--------|------|-------|--------------|---------------|--------|
| GET | `/api/v1/follow-requests` | Yes | `?cursor=&limit=` | `{ items: FollowRequestDto[], cursor: string, hasMore: boolean }` | implemented |
| POST | `/api/v1/follow-requests/:id/accept` | Yes | — | 200 `{ state: 'active' }` | implemented |
| POST | `/api/v1/follow-requests/:id/decline` | Yes | — | 200 `{ state: 'declined' }` | implemented |

**FollowRequestDto:**
```
{ id: string, requester: UserCardDto, createdAt: string }
```

---

## Posts

| Method | Path | Auth? | Request Body | Response Body | Status |
|--------|------|-------|--------------|---------------|--------|
| POST | `/api/v1/posts` | Yes | `{ text?: string, mediaIds?: string[], replyToId?: string, quoteOfId?: string, replyPolicy?: 'everyone'|'following'|'mentioned' }` | `{ post: PostDto }` 201 | implemented |
| GET | `/api/v1/posts/:id` | Optional | — | `{ post: PostDto }` | implemented |
| DELETE | `/api/v1/posts/:id` | Yes | — | 204 No Content (soft delete, tombstone in thread) | implemented |
| GET | `/api/v1/posts/:id/thread` | Optional | — | `{ ancestors: PostDto[], post: PostDto, replies: PostDto[], cursor: string, hasMore: boolean }` | implemented |
| GET | `/api/v1/posts/:id/replies` | Optional | `?cursor=&limit=` | `{ items: PostDto[], cursor: string, hasMore: boolean }` | implemented |
| GET | `/api/v1/posts/:id/reposts` | Optional | `?cursor=&limit=` | `{ items: UserCardDto[], cursor: string, hasMore: boolean }` | implemented |
| GET | `/api/v1/posts/:id/quotes` | Optional | `?cursor=&limit=` | `{ items: PostDto[], cursor: string, hasMore: boolean }` | implemented |
| GET | `/api/v1/posts/:id/likes` | Optional | `?cursor=&limit=` | `{ items: UserCardDto[], cursor: string, hasMore: boolean }` | implemented |
| POST | `/api/v1/posts/:id/like` | Yes | — | 201 `{ liked: true, count: number }` | implemented |
| DELETE | `/api/v1/posts/:id/like` | Yes | — | 200 `{ liked: false, count: number }` | implemented |
| POST | `/api/v1/posts/:id/repost` | Yes | — | 201 `{ reposted: true, count: number }` | implemented |
| DELETE | `/api/v1/posts/:id/repost` | Yes | — | 200 `{ reposted: false, count: number }` | implemented |
| POST | `/api/v1/posts/:id/bookmark` | Yes | — | 201 `{ bookmarked: true }` | implemented |
| DELETE | `/api/v1/posts/:id/bookmark` | Yes | — | 200 `{ bookmarked: false }` | implemented |

---

## Timelines

| Method | Path | Auth? | Request Body | Response Body | Status |
|--------|------|-------|--------------|---------------|--------|
| GET | `/api/v1/timeline/home` | Yes | `?cursor=&limit=` | `{ items: PostDto[], cursor: string, hasMore: boolean }` | implemented |
| GET | `/api/v1/timeline/hashtag/:tag` | Optional | `?cursor=&limit=` | `{ items: PostDto[], cursor: string, hasMore: boolean }` | implemented |
| GET | `/api/v1/bookmarks` | Yes | `?cursor=&limit=` | `{ items: PostDto[], cursor: string, hasMore: boolean }` | implemented |

---

## Media

| Method | Path | Auth? | Request Body | Response Body | Status |
|--------|------|-------|--------------|---------------|--------|
| POST | `/api/v1/media/upload-url` | Yes | `{ type: 'image'\|'gif'\|'video', mime: string, size: number }` | `{ mediaId: string, upload: { url: string, fields: Record<string,string> } }` 201 — presigned **POST** (multipart; file last). 413 `FILE_TOO_LARGE`, 400 `INVALID_MIME_TYPE`/`VIDEO_NOT_SUPPORTED`, 507 `STORAGE_CAP_EXCEEDED` | implemented |
| POST | `/api/v1/media/:id/finalize` | Yes | — | `{ media: MediaDto }` 200 | implemented |
| GET | `/api/v1/media/:id` | Yes | — | `{ media: MediaDto }` | implemented |
| PATCH | `/api/v1/media/:id` | Yes | `{ altText: string }` | `{ media: MediaDto }` | implemented |

**MediaDto:**
```
{ id: string, type: 'image'|'gif'|'video', status: 'pending'|'processing'|'ready'|'failed',
  mime: string, width: number|null, height: number|null, durationMs: number|null,
  altText: string|null, variants: { thumb?: string, small?: string, medium?: string, large?: string, mp4?: string, poster?: string },
  createdAt: string }
```

---

## Messaging (DMs)

| Method | Path | Auth? | Request Body | Response Body | Status |
|--------|------|-------|--------------|---------------|--------|
| GET | `/api/v1/conversations` | Yes | `?cursor=&limit=` | `{ items: ConversationDto[], cursor: string, hasMore: boolean }` | implemented |
| POST | `/api/v1/conversations` | Yes | `{ recipientHandle: string }` | `{ conversation: ConversationDto }` 201 (idempotent — returns existing if already exists) | implemented |
| GET | `/api/v1/conversations/:id/messages` | Yes | `?cursor=&limit=` | `{ items: MessageDto[], cursor: string, hasMore: boolean }` | implemented |
| POST | `/api/v1/conversations/:id/messages` | Yes | `{ text?: string, mediaId?: string, clientNonce: string }` | `{ message: MessageDto }` 201 | implemented |
| POST | `/api/v1/conversations/:id/read` | Yes | `{ lastReadMessageId: string }` | 200 `{ ok: true }` | implemented |
| POST | `/api/v1/conversations/:id/mute` | Yes | — | 200 `{ muted: true }` | implemented |
| DELETE | `/api/v1/conversations/:id/mute` | Yes | — | 200 `{ muted: false }` | implemented |

**ConversationDto:**
```
{ id: string, participants: UserCardDto[], lastMessage: MessageDto|null,
  unreadCount: number, muted: boolean, createdAt: string }
```

---

## Notifications

| Method | Path | Auth? | Request Body | Response Body | Status |
|--------|------|-------|--------------|---------------|--------|
| GET | `/api/v1/notifications` | Yes | `?cursor=&limit=` | `{ items: NotificationDto[], cursor: string, hasMore: boolean }` | implemented |
| GET | `/api/v1/notifications/unread-count` | Yes | — | `{ count: number }` | implemented |
| POST | `/api/v1/notifications/read` | Yes | `{ ids?: string[] }` (omit to mark all read) | 200 `{ updated: number }` | implemented |

---

## Search

| Method | Path | Auth? | Request Body | Response Body | Status |
|--------|------|-------|--------------|---------------|--------|
| GET | `/api/v1/search` | Optional | `?q=string&type=top|latest|people|media&cursor=&limit=` | `{ items: (PostDto|UserCardDto)[], cursor: string, hasMore: boolean }` | implemented |
| GET | `/api/v1/search/suggest` | Optional | `?q=string` | `{ users: UserCardDto[], tags: TagDto[] }` | implemented |
| GET | `/api/v1/trends` | Optional | — | `{ trends: TrendDto[] }` | implemented |

**TagDto:** `{ tag: string, postCount: number }`
**TrendDto:** `{ tag: string, postCount: number, postsInWindow: number }`

---

## Reports

| Method | Path | Auth? | Request Body | Response Body | Status |
|--------|------|-------|--------------|---------------|--------|
| POST | `/api/v1/reports` | Yes | `{ targetType: 'post'|'user', targetId: string, reason: 'spam'|'harassment'|'hate_speech'|'misinformation'|'other', description?: string }` | `{ report: ReportDto }` 201 | implemented |

---

## Health

| Method | Path | Auth? | Request Body | Response Body | Status |
|--------|------|-------|--------------|---------------|--------|
| GET | `/health` | No | — | `{ status: "ok", db: "ok"|"error", redis: "ok"|"error" }` | implemented |

---

## DTO Reference Shapes

These are the canonical response shapes. Every endpoint above references one of these. Backend agent must implement exactly these fields; frontend agent types from these.

### UserDto (for `/auth/me`, embedded in auth responses)
```json
{
  "id": "uuid-or-snowflake-string",
  "handle": "alice",
  "displayName": "Alice",
  "email": "alice@example.com",
  "avatarUrl": "https://cdn.example.com/...",
  "isVerified": false,
  "isPrivate": false,
  "dmPrivacy": "following",
  "createdAt": "2026-06-07T00:00:00Z"
}
```

### ProfileDto (for `/users/:handle`, includes relationship flags)
```json
{
  "id": "string",
  "handle": "alice",
  "displayName": "Alice",
  "bio": "Hello world",
  "location": "NYC",
  "website": "https://alice.dev",
  "avatarUrl": "https://cdn.example.com/...",
  "bannerUrl": "https://cdn.example.com/...",
  "isVerified": false,
  "isPrivate": false,
  "counts": { "followers": 120, "following": 88, "posts": 340 },
  "viewer": {
    "following": false,
    "followedBy": false,
    "blocked": false,
    "muted": false,
    "followRequested": false
  },
  "createdAt": "2026-06-07T00:00:00Z"
}
```

### UserCardDto (compact; used in lists, notifications, etc.)
```json
{
  "id": "string",
  "handle": "alice",
  "displayName": "Alice",
  "avatarUrl": "https://cdn.example.com/...",
  "isVerified": false,
  "isPrivate": false
}
```

### PostDto
```json
{
  "id": "1750000000000000001",
  "author": {
    "id": "string", "handle": "alice", "displayName": "Alice",
    "avatarUrl": "https://cdn.example.com/...", "isVerified": false
  },
  "text": "hello #world @bob",
  "createdAt": "2026-06-07T12:00:00Z",
  "entities": {
    "mentions": [{ "handle": "bob", "userId": "string", "start": 12, "end": 16 }],
    "hashtags": [{ "tag": "world", "start": 6, "end": 12 }],
    "urls": [{ "url": "https://example.com", "displayUrl": "example.com", "start": 17, "end": 40 }]
  },
  "media": [
    { "id": "string", "type": "image", "variants": { "thumb": "...", "small": "...", "medium": "...", "large": "..." }, "altText": null, "width": 1200, "height": 675 }
  ],
  "counts": { "replies": 0, "reposts": 0, "likes": 0, "bookmarks": 0 },
  "viewer": { "liked": false, "reposted": false, "bookmarked": false },
  "replyToId": null,
  "replyPolicy": "everyone",
  "quoteOf": null,
  "repostOf": null,
  "repostedBy": null,
  "deleted": false
}
```

Notes:
- `quoteOf`: shallow PostDto (no nested quoteOf/repostOf) when this post is a quote.
- `repostOf`: shallow PostDto when this is a pure repost.
- `repostedBy`: `{ handle: string, displayName: string }` when surfaced via repost event in a feed.
- `deleted: true` → tombstone; `text` may be null; all other fields still present so thread structure survives.

### NotificationDto (aggregated)
```json
{
  "id": "string",
  "type": "like|reply|repost|quote|follow|mention|follow_request|dm",
  "actors": [
    { "id": "string", "handle": "alice", "displayName": "Alice", "avatarUrl": "..." }
  ],
  "otherCount": 4,
  "post": null,
  "readAt": null,
  "createdAt": "2026-06-07T12:00:00Z"
}
```

Notes:
- `actors`: up to 3 most-recent actors for grouped notifications (e.g. "A, B, and 4 others liked").
- `otherCount`: number of additional actors beyond the shown array.
- `post`: shallow PostDto if relevant (like, reply, quote, mention); null for follow/dm.

### MessageDto
```json
{
  "id": "string",
  "conversationId": "string",
  "senderId": "string",
  "text": "hey there",
  "media": null,
  "clientNonce": "abc123",
  "createdAt": "2026-06-07T12:00:00Z"
}
```

---

## WebSocket Events Reference

Base transport: `ws://host/socket.io` (Socket.IO protocol). Auth: access token in handshake `auth: { token: string }`.

### Server → Client

| Event | Payload type | Delivered to room |
|-------|-------------|-------------------|
| `notification.new` | `NotificationDto` | `user:{recipientId}` |
| `timeline.newPosts` | `{ count: number, previewIds: string[] }` | `user:{userId}` |
| `dm.message` | `MessageDto` | `conversation:{id}` + `user:{recipientId}` |
| `dm.typing` | `{ conversationId: string, userId: string }` | `conversation:{id}` |
| `dm.read` | `{ conversationId: string, userId: string, lastReadMessageId: string }` | `conversation:{id}` |
| `post.counters` | `{ postId: string, likes: number, replies: number, reposts: number }` | `post:{id}` |
| `follow.update` | `{ type: 'followed'|'unfollowed'|'requested', actorId: string }` | `user:{userId}` |

### Client → Server

| Event | Payload type | Notes |
|-------|-------------|-------|
| `dm.send` | `{ conversationId: string, text?: string, mediaId?: string, clientNonce: string }` | Idempotent via nonce; server responds with `MessageDto` via ack or echoed `dm.message` |
| `dm.typing` | `{ conversationId: string }` | Debounced; not persisted |
| `dm.markRead` | `{ conversationId: string, lastReadMessageId: string }` | Updates DB + emits `dm.read` |
| `subscribe.post` | `{ postId: string }` | Join `post:{id}` room |
| `unsubscribe.post` | `{ postId: string }` | Leave `post:{id}` room |
| `join.conversation` | `{ conversationId: string }` | Join `conversation:{id}` room (participant check enforced) — added during implementation |
| `leave.conversation` | `{ conversationId: string }` | Leave `conversation:{id}` room — added during implementation |
