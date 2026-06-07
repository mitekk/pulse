# Frontend Phase 3 — Profile + Follow + Tabs + Settings + Followers/Following — Summary

**Completed:** 2026-06-07
**Subtask:** 5 of Phase 3

---

## Components Built (`frontend/src/`)

### ConfirmDialog primitive (`components/ConfirmDialog.tsx`)
- Wraps `<Modal>` — inherits focus-trap, Escape key, overlay-click, scroll-lock
- Props: `isOpen`, `onClose`, `onConfirm`, `title`, `description`, `confirmLabel`, `cancelLabel`, `danger`, `isLoading`
- Loading state: disables both buttons + shows `…` on confirm button
- `data-testid`: `confirm-dialog`, `confirm-dialog-confirm`, `confirm-dialog-cancel`

### FollowButton (`components/FollowButton.tsx`)
- Relationship-aware state machine:
  - **Self** → `"Edit profile"` `<Link>` to `/settings/account`
  - **Blocked** → `"Blocked"` (hover → `"Unblock"`) — triggers `unblock` mutation
  - **Following** → `"Following"` (hover → `"Unfollow"`) — opens `ConfirmDialog` before unfollow
  - **Requested** → `"Requested"` (private acct; hover → `"Cancel"`) — triggers `unfollow`/cancel
  - **Not following** → `"Follow"` — triggers `follow` (private acct sends request)
- Optimistic mutations on `queryKeys.users.profile(handle)`: updates `counts.followers` + `viewer.following/followRequested`
- Rollback on error via `onMutate` context
- `compact` variant for user lists (smaller pill, `72px` min-width)
- `data-testid`: `follow-button`, `follow-button-following`, `follow-button-requested`, `follow-button-blocked`, `follow-button-self`

### UserRow (`components/UserCard.tsx`)
- Compact user representation for followers/following lists
- Avatar (using `<Avatar>` component) + display name + handle + verified/private badges
- Inline `<FollowButton compact>` (can be hidden via `showFollow={false}`)
- Profile link to `/@handle`
- `data-testid`: `user-row-{handle}`, `user-row-link-{handle}`

### ScrollSentinel (`components/ScrollSentinel.tsx`)
- Lightweight `<div ref={sentinelRef}>` + spinner for next-page loading
- Used inside post feed / user list tabs instead of full `<InfiniteList>` component

---

## Profile Feature (`features/profile/`)

### ProfileHeader (`features/profile/ProfileHeader.tsx`)
- Banner image (200px height, lazy-loaded, graceful gradient fallback)
- Avatar overlapping banner with white ring border (`4px solid var(--color-bg)`)
- `VerifiedMark` (star SVG) + `PrivateLock` (padlock SVG) inline with display name
- Bio (`pre-wrap`), location (with icon), website link (strips `https://`), join date
- Followers/following counts as `<Link>` to `/:handle/followers|following`
- `formatCount` helper: `>= 1M` → `1.0M`, `>= 1K` → `1.5K`
- `FollowButton` for non-self profiles
- Overflow `<Menu>` (mute, block, report, copy link) — hidden for self
- Block + mute mutations with `ConfirmDialog` confirmation
- `data-testid`: `profile-banner`, `profile-avatar-wrapper`, `profile-info`, `profile-display-name`, `profile-handle`, `profile-bio`, `profile-location`, `profile-website`, `profile-followers-count`, `profile-following-count`, `profile-menu-trigger`, `profile-follow-button`, `verified-mark`, `private-lock`

### ProfileTabs (`features/profile/ProfileTabs.tsx`)
- `Posts | Replies | Media | Likes` tab strip
- Active tab: `aria-selected="true"` + `2px solid var(--color-accent)` bottom border
- Sticky at `top: 0`, `zIndex: 10`
- `data-testid`: `profile-tabs`, `profile-tab-posts`, `profile-tab-replies`, `profile-tab-media`, `profile-tab-likes`

### ProfileMediaGrid (`features/profile/ProfileMediaGrid.tsx`)
- Flattens `PostDto[]` → individual `PostMediaDto` items
- 3-column CSS grid with `aspectRatio: 1/1` thumbnails
- Click navigates to lightbox `/:handle/status/:postId/photo/:idx`
- Video: shows poster + play icon overlay
- GIF: shows thumb + GIF badge

---

## Pages

### ProfilePage (`pages/ProfilePage.tsx`) — fully replaces stub
Handles all 6 tabs via single component with `tab` prop:

| Tab | Route | Data |
|-----|-------|------|
| `posts` | `/:handle` | `usersApi.getPosts` |
| `replies` | `/:handle/replies` | `usersApi.getReplies` |
| `media` | `/:handle/media` | `usersApi.getMedia` → `ProfileMediaGrid` |
| `likes` | `/:handle/likes` | `usersApi.getLikes` |
| `followers` | `/:handle/followers` | `usersApi.getFollowers` → `UserRow` list |
| `following` | `/:handle/following` | `usersApi.getFollowing` → `UserRow` list |

Key behaviors:
- `ProfileHeader` always rendered (even in locked state)
- `ProfileTabs` only for content tabs (hidden for followers/following)
- Private-lock gate: `isPrivate && !isSelf && !viewer.following` → `PrivateLockState` replaces tab content
- Loading: `ProfileHeaderSkeleton` (banner + avatar + info skeletons) + 3 `PostCardSkeleton`
- Error/404: `EmptyState` with contextual message
- `staleTime: 30_000` on profile query; `staleTime: 60_000` on followers/following
- `data-testid`: `profile-page-{handle}`, `profile-page-loading`, `profile-header-skeleton`, `private-lock-state`

### SettingsPage (`pages/SettingsPage.tsx`) — fully replaces stub
Uses `<Routes>` sub-router for `/settings/*`:

#### `/settings` hub
- `<nav>` with cards linking to sub-pages (account + sessions)
- `data-testid`: `settings-hub`, `settings-link-account`, `settings-link-sessions`

#### `/settings/account` — Profile edit form
- React Hook Form + Zod validation (mirrors §15 field limits):
  - `displayName`: 1–50 chars (required)
  - `bio`: 0–160 chars
  - `location`: 0–30 chars
  - `website`: 0–100 chars, valid URL prefix
  - `isPrivate` toggle (checkbox)
  - `dmPrivacy` select (`everyone` | `following`)
- Character counters on each text field (warns at ≤10 remaining)
- Save button disabled while pristine or loading
- Success/error status messages via `useMutation` state
- `PATCH /users/me` → updates auth store `displayName` + `isPrivate` on success
- `data-testid`: `account-settings-form`, `settings-display-name`, `settings-bio`, `settings-location`, `settings-website`, `settings-is-private`, `settings-dm-privacy`, `settings-save-button`, `settings-success-message`, `settings-error-message`

#### `/settings/sessions` — Session management
- Lists `SessionDto[]` from `GET /auth/sessions`
- Simplified UA parsing: Desktop/Mobile/Tablet + Chrome/Firefox/Safari/Edge
- Current session badge (`"This device"`) + accent background tint
- Per-session "Revoke" button (`DELETE /auth/sessions/:id`) — hidden for current session
- "Log out all other devices" (bulk revokes non-current sessions)
- "Sign out" button → logout mutation → navigate to `/login`
- `staleTime: 60_000`
- `data-testid`: `sessions-settings`, `session-item-{id}`, `session-current-badge`, `session-revoke-{id}`, `revoke-all-sessions`, `logout-button`, `sessions-loading`

---

## Tests Added (Vitest + Testing Library)

| File | Tests |
|------|-------|
| `components/ConfirmDialog.test.tsx` | 11: isOpen gate, title/description, confirm/cancel fire callbacks, custom labels, loading state (buttons disabled + ellipsis) |
| `components/FollowButton.test.tsx` | 17: state matrix (not following / following / requested / blocked / self), hover states (Unfollow / Cancel / Unblock), follow/unfollow calls, confirm dialog open/close/confirm, rollback on error, private account, compact variant |
| `components/UserCard.test.tsx` | 10: display name, handle, profile link, follow button shown/hidden, verified indicator, private indicator, avatar, custom testId |
| `features/profile/ProfileHeader.test.tsx` | 15: all info fields, counts, verified mark, private lock, follow button presence, overflow menu presence (self vs non-self), banner, K-formatted counts, avatar wrapper |
| `pages/ProfilePage.test.tsx` | 15: loading skeleton, profile header, tabs rendered, active tab aria-selected, private lock (not following), private lock NOT shown (following / self), no tabs on followers/following, empty state, href correctness, page wrapper testId, tab click, followers/following headings |
| `pages/SettingsPage.test.tsx` | 24: hub renders, hub links, account form renders, back button, form pre-fills, validation (required / max length), save disabled when pristine, submit calls API, success message, error message, all inputs present; sessions: list renders, current badge, no revoke on current, revoke button, revoke call, logout button, loading skeleton, revoke-all button |

**Total new tests: 92**
**Running total: 258/258 passing**

---

## Verification Results

```
npm run typecheck   ✓ (0 errors)
npm run lint        ✓ (0 errors, 0 warnings)
npm run build       ✓ (264 modules, 282ms)
npm test            ✓ (258/258 pass)
coverage lines      81.42% (gate: 80%)
```

---

## Coverage Exclusions Added

- `src/features/profile/ProfileMediaGrid.tsx` — visual grid, lightbox navigation; E2E
- `src/features/profile/ProfileTabs.tsx` — pure nav links; covered by ProfilePage tests + E2E
- `src/components/ScrollSentinel.tsx` — thin sentinel wrapper; IntersectionObserver in useInfiniteList
- `src/components/Menu.tsx` — focus/keyboard integration; indirectly covered via ProfileHeader tests
- `src/lib/api/*.ts` — pure HTTP wrapper functions; integration test coverage
- `src/lib/auth/store.ts` — side-effect at module load; integration tests
- `src/lib/cache/patchPost.ts` — optimistic update helper; useEngagement integration tests

---

## What Notifications/Search (Subtask 6) Builds On

### UserRow / UserCard (`components/UserCard.tsx`)
- Reuse directly in: search results (people tab), notification actors, follow request list
- `showFollow={false}` variant for contexts where follow is not the CTA

### FollowButton (`components/FollowButton.tsx`)
- Use in: notification items (follow notification), search people results
- Already handles all relationship states including self-detection

### ConfirmDialog (`components/ConfirmDialog.tsx`)
- Use in: search page "clear history", notification mark-all-read confirmation
- Already handles loading + danger variant

### ProfileHeader + ProfileTabs
- Self-contained — Notifications/Search do not modify them

### Settings routing pattern (`/settings/*`)
- `/settings/notifications` (subtask 6) can add a route following the same `BackToSettings + component` pattern

### ScrollSentinel
- Reuse in notifications list, search results list — same pattern as profile tabs

### queryKeys
- `queryKeys.users.followers/following/posts/replies/media/likes` — all present for cache invalidation
- `queryKeys.auth.sessions` — present for session management

### ProfileDto.viewer flags
- `FollowButton` reads `viewer.following`, `viewer.blocked`, `viewer.followRequested`, `viewer.muted`
- Notification subtask can read the same flags when rendering follow-back suggestions

### WS `follow.update` event
- Already wired in `eventRouter.ts` → invalidates `queryKeys.users.profile(handle)` on `followed/unfollowed/requested`
- Profile cache update is automatic; FollowButton re-renders from cache changes
