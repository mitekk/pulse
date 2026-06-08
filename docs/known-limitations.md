# Known Limitations

Current, accurate status of intentionally-incomplete areas, as of commit
`6eee1bf` (smoke-test fix batch). This supersedes the per-subtask
`docs/step-2-backend-subtask-*.md` build notes, which are historical and now
partly outdated (notifications, trends, and viewer-flags were wired in `6eee1bf`).

These are **non-blocking** — the app builds, the stack is healthy, and all
critical/high smoke-test findings are resolved. They are tracked here so they are
not mistaken for bugs.

---

## 1. Uploaded media is not attached to posts (`MEDIA_ATTACH_PORT` = noop)

- **Status:** intentional seam, real implementation exists but unwired.
- **User-facing impact:** media upload itself works end-to-end (`POST
  /media/upload-url` → browser `PUT` → `POST /media/:id/finalize`), but a created
  post does not get its uploaded media linked, so images/video don't appear on
  posts.
- **Wiring:** `PostsModule` binds `MEDIA_ATTACH_PORT` →
  `NoopMediaAttachService` (`backend/src/modules/posts/noop-media-attach.service.ts`).
- **Real impl (exists):** `MediaAttachAdapter`
  (`backend/src/modules/media/media-attach.adapter.ts`), provided by `MediaModule`.
- **Correct swap path:** bind `MEDIA_ATTACH_PORT` → `MediaAttachAdapter` and have
  `PostsModule` import `MediaModule`. NOTE: `MediaModule` imports `PostsModule`,
  so this is a circular dependency — break it the same way the viewer-flags cycle
  was broken in `6eee1bf` (drop the back-import or use `forwardRef`). This is the
  same proven pattern used to wire notifications/trends/viewer-flags.

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
