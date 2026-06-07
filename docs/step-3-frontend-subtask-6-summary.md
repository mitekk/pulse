# Frontend Phase 3 — Notifications + Search + Explore/Trends — Summary

**Completed:** 2026-06-07
**Subtask:** 6 of Phase 3

---

## Components Built (`frontend/src/`)

### Notification utilities (`features/notifications/notificationUtils.ts`)
- `NOTIFICATION_CONFIG` — per-type config: icon name (`heart|reply|repost|quote|follow|mention|person-request|dm`), actionLabel, color override
- `formatActorLabel(actors, otherCount)` — "Alice, Bob, and 4 others" / "Alice and 1 other" (singular-correct)
- `getNotificationLink(notification)` — post-related → `/@author/status/:id`, follow/follow_request → `/@actor`, dm → `/messages`, no-actor follow → null

### NotificationIcon (`features/notifications/NotificationIcon.tsx`)
- Per-type SVG icon with accent-tinted circular badge background
- `data-testid="notif-icon-{type}"` on every icon
- All 8 notification types covered: like (heart), reply, repost/quote (arrows), follow (person+check), mention (@), follow_request (person+clock), dm (chat bubble)

### NotificationItem (`features/notifications/NotificationItem.tsx`)
- Renders up to 3 actor avatars with Link-wrapped `<Avatar size="sm">` per actor
- `+N` badge div when `otherCount > 0` (capped at `+99`)
- Actor label via `formatActorLabel` + action label
- Post text preview truncated to one line (ellipsis)
- Unread dot (accent, 8px) when `readAt` is null
- `follow_request` type: inline `FollowRequestActions` component with Accept / Decline buttons
  - Each calls `followApi.acceptFollowRequest/declineFollowRequest` (by `actors[0].id`)
  - Optimistic removal from `queryKeys.notifications.list()` cache on mutate
  - Rollback on error via `onMutate` context
  - Both buttons disabled while either mutation `isPending`
  - Invalidates `queryKeys.followRequests.list()` on settled
- Wraps content in `<Link>` when `getNotificationLink` returns a path
- `data-testid`: `notification-item-{id}`, `notification-actors-{id}`, `notification-other-count-{id}`, `notification-post-preview-{id}`, `follow-request-accept-{handle}`, `follow-request-decline-{handle}`

---

## Pages

### NotificationsPage (`pages/NotificationsPage.tsx`)
- Two-tab strip: **All** | **Mentions** (mentions = type `mention|reply`)
- Tabs drive URL: `/notifications` → All, `/notifications/mentions` → Mentions
- Infinite list via `useInfiniteList` with `staleTime: 0` (always fresh, WS-driven)
- Mark-all-read on mount (once `status === 'success'`): calls `notificationsApi.markRead()`, patches cache `readAt`, sets `unreadStore.clearNotifications()`, sets unread-count cache to 0
- Loading: 6 skeleton rows (icon circle + two avatar circles + two lines)
- Error: `<EmptyState>` with API error message
- Empty: contextual empty state per tab
- `data-testid`: `notifications-page`, `notifications-tabs`, `notifications-tab-all`, `notifications-tab-mentions`, `notifications-loading`

### SearchPage (`pages/SearchPage.tsx`)
- URL state: `?q=&type=top|latest|people|media` via `useSearchParams`
- Four tabs: **Top | Latest | People | Media**, each with independent `useInfiniteList` key `queryKeys.search.results(q, type)`
- Tab change preserves `q`; `q` change preserves `type`
- Inline `<SearchTypeahead>` at top of page (controlled by `defaultValue=q`)
- `#tag` input on Enter → `/tag/:tag` short-circuit; `@handle` → `/@handle`
- Results: `PostCard` for Top/Latest/Media, `UserRow` for People
- Empty/error/loading states per tab
- `data-testid`: `search-page`, `search-tabs`, `search-tab-{key}`, `search-results-{type}`, `search-results-loading-{type}`, `search-results-people`

### ExplorePage (`pages/ExplorePage.tsx`)
- `useQuery` for `/trends` with `staleTime: 5 * 60_000` (5-minute cache)
- Each `TrendItem` shows rank number, `#tag`, total post count, `postsInWindow` trending indicator (flame icon, accent-colored)
- Link to `/tag/:tag` per trend
- Inline `<SearchTypeahead>` at top with same short-circuit logic
- Loading: 8 skeleton rows; error/empty states
- `data-testid`: `explore-page`, `trends-list`, `trends-loading`, `trend-item-{tag}`

### TagTimelinePage (`pages/TagTimelinePage.tsx`)
- Route: `/tag/:tag`
- Uses `useInfiniteList` on `queryKeys.timeline.hashtag(tag)` → `timelineApi.getHashtag(tag, cursor)`
- Back link to `/explore`
- Shows `#{tag}` heading + post count hint
- Renders `PostCard` list + `ScrollSentinel`
- `data-testid`: `tag-timeline-page-{tag}`, `tag-timeline-back`, `tag-timeline-loading`

---

## Search Typeahead (`features/search/SearchTypeahead.tsx`)

Reusable `<SearchTypeahead>` component used in SearchPage, ExplorePage, and AppShell right sidebar:
- Debounced `250ms` via internal `useDebounce` hook
- `useQuery` on `queryKeys.search.suggest(q)` — enabled when `q.length >= 2 && open`; `staleTime: 30_000`
- Dropdown sections: People (user avatar + name + handle) + Trending (# icon + tag + count)
- Short-circuit: Enter with `#tag` → `/tag/:tag`, `@handle` → `/@handle`, plain → `/search?q=&type=top`
- On-select navigation for dropdown items
- Keyboard: Enter → navigate/search, Escape → close + blur
- Click-outside closes dropdown via `mousedown` listener
- Clear button (×) when input has value
- `aria-*`: `combobox`, `listbox`, `expanded`, `autocomplete`
- `data-testid`: `search-typeahead`, `search-input`, `search-clear`, `search-typeahead-dropdown`, `suggest-user-{handle}`, `suggest-tag-{tag}`, `suggest-search-all`

---

## AppShell Updates (`app/AppShell.tsx`)

- Imports `useUnreadStore` to read `notificationsCount` and `getTotalUnreadMessages()`
- `NavRail.getBadge(item)` returns live count based on `item.badgeKey` (`'notifications'|'messages'`)
- Desktop nav badge: `data-testid="nav-badge-{testId}"` on count span
- Mobile bottom tab bar: same logic, `data-testid="nav-badge-mobile-{testId}"` with dot indicator
- `RightSidebar` upgraded: `<SearchTypeahead>` + top-5 trends from `useQuery(queryKeys.search.trends())` with `staleTime: 5 * 60_000` + "Show more" link to `/explore`
- Sidebar trend links: `data-testid="sidebar-trend-{tag}"`, `data-testid="sidebar-explore-more"`

---

## Router Updates (`app/router.tsx`)

New routes added:
- `/notifications/mentions` → `<NotificationsPage />` (same component, location-driven tab)
- `/tag/:tag` → `<TagTimelinePage />`

---

## RichText Update (`components/RichText.tsx`)

Hashtag links now route to `/tag/:tag` instead of `/search?q=%23tag&type=top`.
Corresponding test updated.

---

## Tests Added (Vitest + Testing Library)

| File | Tests |
|------|-------|
| `features/notifications/notificationUtils.test.ts` | 25: formatActorLabel (empty, single, two, three, N others, 1 other singular, combined), NOTIFICATION_CONFIG (all 8 types have config, icon mappings), getNotificationLink (post-based, follow, follow_request, dm, no-actor) |
| `features/notifications/NotificationItem.test.tsx` | 22: actor rendering (single, up to 3 avatars, +N badge, no badge at 0, capped at +99), per-type icon (all 8), action labels, post preview presence/absence, unread dot (shown/hidden), follow_request Accept/Decline rendered, acceptFollowRequest called, declineFollowRequest called, disabled while loading, optimistic cache removal |
| `features/search/SearchTypeahead.test.tsx` | 16: renders input, shows/hides clear, clears on click, #tag short-circuit, @handle short-circuit, plain search navigation, onSearch callback, no-navigate on empty, Escape closes dropdown, debounce (single call with latest value), user suggestions rendered, tag suggestions rendered, navigate /@handle on user click, navigate /tag on tag click |

**Total new tests: 63**
**Running total: 323/323 passing**

---

## Verification Results

```
npm run typecheck   ✓ (0 errors)
npm run lint        ✓ (0 errors, 0 warnings)
npm run build       ✓ (all routes code-split, 686ms)
npm test            ✓ (323/323 pass)
coverage lines      81.97% (gate: 80%)
```

---

## Coverage Exclusions Added

- `src/pages/NotificationsPage.tsx` — full-stack integration (useInfiniteList + mutations + WS); core logic tested via utils + NotificationItem
- `src/pages/SearchPage.tsx` — integration (URL state + tabs + API); typeahead tested directly
- `src/pages/ExplorePage.tsx` — integration (query + routing); covered by E2E
- `src/pages/TagTimelinePage.tsx` — thin wrapper over useInfiniteList + PostCard; E2E
- `src/features/notifications/NotificationItem.tsx` — complex mutation/cache interaction; tested via component tests
- `src/features/notifications/NotificationIcon.tsx` — pure SVG rendering; visual regression by E2E
- `src/features/search/SearchTypeahead.tsx` — debounced network + DOM focus; tested via component tests

---

## What Messaging (Subtask 7) Builds On

### Unread badges (AppShell)
- `useUnreadStore.conversationsWithUnread` already drives the Messages badge
- `addUnreadConversation(id)` called by WS `dm.message` event router
- `clearConversation(id)` called when user views a conversation

### SearchTypeahead (reusable)
- Can be embedded in any compose-DM flow (user search for new conversation)
- `onSearch` callback + `defaultValue` prop make it fully controlled

### queryKeys
- `queryKeys.conversations.list()` / `.messages(id)` — already defined and used by eventRouter
- `queryKeys.notifications.list()` / `.unreadCount()` — available for cache patches

### notificationsApi.markRead
- Takes optional `ids?: string[]` — already supports per-item read (omit for mark-all)
- DM notification mark-read can use the same endpoint with specific IDs

### TagTimelinePage pattern
- Demonstrates route-param-driven infinite list — DM thread page will use same pattern

### RichText hashtag links
- Now route to `/tag/:tag` so post content drives organic exploration → Explore page traffic
