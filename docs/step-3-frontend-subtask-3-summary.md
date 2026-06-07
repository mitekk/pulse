# Frontend Phase 3 — PostCard + Timeline + Engagement — Summary

**Completed:** 2026-06-07
**Subtask:** 3 of Phase 3 (Frontend Phase 3a)

---

## Components Built (`frontend/src/`)

### Shared Primitives (`components/`)

| Component | Description |
|---|---|
| `Avatar.tsx` | Sizes: xs/sm/md/lg/xl. Verified ring (accent border + checkmark badge for md+). Image with `loading="lazy"`. Initials fallback. |
| `RelativeTime.tsx` | `<time>` with `datetime` ISO attribute, `title` full date tooltip. "now" / Nm / Nh / Nd / date string. Self-updates every 30s. |
| `Skeleton.tsx` | `Skeleton` (arbitrary size/radius) + `PostCardSkeleton` (avatar + 3 text lines + action bar). Shimmer keyframe injected once. |
| `Menu.tsx` | Accessible `role="menu"` dropdown. Closes on outside click + Escape. `align` prop (left/right). Danger item color. `data-testid` per item. |
| `InfiniteList.tsx` | Generic wrapper component over `useInfiniteList`. Renders: loading skeletons / error state (role=alert) / empty state / items / sentinel / isFetchingNextPage skeleton / end-of-list. All states have `data-testid`. |

### Core Post Components (`components/`)

| Component | Description |
|---|---|
| `RichText.tsx` | Segments `PostDto.text` by backend `entities` offsets (codepoint-aware). Mentions → `/@handle` Link (accent). Hashtags → `/search?q=%23tag&type=top` Link (accent). URLs → external `<a rel="noopener noreferrer">` showing `displayUrl`. NEVER re-parses raw text. |
| `MediaGrid.tsx` | 1/2/3/4 image layouts using CSS grid. Images: `loading="lazy"` + explicit width/height. Click → lightbox route `/@handle/status/:id/photo/:idx` (3b). GIF: autoplay muted loop video + "GIF" badge. Video: controls + poster. |
| `ActionBar.tsx` | Reply, Repost menu (Repost toggle / Quote → `/compose?quoteOf=`), Like, Bookmark, Views, Share. Count formatting (k/m). Active state colors (accent for like/bookmark, success for repost). `aria-pressed` on toggle actions. |
| `PostCard.tsx` | All variants via props: tombstone (`deleted`), repost wrapper (`repostOf` + attribution), quote (body + `QuoteCard` embed), normal. Author block: Avatar + name + handle + `RelativeTime` + verified icon. `replyToId` → "Replying to a post" line. `repostedBy` → attribution banner. Click → thread navigation (suppressed by `noNavigate`). Engagement wired via hooks. |

### Engagement Hooks (`features/engagement/useEngagement.ts`)

Six hooks following the canonical optimistic-mutation pattern:

**`useLike` / `useUnlike` / `useRepost` / `useUnrepost` / `useBookmark` / `useUnbookmark`**

Pattern per hook:
1. `onMutate`: `cancelQueries` for post detail → `patchPostInCaches(qc, postId, updater)` → flip `viewer.*` + adjust `counts.*` → return `{ snapshots, postId }`
2. `onError`: `restorePostSnapshots(qc, ctx.snapshots)` — full rollback across all caches
3. `onSettled`: `invalidateQueries({ refetchType: 'none' })` — marks stale but does not refetch (WS `post.counters` handles live updates)

### Home Timeline (`features/timeline/` + `pages/HomePage.tsx`)

**`useHomeTimeline`**: wraps `useInfiniteList` with `queryKeys.timeline.home()` + `timelineApi.getHome` + `staleTime: 30_000`.

**`HomePage`**:
- Sticky header with refresh button + compose shortcut
- "N new posts" pill: fed by `useTimelineBufferStore.newCount` (WS `timeline.newPosts` already wired in Phase 2). Clicking: `flush()` → `invalidateQueries(timeline.home)` → `scrollTo(top)`. NEVER auto-injects.
- `InfiniteList<PostDto>` with `PostCard` render, empty state, loading skeletons
- Back-to-top button appears after 600px scroll
- Pull-to-refresh via explicit refresh button (mobile-friendly)
- Pill pop-in CSS keyframe animation

---

## Optimistic Mutation Pattern

```ts
// Standard shape for all engagement mutations:
onMutate: async (postId) => {
  await qc.cancelQueries({ queryKey: queryKeys.posts.detail(postId) })
  const snapshots = patchPostInCaches(qc, postId, (post) => ({ ...post, viewer: { ...viewer, liked: true }, counts: { ...counts, likes: counts.likes + 1 } }))
  return { snapshots, postId }
},
onError: (_err, _id, ctx) => restorePostSnapshots(qc, ctx.snapshots),
onSettled: (_data, _err, postId) => qc.invalidateQueries({ queryKey: queryKeys.posts.detail(postId), refetchType: 'none' })
```

WS `post.counters` events (already wired in Phase 2 event router) reconcile counts after settlement.

---

## Home Timeline "N new posts" Pill Behavior

1. WS `timeline.newPosts` event fires → `timelineBufferStore.add(count, previewIds)` (Phase 2 wired)
2. `newCount` increases in store → `NewPostsPill` appears with count
3. User clicks pill → `flush()` + `invalidateQueries(home)` + scroll to top
4. Auto-inject is NEVER done — user controls when new posts load

---

## Tests Added (Vitest + Testing Library)

| File | Tests |
|---|---|
| `RichText.test.tsx` | 6: plain text, mention link, hashtag link, URL displayUrl, multi-entity, plain text segments |
| `PostCard.test.tsx` | 18: normal, tombstone, embedded tombstone, repost, quote, deleted-quoteOf, action bar testids, liked state, replyToId, repostedBy, media grid, noNavigate cursor, avatar click, author click, verified badge, null text, quote click, hover states |
| `ActionBar.test.tsx` | 10: all buttons render, onLike, onUnlike, liked press state, onBookmark, onUnbookmark, repost menu open, onRepost, onUnrepost, reply click, count display |
| `Avatar.test.tsx` | 5: initials, image src, verified badge, no badge for xs, all sizes |
| `RelativeTime.test.tsx` | 6: now, minutes, hours, days, old date, datetime attribute |
| `Skeleton.test.tsx` | 3: aria-hidden, custom dimensions, PostCardSkeleton |
| `InfiniteList.test.tsx` | 7: renders items, loading skeletons, error state, empty state, sentinel, fetching-next skeleton, end-of-list |
| `MediaGrid.test.tsx` | 7: empty, single image, 2-column, 4-max truncation, lazy + alt, GIF badge, video element |
| `useEngagement.test.tsx` | 11: like patch, like rollback, unlike patch, bookmark patch, bookmark rollback, unbookmark patch, repost patch, repost rollback, unrepost patch |

**Total new tests: 73 (+ 32 from Phase 2 = 105 passing total)**

---

## Verification Results

```
npm run typecheck   ✓ (0 errors)
npm run lint        ✓ (0 errors, 0 warnings)
npm run build       ✓ (244 modules, 286ms)
npm test            ✓ (105/105 pass)
coverage lines      82.21% (gate: 80%)
```

---

## What Subtask 3b (Composer + Thread + Lightbox) Builds On

- **`PostCard`** — thread view uses it with `noNavigate` prop; reply variant already renders "replying to" line
- **`ActionBar`** — `onReply` prop routes to inline reply composer in thread view
- **Engagement hooks** — reuse `useLike`/`useBookmark` everywhere (profile tabs, search, bookmarks page)
- **`InfiniteList`** — thread replies use it with `queryKeys.posts.replies(id)` + `postsApi.getReplies`
- **`RichText`** — composer live-tokenizer renders same entities in preview mode
- **`MediaGrid`** — lightbox (`/photo/:idx`) receives `media` array; `PhotoPage.tsx` fills in the modal UI
- **`patchPostInCaches`** — quote/repost mutations from composer use same pattern
- **`useTimelineBufferStore.flush()`** — PostComposer calls `flush()` after successful post to prevent stale pill count
- **`queryKeys.posts.thread(id)`** — thread page uses `useInfiniteList` with cursor replies + `ThreadResponse` shape from `postsApi.getThread`
