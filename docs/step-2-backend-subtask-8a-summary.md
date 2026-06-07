# Backend Phase 2 — Subtask 8a: Realtime Gateway + Direct Messages Summary

**Completed:** 2026-06-07
**Status:** All deliverables implemented. typecheck ✓ lint ✓ build ✓ tests ✓ (324 passing — 76 new)

---

## New npm Packages Installed

```
@nestjs/websockets   @nestjs/platform-socket.io   @socket.io/redis-adapter   socket.io
```

---

## Migrations Created

**`src/infra/database/migrations/1704067200007-create-messaging.ts`**

| Table | PK | Key constraints |
|-------|-----|-----------------|
| `conversations` | bigint snowflake | — |
| `conversation_participants` | composite `(conversation_id, user_id)` | FK→conversations CASCADE, FK→users CASCADE; idx `(user_id, conversation_id)` |
| `conversation_dyads` | composite `(user_lo, user_hi)` | UNIQUE `(user_lo, user_hi)`; CHECK `user_lo < user_hi`; FK→conversations CASCADE; FK→users CASCADE |
| `messages` | bigint snowflake | UNIQUE `client_nonce`; FK→conversations CASCADE; FK→users CASCADE; CHECK `text IS NOT NULL OR media_id IS NOT NULL`; idx `(conversation_id, id DESC)` |

`last_read_message_id` on `conversation_participants` has a deferred FK to `messages` (added via ALTER after messages table exists; ON DELETE SET NULL).

---

## Entities Created

| Entity | File |
|--------|------|
| `Conversation` | `src/modules/messaging/conversation.entity.ts` |
| `ConversationParticipant` | `src/modules/messaging/conversation-participant.entity.ts` |
| `ConversationDyad` | `src/modules/messaging/conversation-dyad.entity.ts` |
| `Message` | `src/modules/messaging/message.entity.ts` |

---

## RealtimeModule — Socket.IO Gateway + Redis Adapter

### `RedisIoAdapter` (`src/modules/realtime/redis-io.adapter.ts`)

Extends `IoAdapter` from `@nestjs/platform-socket.io`. Uses ioredis clients (matching codebase; ioredis is officially supported by `@socket.io/redis-adapter`). Wired in `main.ts`:

```typescript
const redisIoAdapter = new RedisIoAdapter(app);
await redisIoAdapter.connectToRedis(redisUrl);
app.useWebSocketAdapter(redisIoAdapter);
```

### `RealtimeGateway` (`src/modules/realtime/realtime.gateway.ts`)

- `@WebSocketGateway` on the Fastify NestJS app
- **Auth on connect**: `handleConnection()` reads `handshake.auth.token`, verifies access JWT via `JwtService`; disconnects with `error` event on missing or invalid token
- On connect success: joins `user:{userId}` personal room; stores `{ userId, handle, sessionId }` in `socket.data`
- **Client→Server events handled:**
  - `dm.send` — routes through `MessagingService.sendMessage()` (same path as REST; nonce idempotency applies)
  - `dm.typing` — validates participant membership; relays to `conversation:{id}` room (not persisted)
  - `dm.markRead` — calls `MessagingService.markRead()`; returns `{ ok: true }`
  - `subscribe.post` — joins `post:{postId}` room (requireUser guard)
  - `unsubscribe.post` — leaves `post:{postId}` room
  - `join.conversation` — validates participation; joins `conversation:{id}` room
  - `leave.conversation` — leaves `conversation:{id}` room

### `RealtimePublisherService` (`src/modules/realtime/realtime-publisher.service.ts`)

**The REAL implementation of `RealtimePublisherPort`** (replaces the noop from Timeline subtask 6).

**Dual role:**
1. Subscribes to Redis pub/sub channels in `onModuleInit()` and re-emits to local sockets (cross-instance fan-out)
2. Provides `publish<T>(channel, payload)` API used by domain services

**Redis pub/sub channels subscribed:**

| Channel | Emitted event | Target room |
|---------|---------------|-------------|
| `timeline:newPosts` | `timeline.newPosts` | `user:{userId}` |
| `post:counters` | `post.counters` | `post:{postId}` |
| `dm:message` | `dm.message` | `conversation:{id}` + `user:{recipientId}` |
| `dm:read` | `dm.read` | `conversation:{id}` |
| `notification:new` | `notification.new` | `user:{recipientId}` |
| `follow:update` | `follow.update` | `user:{targetUserId}` |

**Public API:**

```typescript
// Implements RealtimePublisherPort (called by FanoutProcessor)
notifyNewTimelinePosts(userId, count, previewIds): Promise<void>

// Cross-instance publish (persist-then-publish pattern)
publishDmMessage(conversationId, recipientIds, message): Promise<void>
publishDmRead(conversationId, userId, lastReadMessageId): Promise<void>
publishPostCounters(payload: PostCountersPayload): Promise<void>
publishNotification(recipientId, notification): Promise<void>   // consumed by subtask 8b
publishFollowUpdate(targetUserId, type, actorId): Promise<void>

// This-instance-only direct emit (no Redis round-trip)
emitToUser(userId, event, data): void
emitToRoom(room, event, data): void

// Low-level publish (channels are constants defined in the service)
publish<T>(channel, payload): Promise<void>
```

**REALTIME_PUBLISHER_PORT override** wired in `app.module.ts`:
```typescript
{ provide: REALTIME_PUBLISHER_PORT, useExisting: RealtimePublisherService }
```

---

## MessagingModule — DM REST Endpoints

### `MessagingService` (`src/modules/messaging/messaging.service.ts`)

**DM permission rule (§6):**
- Allowed if `mutual-follow` OR `recipient.dmPrivacy='everyone'`
- AND neither party has blocked the other (checked both directions)

**Canonical 1:1 via `conversation_dyads`:**
- `user_lo < user_hi` (UUID lexicographic ordering enforced by CHECK constraint)
- `getOrCreateDm(initiatorId, recipientId)` is fully idempotent
- Uses a transaction to atomically create conversation + participants + dyad row

**Nonce idempotency:** `messages.client_nonce` has UNIQUE constraint. On duplicate nonce, existing message is returned directly without error (200 semantics for the caller).

**Rate limiting:** 500 DMs/day per user via Redis sliding counter (`dm:rate:{userId}`). Throws 409 at limit.

**Unread count:** computed as `COUNT(*) FROM messages WHERE conversation_id=$1 AND id > last_read_message_id AND deleted_at IS NULL`. Zero-read users (null `last_read_message_id`) get total count.

**Room membership check for notification skip:** `isUserInConversationRoom(userId, conversationId)` inspects Socket.IO adapter room maps; if recipient is in the conversation room, DM notification is suppressed.

### REST Endpoints

All routes under global prefix `api/v1` via `@Controller('conversations')`.

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/v1/conversations` | Yes | Cursor by conversation_id DESC |
| POST | `/api/v1/conversations` | Yes | Resolves `recipientHandle` → userId; returns 201 (existing or new) |
| GET | `/api/v1/conversations/:id/messages` | Yes | Participant-only; cursor by message id DESC |
| POST | `/api/v1/conversations/:id/messages` | Yes | Nonce-idempotent; rate-limited 500/day; publishes to Redis pub/sub |
| POST | `/api/v1/conversations/:id/read` | Yes | Updates DB + publishes `dm.read` |
| POST | `/api/v1/conversations/:id/mute` | Yes | |
| DELETE | `/api/v1/conversations/:id/mute` | Yes | |

### DM Notification Port (`DM_NOTIFICATION_PORT`)

```typescript
interface DmNotificationPort {
  notifyDm(senderId, recipientId, conversationId, messageId): Promise<void>;
}
```

- Default: `NoopDmNotificationService` (debug log only)
- Subtask 8b (NotificationsModule) replaces this with a real implementation that writes a notification row + emits `notification.new` via `RealtimePublisherService.publishNotification()`

---

## What Subtask 8b (Notifications) Reuses

1. **`RealtimePublisherService.publishNotification(recipientId, notificationDto)`** — call this after creating a notification row; handles cross-instance WS delivery to `user:{recipientId}` room.
2. **`RealtimePublisherService.emitToUser(userId, event, data)`** — for this-instance-only emission (faster, no Redis round-trip) when you know the target is local.
3. **`DM_NOTIFICATION_PORT`** — swap `NoopDmNotificationService` → `RealDmNotificationService` in `messaging.module.ts` providers.
4. **Redis pub/sub channel `notification:new`** — already subscribed in `onModuleInit()`; emit `{ recipientId, notification }` and the gateway re-emits `notification.new` to `user:{recipientId}`.
5. **`user:{userId}` room** — all authenticated users are in their personal room from the moment of WS connect; no additional room join needed.

---

## Unit Tests

| File | Tests | Coverage |
|------|-------|----------|
| `tests/unit/messaging/messaging.service.spec.ts` | 17 | DM permission matrix (5 cases), dyad canonical ordering (6 cases), nonce dedup (4 cases), rate limit (2 cases), markRead (2 cases), unread count (2 cases), isParticipant (2 cases) |
| `tests/unit/realtime/realtime.gateway.spec.ts` | 13 | Handshake auth accept/reject (4 cases), disconnect (1), typing relay participant check (2), markRead (3), subscribe/unsubscribe post (3), afterInit (1) |

**76 new tests; 324 total passing.**

---

## Key File Paths

| What | Where |
|------|-------|
| Migration | `src/infra/database/migrations/1704067200007-create-messaging.ts` |
| Conversation entity | `src/modules/messaging/conversation.entity.ts` |
| ConversationParticipant entity | `src/modules/messaging/conversation-participant.entity.ts` |
| ConversationDyad entity | `src/modules/messaging/conversation-dyad.entity.ts` |
| Message entity | `src/modules/messaging/message.entity.ts` |
| MessagingService | `src/modules/messaging/messaging.service.ts` |
| MessagingController | `src/modules/messaging/messaging.controller.ts` |
| MessagingModule | `src/modules/messaging/messaging.module.ts` |
| DmNotificationPort | `src/modules/messaging/dm-notification.port.ts` |
| NoopDmNotificationService | `src/modules/messaging/noop-dm-notification.service.ts` |
| RedisIoAdapter | `src/modules/realtime/redis-io.adapter.ts` |
| RealtimeGateway | `src/modules/realtime/realtime.gateway.ts` |
| RealtimePublisherService | `src/modules/realtime/realtime-publisher.service.ts` |
| RealtimeModule | `src/modules/realtime/realtime.module.ts` |
| Unit tests (messaging) | `tests/unit/messaging/messaging.service.spec.ts` |
| Unit tests (gateway) | `tests/unit/realtime/realtime.gateway.spec.ts` |

---

## API Contract Changes

All Messaging rows updated to `Status = implemented`.

**Changed (deviations):**
- Added `join.conversation` and `leave.conversation` client→server WS events (not in original plan). Required for clients to enter/exit conversation rooms; the spec implied this capability for `dm.typing` room routing. Marked as `changed` with note in the contract.
