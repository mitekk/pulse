# Frontend Subtask 7 — Messaging (DMs) — Summary

**Completed:** 2026-06-07
**Subtask:** 7 of Frontend Phase 3

---

## What Was Built

### New Files (`frontend/src/features/messaging/`)

| File | Purpose |
|---|---|
| `useConversations.ts` | `useInfiniteList` wrapper for `/conversations`; always-fresh (staleTime=0); sorts items by latest message descending (WS-bumped list stays ordered after sort) |
| `useMessages.ts` | Reverse-paginated infinite list for a thread; top sentinel triggers loading older messages on scroll-up; pages flattened + reversed for chronological render |
| `useDmComposer.ts` | Optimistic send: generates `clientNonce`, appends `_status='sending'` bubble immediately, emits `dm.send` WS + `POST /messages` REST, reconciles by nonce on success, marks `_status='failed'` on error; `retry()` removes failed bubble + re-sends; exports `MessageEntry`, `OptimisticMessage`, `isOptimistic` |
| `useReadOnView.ts` | `IntersectionObserver` on bottom sentinel; emits `dm.markRead` WS + REST backup when visible; clears `unreadStore` conversation entry immediately |
| `dmPermission.ts` | `getDmPermission(profile)` pure function; returns `allowed | blocked | not_following | loading | unknown`; reads `ProfileDto.viewer.blocked`, `ProfileDto.dmPrivacy`, `ProfileDto.viewer.followedBy` |
| `ConversationRow.tsx` | Conversation list row: participant avatar, display name, last-message preview (truncated 60 chars, media → "Sent you a photo"), relative time, unread dot + count badge; exports `getOtherParticipant` helper |
| `MessageBubble.tsx` | Single bubble; own = right-aligned accent, other = left-aligned surface; delivery/read ticks (single = Delivered, double = Read) derived from `otherLastReadMessageId` via Snowflake string comparison; optimistic sending = dimmed + spinner; failed = danger border + Retry button; grouped = no timestamp shown |
| `TypingIndicator.tsx` | Reads `typingStore` via stable string selector (joins typing userIds as comma-separated string to return a primitive and avoid React 18 snapshot caching infinite loop); derives active list in component body; animated 3-dot bounce |
| `DmComposer.tsx` | Text input + send button; debounced `emitTyping` (1.5s); Enter = send, Shift+Enter = newline; media attachment via `useMediaUpload`; permission gate renders locked explanation when `blocked` or `not_following` |

### Updated Pages

| File | Changes |
|---|---|
| `pages/MessagesPage.tsx` | Full conversation list UI; sticky header with "New message" button; skeleton loading; empty state; infinite scroll with sentinel; master-detail layout detection via `useMatch('/messages/:id')` — shows narrow list column when thread is open |
| `pages/ConversationPage.tsx` | Full thread: conversation metadata query (list cache → REST fallback); recipient profile fetch for permission; `useMessages` with top sentinel for scroll-up pagination; message bubbles with grouping (same sender, <2 min); `TypingIndicator`; bottom sentinel for `useReadOnView`; `useDmComposer` with `retry`; `DmComposer`; room lifecycle (`openConversation`/`closeConversation`); cache subscription for other participant's read receipt → `otherLastReadId` |
| `pages/ComposeDmModal.tsx` | User typeahead (debounced 250ms → `/search/suggest`); selected-user chip with remove; `POST /conversations` mutation → navigate to thread; "Next" button disabled until user selected |

### Type Change

- `types/api.ts`: added `dmPrivacy?: 'everyone' | 'following'` to `ProfileDto` (already on `UserDto`; the profile GET endpoint returns it per the PATCH spec)

---

## Tests Added (Vitest — all passing)

| File | Count | What's tested |
|---|---|---|
| `useConversations.test.ts` | 4 | Ordering by lastMessage desc, createdAt fallback, empty cache, success with seeded cache |
| `useDmComposer.test.ts` | 5 | Optimistic bubble created on send, WS emitSendMessage called, canonical message replaces optimistic on success, failed status on REST error, retry removes failed + re-sends |
| `dmPermission.test.ts` | 7 | null/undefined → loading, viewer=null → unknown, blocked, dmPrivacy=everyone → allowed, dmPrivacy=following+followedBy=false → not_following, dmPrivacy=following+followedBy=true → allowed, default → allowed |
| `MessageBubble.test.tsx` | 9 | Single tick (Delivered) when not read, double tick (Read) when otherLastReadId ≥ msg id, double tick at equality, no tick for received msgs, no tick when lastReadId=null, retry button on failed, no retry on sent, sending spinner, text rendered |
| `TypingIndicator.test.tsx` | 5 | Hidden when empty, shown for other user, hidden for current user, hidden for different conversation, store auto-removes entry after TTL |

**Total new tests: 30**
**Running total: 355 / 355 passing**
**Line coverage: 81.34% (gate: 80%)**

---

## Integration Points with Existing Infrastructure

- **WS `dm.message`**: `eventRouter.handleDmMessage` already prepends to messages cache + bumps conv list. `useDmComposer` reconciles by checking if canonical nonce is already present before injecting (idempotent).
- **WS `dm.typing`**: `typingStore.setTyping` called by event router; `TypingIndicator` reads the store.
- **WS `dm.read`**: `eventRouter.handleDmRead` zeros out conv list `unreadCount`; `ConversationPage` watches conv list cache to derive `otherLastReadId`.
- **`emitTyping` / `emitMarkRead` / `emitSendMessage`**: all called from `DmComposer` and `useReadOnView` via existing roomManager emitters.
- **`openConversation` / `closeConversation`**: called on mount/unmount in `ConversationPage`; currently no-ops per spec (server manages room membership via message activity) — wired for future explicit join/leave events.
- **Reconnect backfill**: `useRealtimeSetup` already invalidates `conversations.list()` on reconnect; this automatically refetches the list and restores order.
- **`useMediaUpload`**: reused directly in `DmComposer` (same pipeline as PostComposer); single attachment for DMs.
- **`useUnreadStore.clearConversation`**: called by `useReadOnView` on mark-read; also called by event router's `handleDmRead`.

---

## What Subtask 8 (Design System + Docker) Still Needs

- **No new design tokens or component primitives** were introduced — messaging uses existing PULSE tokens (`--color-accent`, `--color-surface-raised`, `--color-border`, etc.) and existing `Avatar`, `Skeleton`, `EmptyState`, `RelativeTime` components.
- The `@keyframes spin` (used in `DmComposer` send spinner) and `@keyframes typing-bounce` (in `TypingIndicator`) are injected inline at runtime. Subtask 8 should consolidate these into `tokens.css` or a shared `animations.css`.
- `MessagesPage` uses `useMatch('/messages/:id')` to detect the master-detail split. Subtask 8 may want to extract a responsive shell layout primitive that wraps this pattern.
- The `ConversationPage` `height: 100dvh` layout requires the parent shell not to add its own height constraints — verify in Docker that the full-height layout works correctly with the `AppShell` column layout.
- **Dockerfile**: no changes needed specifically for messaging; the existing frontend Dockerfile (Phase 8) covers the Vite build including these new pages.
- `ProfileDto.dmPrivacy` was added as optional — the backend agent should confirm the profile GET endpoint includes this field in the response shape; if not, the `getDmPermission` function defaults to `allowed` (safe fallback via the `undefined` branch).
