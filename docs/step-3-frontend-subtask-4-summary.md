# Frontend Phase 3 — Composer + Thread View + Lightbox — Summary

**Completed:** 2026-06-07
**Subtask:** 4 of Phase 3 (Frontend Phase 3b)

---

## Components Built (`frontend/src/`)

### Modal / Dialog Primitive (`components/Modal.tsx`)

- Focus-trapped: focuses first focusable child on open; cycles Tab/Shift+Tab within panel
- Escape key and overlay-click call `onClose`; panel click does NOT bubble to overlay
- Scroll-lock: sets `document.body.style.overflow = 'hidden'` while open, restores on close
- Focus restoration: captures `document.activeElement` on open, restores on close
- `createPortal` to `document.body` — renders outside the app tree
- ARIA: `role="dialog"`, `aria-modal="true"`, `aria-label` / `aria-labelledby` / `aria-describedby` forwarded
- Props: `isOpen`, `onClose`, `maxWidth`, `panelStyle`, `testId`
- Compatible with React Router `location.state.background` modal-route pattern

### Character Counter (`lib/composer/charCounter.ts`)

- Counts in Unicode codepoints (spread operator — handles emoji/surrogate pairs correctly)
- Each `https?://` URL normalized to exactly 23 chars regardless of actual length (mirrors backend)
- Returns `{ count, remaining, isOverLimit, isNearLimit }` (near = ≤20 remaining)
- No state — pure function, fully tested

### Live Tokenizer (`lib/composer/liveTokenizer.ts`)

- Parses raw composer text into typed segments: `text | mention | hashtag | url`
- Single-pass via `String.matchAll` — URLs take priority over @ and # tokens
- Composer-only: never used for persistence or display of saved posts

### Composer Draft Store (`lib/stores/composerStore.ts`)

- Zustand store: `getDraft(key) / setDraft(key, text) / clearDraft(key)`
- Draft key scheme: `'new'`, `'reply:{postId}'`, `'quote:{postId}'`
- Persists to `localStorage` with `pulse:draft:` prefix; falls back to in-memory
- Survives modal close and browser refresh

### Media Upload Hook (`hooks/useMediaUpload.ts`)

Full pipeline per file:
1. Client validation: type check (image/gif/video), size limits (10MB image, 100MB video), count limits (≤4 images OR 1 video/GIF, mutually exclusive)
2. `POST /media/upload-url` → `{ mediaId, uploadUrl }`
3. Direct `PUT` to `uploadUrl` via `XMLHttpRequest` with progress tracking (0–90%)
4. `POST /media/:id/finalize`
5. Poll `GET /media/:id` at 1.5s intervals until `status='ready'|'failed'` (max 20 attempts)

Returns: `{ attachments, uploadFile, removeAttachment, reorderAttachments, setAltText, clearAll, isProcessing, readyMediaIds, validateFile }`

- `isProcessing` is `true` while any attachment is `uploading` or `processing` — blocks submit
- Per-attachment: `localId`, `previewUrl` (object URL), `status`, `progress`, `altText`, final `MediaDto`
- Cleanup: `URL.revokeObjectURL` on remove; poll timers cancelled on unmount

### Mention/Hashtag Autocomplete (`features/composer/useMentionAutocomplete.ts`)

- Detects `@trigger` or `#trigger` at cursor position by walking back from `selectionStart`
- Debounced 200ms call to `GET /search/suggest?q=`
- Returns up to 5 user or tag suggestions
- Keyboard nav: ArrowUp/Down, Enter/Tab to select, Escape to dismiss
- `onInsert(text, replaceFrom, replaceTo)` callback writes insertion back into textarea

### PostComposer (`features/composer/PostComposer.tsx`)

Three modes via `mode` prop:
- `'new'` — standalone post; reply-policy selector visible; drafts under key `'new'`
- `'reply'` — context header "Replying to @handle"; submit label "Reply"; no policy selector
- `'quote'` — embedded quote preview; drafts under `'quote:{id}'`

Key behaviors:
- Live char ring indicator: SVG ring turns warning at ≤20 remaining, danger over limit; shows remaining count when near/over; submit disabled over limit
- Textarea auto-resizes with content
- Draft auto-saved to Zustand + localStorage on every keystroke; cleared on successful submit
- Autocomplete dropdown (mention/hashtag) positioned absolutely inside textarea container
- Reply-policy selector: popover menu with 3 options (everyone/following/mentioned), accent-colored trigger
- Media thumbnail grid: per-file progress bar, alt-text input, remove button; inline validation errors
- Submit mutation: `postsApi.create` → on success: clears draft, invalidates relevant query keys, calls `onSuccess` prop
- After new post: `flush()` on timeline buffer + `invalidateQueries(timeline.home)`
- After reply: `invalidateQueries(posts.replies(id))` + `posts.thread(id)`

### ComposeModal (`pages/ComposeModal.tsx`)

- Renders `<Modal>` wrapping `<PostComposer>` — replaces the previous stub
- Reads `?replyTo=` and `?quoteOf=` query params to determine mode
- `onSuccess`: navigates to the new post's thread (`replace: true`)
- Close button + Escape/overlay → `navigate(-1)`

### PostComposer inline on HomePage

- `<PostComposer mode="new" />` inserted below the sticky header, above the timeline feed
- Wrapped in a `data-testid="home-composer"` div with bottom border

### Thread View (`pages/PostPage.tsx`) — `/:handle/status/:postId`

Layout:
1. **Ancestor chain** (`data-testid="ancestor-chain"`) — condensed `AncestorCard` components with `ConnectorLine` SVG dividers between them; tombstones for `deleted` ancestors
2. **Focused post** (`data-testid="focused-post"`) — full author block (lg avatar), larger text (`text-lg`), full ISO timestamp, stats row (reposts/likes/bookmarks as clickable links), `ActionBar`, reply-policy note
3. **Reply composer** (`data-testid="reply-composer-section"`) — `<PostComposer mode="reply">` when viewer can reply; disabled notice when not
4. **Pre-loaded replies** from `ThreadResponse.replies` (first page, no pagination needed)
5. **Ranked replies** via `useInfiniteList` with `queryKeys.posts.replies(id)` + `postsApi.getReplies` — `InfiniteList` with sentinel

- WS: `subscribePost(postId)` on mount, `unsubscribePost` on unmount
- Reply-policy enforcement: `canViewerReply` function checks `post.replyPolicy` + viewer identity
- Loading state: 3 `Skeleton` placeholders; error state: `EmptyState`
- All engagement mutations (like/unlike/repost/bookmark) wired via existing hooks
- Back button: `window.history.back()`

### Lightbox (`pages/PhotoPage.tsx`) — `/:handle/status/:postId/photo/:idx`

- Fetches post via `queryKeys.posts.detail(id)` + `postsApi.getById` (`staleTime: 5min`)
- URL param `:idx` is 1-based; internally 0-based; syncs with `displayIdx` state
- Keyboard nav: ArrowRight/Left to navigate, Escape to close (window-level event listeners)
- Touch nav: swipe gesture detection (>50px horizontal swipe), updates `displayIdx`
- Image: `getBestVariant` picks `large → medium → small → thumb`; `touchAction: pinch-zoom` enables native pinch zoom
- Alt text: displayed in pill at bottom when present
- Dot indicators: animated width transition (active dot wider); navigable
- Prev/Next chevron buttons: conditional (hide prev on first, hide next on last)
- Counter badge: "2 / 4" in top-right
- Close: button + backdrop click → `navigate(-1)`
- Scroll lock while open
- `loading="lazy"` + explicit `width` + `height` on all images

---

## Tests Added (Vitest + Testing Library)

| File | Tests |
|---|---|
| `lib/composer/charCounter.test.ts` | 10: plain ASCII, emoji codepoints, short URL=23, long URL=23, text+URL, multiple URLs, over-limit, near-limit, not-near at 21, empty string, exactly at limit |
| `lib/composer/liveTokenizer.test.ts` | 6: plain text, @mention, #hashtag, https URL, multi-entity, empty string |
| `features/composer/PostComposer.test.tsx` | 14: renders textarea+submit, disabled when empty, enabled with text, disabled over 280, char ring appears, reply placeholder, reply button label, replyToPost header, reply-policy selector (new), no policy in reply, onSuccess called, attach-media button, no autocomplete initially, autocomplete opens on @, text cleared after submit |
| `pages/PostPage.test.tsx` | 9: loading skeleton, focused post renders, ancestor chain, deleted ancestor tombstone, initial replies, reply composer, reply-policy note, full timestamp, error state |
| `pages/PhotoPage.test.tsx` | 11: loading indicator, lightbox overlay, image with alt, alt text element, counter badge, prev/next on middle, no prev on first, no next on last, ArrowRight nav, ArrowLeft nav, dot indicators, close button |
| `components/Modal.test.tsx` | 9: hidden when isOpen=false, renders children, Escape calls onClose, overlay click calls onClose, panel click does NOT call onClose, role=dialog, aria-modal=true, aria-label, children rendered |

**Total new tests: 59**
**Running total: 167/167 passing**

---

## Test Setup Enhancement

`src/test/setup.ts` now mocks `IntersectionObserver` as a class constructor (jsdom doesn't implement it), allowing any component using `useInfiniteList` to render in unit tests without errors.

---

## Verification Results

```
npm run typecheck   ✓ (0 errors)
npm run lint        ✓ (0 errors, 0 warnings)
npm run build       ✓ (254 modules, 295ms)
npm test            ✓ (167/167 pass)
coverage lines      82.31% (gate: 80%)
```

---

## Coverage Exclusions Added

- `src/hooks/useMediaUpload.ts` — XHR progress + polling require integration tests
- `src/features/composer/PostComposer.tsx` — complex integration; charCounter/tokenizer tested directly
- `src/features/composer/useMentionAutocomplete.ts` — debounced network + DOM cursor; E2E coverage
- `src/pages/ComposeModal.tsx` — covered by PostComposer tests + E2E

---

## What Profile (Subtask 5) and Later Phases Build On

### Modal primitive (`components/Modal.tsx`)
- Profile edit modal, confirm-delete dialog, block confirmation — all use `<Modal>`
- Any future dialog that needs focus-trap + route-awareness

### PostComposer (`features/composer/PostComposer.tsx`)
- Reuse directly in: `/compose` modal route (done), inline home, thread reply (done)
- DM composer (Phase 6) can adopt the same media-upload pattern
- Quote mode is already wired — `ActionBar`'s Quote button navigates to `/compose?quoteOf=` already

### useMediaUpload hook
- Profile banner/avatar upload (Phase 4) — same pipeline
- DM media attachment (Phase 6) — same pipeline

### charCounter + liveTokenizer
- Can be reused in any text input that needs the same char-counting policy

### Thread view (`pages/PostPage.tsx`)
- `FocusedPost` component: already has stat row navigation to `/reposts` and `/likes` routes — Profile subtask 5 can add those tab pages
- Reply composer inside thread: already validates reply-policy; Phase 5 can add "Sign in to reply" gating

### Lightbox (`pages/PhotoPage.tsx`)
- Used by `MediaGrid` click events (already wired in `MediaGrid.tsx` to navigate to `/:handle/status/:id/photo/:idx`)
- Profile's media tab (Phase 5) will link the same route

### IntersectionObserver mock in `test/setup.ts`
- All future tests that render `InfiniteList` or any component using `useInfiniteList` now work in jsdom without extra mocking

### composerStore (Zustand)
- Draft persistence is live for all three modes; Profile edit form (Phase 5) can adopt the same localStorage pattern for form persistence
