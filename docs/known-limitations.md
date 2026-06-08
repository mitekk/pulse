# Known Limitations

Current, accurate status of intentionally-incomplete areas. The two former seams
below — media-attach (`MEDIA_ATTACH_PORT`) and real-time delivery
(`REALTIME_PUBLISHER_PORT`) — are now **both wired and verified end-to-end** in the
dockerized stack; they are kept here as ✅-resolved records (and supersede the
per-subtask `docs/step-2-backend-subtask-*.md` build notes, which are historical
and outdated). Notifications, trends, and viewer-flags were wired earlier in
`6eee1bf`.

The app builds, the stack is healthy, and all critical/high smoke-test findings are
resolved.

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

## 2. Real-time delivery is emitted over WebSockets (`REALTIME_PUBLISHER_PORT` — ✅ WIRED)

- **Status:** ✅ wired. Notifications, DM messages, and "N new posts" timeline
  pills are now pushed **live over WebSockets** (in addition to being persisted +
  served over REST). Verified end-to-end in the dockerized stack: a follow
  triggered `notification.new` on a connected Socket.IO client within ~200ms.
- **Wiring:** `RealtimeModule` is now `@Global` and exports the single
  `RealtimePublisherService` instance (the one `RealtimeGateway.afterInit()` calls
  `setServer()` on). `NotificationsModule`, `MessagingModule`, and `TimelineModule`
  each bind `REALTIME_PUBLISHER_PORT` via `useExisting: RealtimePublisherService`
  (alias to that singleton — never `useClass`, which would create a second
  io-less instance). The dead AppModule "override" provider was removed (it never
  worked — see the NestJS-pattern note below). No module-import cycle was needed:
  consumers resolve the publisher from the `@Global` export without importing
  `RealtimeModule`.
- **Required infra fix:** wiring the real publisher surfaced a latent Redis bug.
  The dedicated pub/sub **subscriber** connection
  (`backend/src/infra/redis/redis.service.ts`) was created with
  `enableReadyCheck: true`; `RealtimePublisherService.onModuleInit()` calls
  `subscribe()` before the ready-check `INFO` completes, which fails in subscriber
  mode, reconnects, and silently drops the (untracked) subscriptions
  (`PUBSUB NUMSUB notification:new` → 0, so every publish reached no one). Fixed by
  setting `enableReadyCheck: false` on the subscriber connection (the `client`
  connection is unchanged).
- **Tests:** `tests/integration/wiring.test.ts` (DI asserts both ports resolve to
  their real classes; pub/sub round-trip asserts `publishNotification` reaches the
  `user:{id}` room over real Redis). The integration bootstrap
  (`tests/integration/helpers/app.ts`) no longer overrides
  `REALTIME_PUBLISHER_PORT`, so the suite exercises the real production wiring.

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
