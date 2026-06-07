# Frontend Phase 2 — API Client + Real-time + Cache Infrastructure — Summary

**Completed:** 2026-06-07
**Subtask:** 2 of Phase 3 (Frontend Phase 2)

---

## What Was Built

### 1. Typed REST Client Modules (`frontend/src/lib/api/`)

One file per backend domain, each exporting typed functions aligned to `docs/api-contract.md`:

| File | Endpoints covered |
|---|---|
| `auth.ts` | Exists from Phase 1 (unchanged) |
| `users.ts` | getProfile, updateMe, getPosts, getReplies, getMedia, getLikes, getFollowers, getFollowing |
| `follow.ts` | follow, unfollow, block, unblock, mute, unmute, getFollowRequests, accept/declineFollowRequest |
| `posts.ts` | create, getById, deleteById, getThread, getReplies, getReposts, getQuotes, getLikes |
| `engagement.ts` | like, unlike, repost, unrepost, bookmark, unbookmark, getBookmarks |
| `timeline.ts` | getHome, getHashtag |
| `media.ts` | getUploadUrl, finalize, getById, updateAltText, uploadDirect (presigned PUT bypass) |
| `messaging.ts` | getConversations, createConversation, getMessages, sendMessage, markRead, mute, unmute |
| `notifications.ts` | getNotifications, getUnreadCount, markRead |
| `search.ts` | search (all 4 types), suggest, getTrends |

All functions use the existing `apiClient` wrapper (Bearer header, 401 interceptor, refresh queue). All list endpoints return `CursorPage<T>` with cursor params threaded.

### 2. Types (`types/api.ts`)

Already complete from Phase 1. All DTOs match the contract exactly:
- `PostDto` — entities, media, counts, viewer, quoteOf, repostOf, repostedBy, replyPolicy, deleted
- `ProfileDto`, `UserDto`, `UserCardDto`, `NotificationDto` (aggregated: actors, otherCount)
- `MessageDto`, `ConversationDto`, `MediaDto`, `CursorPage<T>`, `FollowRequestDto`
- String IDs throughout (Snowflake and UUID both as `string`)

### 3. Query Keys Factory (`lib/cache/queryKeys.ts`)

Stable `as const` tuple arrays per spec §C6.1 for all domains:
- `queryKeys.auth.{me, sessions}()`
- `queryKeys.users.{profile, posts, replies, media, likes, followers, following}(handle)`
- `queryKeys.posts.{detail, thread, replies, reposts, quotes, likes}(id)`
- `queryKeys.timeline.{home, hashtag, bookmarks}()`
- `queryKeys.conversations.{list, detail, messages}(id)`
- `queryKeys.notifications.{list, unreadCount}()`
- `queryKeys.search.{results, suggest, trends}()`
- `queryKeys.media.{detail}(id)`
- `queryKeys.followRequests.{list}()`

### 4. `useInfiniteList` Hook (`hooks/useInfiniteList.ts`)

Wraps `useInfiniteQuery` (TanStack Query v5):
- `initialPageParam: null` → server gets `cursor=null` on first fetch
- `getNextPageParam: (lastPage) => lastPage.cursor ?? undefined` — stops when cursor is null
- `IntersectionObserver` sentinel callback ref with 200px rootMargin for auto-load
- Flattened `items` array selector across all pages
- Required `staleTime` prop (no default) — callers must be explicit
- Returns: `{ items, sentinelRef, status, error, isFetchingNextPage, isFetching, hasNextPage, fetchNextPage, refetch }`

### 5. Cache Helpers (`lib/cache/patchPost.ts`)

- `patchPostInCaches(queryClient, postId, updater)` — scans ALL query cache entries, patches `PostDto` wherever it appears: post detail `{ post }`, thread `{ ancestors, post, replies }`, and any infinite list `{ pages: [{ items }] }`. Returns `PostSnapshot[]` for rollback.
- `restorePostSnapshots(queryClient, snapshots)` — rolls back all patched entries on mutation error
- `snapshot<T>(qc, key)` — utility for single-query optimistic snapshot/rollback

### 6. Real-time Architecture (`lib/realtime/`)

**`socket.ts`** — Socket.IO client singleton:
- `io()` with `autoConnect: false`, `withCredentials: true`
- `connectSocket(accessToken)` — sets `socket.auth = { token }` then connects; on token rotation, disconnects + reconnects to refresh handshake
- `disconnectSocket()` — called on logout
- Fully typed `ServerToClientEvents` and `ClientToServerEvents` interfaces

**`roomManager.ts`** — Client→server emitters:
- `subscribePost(postId)` / `unsubscribePost(postId)` — thread view subscribe/unsubscribe
- `openConversation` / `closeConversation` — stubs (server handles membership via message activity)
- `emitTyping`, `emitMarkRead`, `emitSendMessage` — DM emitters

**`eventRouter.ts`** — Maps every server→client event to cache mutations or store updates (NO refetch):

| Event | Cache/Store effect |
|---|---|
| `post.counters` | `patchPostInCaches` — update likes/replies/reposts everywhere the post appears |
| `timeline.newPosts` | `timelineBufferStore.add` — buffer count, show pill; no auto-inject |
| `notification.new` | Prepend to notifications infinite list; increment unread count cache + unreadStore |
| `dm.message` | Prepend to messages cache; update conv list (lastMessage, unreadCount); addUnreadConversation |
| `dm.typing` | `typingStore.setTyping` — auto-expires in 4s |
| `dm.read` | Zero out unreadCount in conv list; clearConversation in unreadStore |
| `follow.update` | Shallow-invalidate profile queries (`refetchType: 'none'`); invalidate follow-requests on `requested` |

Returns a cleanup function that removes all listeners (used on unmount).

**`useRealtimeSetup.ts`** — Hook wired into `AppShell`:
- Connects socket when `isAuthenticated` and `accessToken` are set
- Re-connects on token rotation (detected via `lastTokenRef`)
- On `connect` event (reconnect): refetches unread count + invalidates conversations list (backfill)
- Disconnects on logout
- Registers event router once; cleans up on app teardown

### 7. Zustand UI Stores (`lib/stores/`)

**`typingStore.ts`** — `typingUsers: Record<"convId:userId", expiryTimestamp>`:
- `setTyping(convId, userId)` — sets entry with 4s TTL, schedules auto-delete
- Selectors: `selectIsTyping`, `selectTypingUsers` for UI rendering

**`timelineBufferStore.ts`** — `{ newCount, previewIds }`:
- `add(count, previewIds)` — accumulates without auto-inject
- `flush()` — resets after user taps "N new posts" pill + timeline refetch

**`unreadStore.ts`** — `{ notificationsCount, conversationsWithUnread: Set<string> }`:
- `setNotificationsCount`, `incrementNotifications`, `clearNotifications`
- `addUnreadConversation`, `clearConversation`, `getTotalUnreadMessages`

### 8. Token Refresh → Socket Re-auth Seam

`useRealtimeSetup` subscribes to `selectAccessToken` from the auth store. When the 401 interceptor in `client.ts` rotates the token (via `setAccessToken`), Zustand notifies the hook, which triggers `connectSocket(newToken)` — disconnect + reconnect with the new handshake auth.

### 9. Tests (Vitest — all passing)

**`hooks/useInfiniteList.test.tsx`** (5 tests):
- Flattened items from single page
- `hasNextPage=true` when cursor is non-null
- Multi-page flattening via `fetchNextPage`
- `initialPageParam` is null on first fetch
- Pending → success status transition

**`lib/cache/patchPost.test.ts`** (6 tests):
- Patches post detail cache
- Patches post inside infinite page list
- Patches across multiple caches simultaneously
- Does not patch posts with different id
- Snapshots enable rollback
- Returns empty snapshots when post not in cache

**`lib/realtime/eventRouter.test.ts`** (12 tests):
- `post.counters` patches detail cache and infinite timeline
- `timeline.newPosts` increments buffer, accumulates across events
- `notification.new` prepends to list, increments cache + store
- `dm.message` prepends to messages, updates conv list
- `dm.typing` sets typingStore
- `dm.read` zeros out unread
- Cleanup removes all listeners

**Total: 32 tests, all passing**

---

## Verification Results

```
npm run typecheck  ✓ (0 errors)
npm run lint       ✓ (0 errors, 0 warnings)
npm run build      ✓ (231 modules, 330ms)
npm test           ✓ (32/32 pass)
```

---

## What Phases 3–6 Build On

**Phase 3 (Timeline + PostCard + Composer):**
- Import `useInfiniteList` with `queryKeys.timeline.home()` + `timelineApi.getHome`
- Import `patchPostInCaches` + `restorePostSnapshots` for like/repost/bookmark optimistic mutations
- Import `useTimelineBufferStore` for "N new posts" pill
- Import `engagementApi` for ActionBar mutations
- Import `postsApi.create` for PostComposer
- Socket is already connected; `post.counters` updates arrive automatically

**Phase 4 (Profile + Follow):**
- Import `usersApi.getProfile` / `useInfiniteList` with profile tab query keys
- Import `followApi.follow/unfollow` for FollowButton mutations
- Cache invalidation for `follow.update` already wired in event router

**Phase 5 (Notifications + Search):**
- Import `useInfiniteList` with `queryKeys.notifications.list()` + `notificationsApi`
- Import `useUnreadStore` for badge rendering in NavRail
- Notifications arrive pre-prepended via WS — list is already live

**Phase 6 (Messaging):**
- Import `useInfiniteList` with conversation + messages query keys
- Import `messagingApi` for REST operations
- Import `useTypingStore` + `selectTypingUsers` for typing indicator
- Import `emitTyping`, `emitMarkRead`, `emitSendMessage` from roomManager
- `subscribePost`/`unsubscribePost` from roomManager for thread counter rooms
- DM messages arrive pre-prepended; unread badges update automatically
