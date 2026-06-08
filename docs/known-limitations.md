# Known Limitations

Current, accurate status of intentionally-incomplete areas, as of commit
`6eee1bf` (smoke-test fix batch). This supersedes the per-subtask
`docs/step-2-backend-subtask-*.md` build notes, which are historical and now
partly outdated (notifications, trends, and viewer-flags were wired in `6eee1bf`).

These are **non-blocking** — the app builds, the stack is healthy, and all
critical/high smoke-test findings are resolved. They are tracked here so they are
not mistaken for bugs.

---

## 1. Uploaded media is attached to posts (`MEDIA_ATTACH_PORT` — ✅ WIRED)

- **Status:** ✅ wired. Uploaded media now links to posts end-to-end.
- **User-facing impact:** creating a post with finalized media IDs returns the
  attached media; images/video appear on posts.
- **Wiring:** `PostsModule` no longer binds a local noop. `MEDIA_ATTACH_PORT`
  resolves from the `@Global` `MediaModule` → `MediaAttachAdapter`
  (`backend/src/modules/media/media-attach.adapter.ts` → `MediaService.validateAndLoadForPost`),
  the same `@Global`-resolution pattern used for `POSTS_NOTIFICATION_PORT` /
  `VIEWER_FLAGS_PORT`.
- **How it was done:** there was no real circular dependency (`MediaModule` does
  not import `PostsModule`; `MediaService` needs only repos + storage + the media
  queue). Removing the local noop shadow in `PostsModule` let the consumer resolve
  the real `@Global` binding. The earlier "MediaModule imports PostsModule" note
  was stale.
- **Tests:** `tests/integration/media-attach.test.ts` (attach happy path +
  ownership/status guards, real DI) and `tests/unit/media/media-attach.adapter.spec.ts`
  (Media→AttachedMediaItem mapping).

## 2. Real-time delivery is not emitted (`REALTIME_PUBLISHER_PORT` = noop)

- **Status:** intentional seam, real implementation exists but unwired.
- **User-facing impact:** notifications, DM messages, and "N new posts" timeline
  pills are **persisted and fetchable over REST**, but are **not pushed live over
  WebSockets**. Clients see them on refresh/refetch, not instantly. (The WS
  gateway itself accepts connections — only the server→client publish is a noop.)
- **Wiring:** `NotificationsModule`, `MessagingModule`, and `TimelineModule` each
  bind `REALTIME_PUBLISHER_PORT` to a noop `useValue`.
- **Real impl (exists):** `RealtimePublisherService`
  (`backend/src/modules/realtime/realtime-publisher.service.ts`); `RealtimeModule`
  and `RealtimeGateway` exist and `RealtimeModule` is already imported in
  `app.module.ts`.
- **Correct swap path:** bind `REALTIME_PUBLISHER_PORT` →
  `RealtimePublisherService` in the three consuming modules (resolve from
  `RealtimeModule`), minding cycles between `RealtimeModule` and those modules.
  Verification needs a WS client, not just REST.

---

## Not limitations — explicitly out of scope for v1 (per PRD §18)

Algorithmic "For You" ranking, ads/monetization, communities/groups (DM schema is
group-ready but UI/logic is 1:1), live audio, polls, edit-post history, full
moderation tooling, multi-language tsvector tuning, geo-segmented trends. Seams
are left where noted so these can slot in later.

---

## A note on the NestJS "AppModule override" pattern

Several older code comments claim a port's noop default is "replaced in AppModule
scope." That does **not** work: NestJS resolves an injection token within the
module where the *consumer* is declared, so a provider added at AppModule scope
does not override a token a child module binds locally. The working pattern
(used in `6eee1bf`) is to bind the token to the real implementation in the
consuming module — or in a `@Global` module the consumer resolves from — after
removing the local noop binding.
