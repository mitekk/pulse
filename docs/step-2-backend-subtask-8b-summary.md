# Backend Phase 2 — Subtask 8b: Notifications Summary

**Completed:** 2026-06-07
**Status:** All deliverables implemented. typecheck ✓ lint ✓ build ✓ tests ✓ (355 passing — 31 new)

---

## Migration Created

**`src/infra/database/migrations/1704067200008-create-notifications.ts`**

| Table | PK | Key constraints |
|-------|-----|-----------------|
| `notifications` | bigint snowflake | `recipient_id FK→users ON DELETE CASCADE`; `actor_id FK→users ON DELETE CASCADE`; `CHECK recipient_id <> actor_id` (DB-level self-notify guard); ENUM `notification_type` |

**Indexes:**
- `(recipient_id, id DESC)` — paginated list queries
- Partial `(recipient_id) WHERE read_at IS NULL` — unread-count queries
- `(recipient_id, type, actor_id, post_id) WHERE post_id IS NOT NULL` — dedup check

---

## Entity Created

| Entity | File |
|--------|------|
| `Notification` | `src/modules/notifications/notification.entity.ts` |

Fields: `id` (bigint snowflake), `recipientId`, `type` (enum), `actorId`, `postId` (nullable bigint), `readAt` (nullable timestamptz), `createdAt`.

---

## NotificationsService (`src/modules/notifications/notifications.service.ts`)

**Creation rules:**
- Suppress self-notifications (`actorId === recipientId`) — checked first, no DB queries
- Suppress if either party blocked the other (`SELECT EXISTS ... FROM blocks`) — bidirectional
- Suppress muted actors for non-follow/non-dm types (follow, follow_request, dm skip mute check)
- Deduplicate: skip insert if same `(recipient, type, post_id, actor)` row exists within 1-hour window

**Methods:**
- `notifyLike(actorId, recipientId, postId)` → type='like'
- `notifyReply(actorId, recipientId, postId)` → type='reply'
- `notifyRepost(actorId, recipientId, postId)` → type='repost'
- `notifyQuote(actorId, recipientId, postId)` → type='quote'
- `notifyMention(actorId, recipientId, postId)` → type='mention'
- `notifyFollow(actorId, recipientId)` → type='follow'
- `notifyFollowRequest(actorId, recipientId)` → type='follow_request'
- `notifyFollowAccepted(actorId, recipientId)` → type='follow' (actor=accepter, recipient=requester)
- `notifyDm(actorId, recipientId, conversationId, messageId)` → type='dm'
- `getNotifications(userId, limit, cursor)` → aggregated `NotificationDto[]`
- `getUnreadCount(userId)` → Redis badge (reconciles from DB on cache miss)
- `markRead(userId, ids?)` → marks rows + adjusts Redis badge

**On create:** write row → `INCR notif:unread:{recipientId}` → enqueue `notify.deliver` job

---

## notify.deliver BullMQ Worker (`src/modules/notifications/notify-deliver.processor.ts`)

- Queue: `notify`, job name: `notify.deliver`
- Loads notification row with actor relation
- Builds minimal `NotificationDto` (single actor, no post — client re-fetches aggregated list)
- Calls `RealtimePublisherPort.publishNotification(recipientId, dto)` → Redis pub/sub → WS `notification.new` to `user:{recipientId}`

---

## Aggregation Read Model

`GET /api/v1/notifications` aggregates raw rows at read time:

**Aggregatable types** (like, reply, repost, quote, mention): grouped by `(type, post_id)` within a 24-hour window. Each group produces one `NotificationDto` with up to 3 actors + `otherCount`.

**Non-aggregatable types** (follow, follow_request, dm): each row is its own `NotificationDto`.

**readAt logic:** null if ANY row in the group is unread; latest readAt if ALL rows are read.

---

## REST Endpoints (`src/modules/notifications/notifications.controller.ts`)

All under global prefix `api/v1`, all require `AuthGuard`.

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/v1/notifications` | Cursor by id DESC; aggregated |
| GET | `/api/v1/notifications/unread-count` | Redis badge; DB reconcile on miss |
| POST | `/api/v1/notifications/read` | `{ ids? }`: mark subset or all; returns `{ updated }` |

---

## Wired Call Sites (Seam Replacements)

**Three noop seams replaced via AppModule token overrides:**

| Token | Old Provider | New Provider | Callers |
|-------|-------------|-------------|---------|
| `NOTIFICATION_PORT` | `NoopNotificationService` (UsersModule) | `RealNotificationService` | `UsersService.follow()`, `acceptFollowRequest()` |
| `POSTS_NOTIFICATION_PORT` | `NoopPostsNotificationService` (PostsModule/EngagementModule) | `RealPostsNotificationService` | `PostsService.create()`, `repost()`; `EngagementService.like()` |
| `DM_NOTIFICATION_PORT` | `NoopDmNotificationService` (MessagingModule) | `RealDmNotificationService` | `MessagingService.sendMessage()` |

**PostsNotificationPort extended:** added `notifyLike()` method (was `notifyRepost` misnamed in EngagementService). Updated `NoopPostsNotificationService`, `EngagementService`, and existing tests accordingly.

---

## Redis Keys

| Key | Type | TTL | Purpose |
|-----|------|-----|---------|
| `notif:unread:{userId}` | int | none (invalidated on write) | Unread notification badge |

---

## WS Events Confirmed

- `notification.new` → `NotificationDto` → `user:{recipientId}` room (via `RealtimePublisherService.publishNotification`)
- `follow.update` → already emitted by UsersService via `RealtimePublisherService.publishFollowUpdate` (subtask 8a)

---

## Unit Tests

| File | Tests | Coverage |
|------|-------|----------|
| `tests/unit/notifications/notifications.service.spec.ts` | 31 | 8 creation-per-type, 1 self-suppress, 2 block-suppress, 3 mute-suppress (mute/no-mute), 2 dedup, 2 Redis badge, 3 unread-count (hit/miss/zero), 5 markRead (subset/all/floor-at-0/no-op/invalid-id), 5 aggregation (3-actors+otherCount/window-boundary/non-aggregatable/readAt-null-if-any-unread/readAt-latest-if-all-read) |

**355 total passing (31 new).**

---

## Key File Paths

| What | Where |
|------|-------|
| Migration | `src/infra/database/migrations/1704067200008-create-notifications.ts` |
| Notification entity | `src/modules/notifications/notification.entity.ts` |
| NotificationsService | `src/modules/notifications/notifications.service.ts` |
| NotificationsController | `src/modules/notifications/notifications.controller.ts` |
| NotificationsModule | `src/modules/notifications/notifications.module.ts` |
| NotifyDeliverProcessor | `src/modules/notifications/notify-deliver.processor.ts` |
| NotificationDto | `src/modules/notifications/dto/notification.dto.ts` |
| RealNotificationService | `src/modules/notifications/real-notification.service.ts` |
| RealPostsNotificationService | `src/modules/notifications/real-posts-notification.service.ts` |
| RealDmNotificationService | `src/modules/notifications/real-dm-notification.service.ts` |
| AppModule (wiring) | `src/app.module.ts` |
| Extended port | `src/modules/posts/posts-notification.port.ts` (added `notifyLike`) |
| Updated noop | `src/modules/posts/noop-posts-notification.service.ts` |
| Unit tests | `tests/unit/notifications/notifications.service.spec.ts` |

---

## Remaining Backend Work

Only **Subtask 9 (Search + hardening)** remains:
- `GET /api/v1/search` + `/search/suggest` + `/trends`
- Full-text search processor (search queue consumer)
- Health endpoint
- Any remaining hardening (rate limits, audit)
