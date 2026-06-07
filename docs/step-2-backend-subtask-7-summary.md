# Backend Phase 2 — Subtask 7: Media Pipeline Summary

**Completed:** 2026-06-07
**Status:** All deliverables implemented and verified. typecheck ✓ lint ✓ build ✓ tests ✓ (287 passing — 39 new)

---

## Database Changes

### Migration `1704067200006-create-media.ts`

#### `media` table
- Snowflake BIGINT PK (as string in TypeORM)
- `owner_id UUID NOT NULL REFERENCES users ON DELETE CASCADE`
- `type VARCHAR(10) CHECK IN ('image','gif','video')`
- `status VARCHAR(20) DEFAULT 'pending' CHECK IN ('pending','processing','ready','failed')`
- `storage_key VARCHAR(512)` — object key in MinIO/S3
- `mime VARCHAR(127)` — validated MIME at upload-url creation
- `width INTEGER`, `height INTEGER`, `duration_ms INTEGER` (nullable)
- `alt_text VARCHAR(1000)` (nullable)
- `variants JSONB DEFAULT '{}'` — populated by the processing worker
- `created_at TIMESTAMPTZ`
- Index: `(owner_id, created_at DESC)` for user media tab query

#### `post_media` table
- Composite PK `(post_id, media_id)`
- `post_id BIGINT REFERENCES posts ON DELETE CASCADE`
- `media_id BIGINT REFERENCES media ON DELETE RESTRICT`
- `position SMALLINT DEFAULT 0` — ordering within a post

#### Deferred FK constraints on `users`
- `users.avatar_media_id → media(id) ON DELETE SET NULL` (was plain UUID column in migration 1)
- `users.banner_media_id → media(id) ON DELETE SET NULL` (was plain UUID column in migration 1)

---

## Module: `src/modules/media/`

| File | Role |
|------|------|
| `media.entity.ts` | TypeORM entity for `media` table |
| `post-media.entity.ts` | TypeORM entity for `post_media` join table |
| `media.service.ts` | Business logic: upload-url, finalize, findOne, updateAltText, validateAndLoadForPost |
| `media.controller.ts` | HTTP layer — 4 endpoints under `api/v1/media` |
| `media-process.processor.ts` | BullMQ worker: image variants, GIF→MP4, video transcode + poster |
| `media-attach.adapter.ts` | Real implementation of `MediaAttachPort` (delegates to `MediaService`) |
| `media.module.ts` | `@Global()` — exports `MEDIA_ATTACH_PORT` to override PostsModule noop |
| `dto/media.dto.ts` | `MediaDto` response shape |
| `dto/upload-url.dto.ts` | `UploadUrlDto` with class-validator |
| `dto/update-media.dto.ts` | `UpdateMediaDto` with class-validator |

### Port pattern (avoids circular import)
- `src/modules/posts/media-attach.port.ts` — `MEDIA_ATTACH_PORT` token + `MediaAttachPort` interface
- `src/modules/posts/noop-media-attach.service.ts` — noop (returns []) registered in PostsModule
- `src/modules/media/media-attach.adapter.ts` — real adapter registered globally in MediaModule

---

## Upload → Finalize → Process → Attach Flow

```
1. Client: POST /api/v1/media/upload-url { type, mime, size }
   → Validate MIME type (per-type allow-list)
   → Validate size (image ≤5MB, gif ≤15MB, video ≤100MB)
   → Create media row status=pending, storage_key=uploads/{ownerId}/{id}.{ext}
   → Return { mediaId, uploadUrl } (presigned MinIO PUT, 15min TTL)

2. Client: PUT <uploadUrl> — direct file upload to MinIO

3. Client: POST /api/v1/media/:id/finalize
   → Owner check
   → Transition status: pending → processing
   → Enqueue media.process job (jobId=media.process:{id}, 3 attempts, exponential backoff)
   → Return { media: MediaDto } with status=processing

4. BullMQ worker (MediaProcessProcessor):
   → Download uploaded file from storage to tmpdir
   → dispatch by type:
     image → sharp: autoOrient (EXIF rotation), strip all metadata, generate thumb/small/medium/large JPEG variants
     gif   → sharp: first-frame thumb JPEG; ffmpeg: convert to looping MP4
     video → ffmpeg: ffprobe dimensions+duration, transcode H.264 MP4 (movflags faststart), extract poster frame, sharp thumb from poster
   → Upload each variant to processed/{ownerId}/{id}/{variant}
   → Generate presigned download URLs (1-year TTL)
   → Update media: status=ready, width, height, durationMs, variants JSONB
   → On error: status=failed, rethrow so BullMQ retries

5. Client: POST /api/v1/posts { text, mediaIds: [id1, id2, ...] }
   → MediaAttachPort.validateAndLoad():
     - All mediaIds must exist, status=ready, owned by author
     - Max 4 images per post
     - Max 1 video or gif per post
     - Cannot mix video/gif with images
   → INSERT post_media (post_id, media_id, position) in transaction
   → PostDto.media[] populated with attached items
```

---

## Variants Shape (`variants` JSONB)

| Media type | Variants populated |
|------------|-------------------|
| `image` | `thumb` (150px), `small` (360px), `medium` (720px), `large` (1280px) — JPEG |
| `gif` | `thumb` (150px JPEG), `mp4` (H.264 looping MP4) |
| `video` | `thumb` (150px JPEG), `mp4` (H.264 web-friendly MP4), `poster` (first-frame JPEG) |

All variant URLs are presigned MinIO GET URLs with 1-year TTL.

---

## Limits Enforced

| Type | MIME allow-list | Max size |
|------|----------------|----------|
| `image` | `image/jpeg`, `image/jpg`, `image/png`, `image/webp`, `image/gif` | 5 MB |
| `gif` | `image/gif` | 15 MB |
| `video` | `video/mp4`, `video/quicktime`, `video/webm`, `video/x-msvideo` | 100 MB |

Post limits: max 4 images; max 1 video or gif; no mixing image+video/gif.

---

## Dockerfile Changes

Added to runner stage:
```dockerfile
RUN apk add --no-cache ffmpeg vips
```
- `ffmpeg` — video transcode, GIF→MP4, poster frame extraction
- `vips` — sharp native library runtime on Alpine

---

## Media Tab Wiring (TimelineService)

`getUserMedia` updated from placeholder to real implementation:
- `INNER JOIN post_media pm ON pm.post_id = p.id` — filters to posts with at least one media attachment
- `DISTINCT` to avoid duplicate rows when a post has multiple media items
- Replaces the old `p.reply_to_id IS NULL AND p.repost_of_id IS NULL AND p.text IS NOT NULL` heuristic

---

## PostsService Changes

- `MEDIA_ATTACH_PORT` injection added to constructor
- `create()` validates + loads media before the transaction (throws on violation, no DB pollution)
- `INSERT INTO post_media` inside the transaction for each attached media item
- `PostDto.media[]` populated from `AttachedMediaItem[]` (non-empty on create)

---

## Unit Tests (39 new, 287 total)

| File | Tests | Coverage |
|------|-------|----------|
| `tests/unit/media/media.service.spec.ts` | 29 | upload-url (valid, invalid MIME, size limits per type), finalize (pending→processing, idempotent ready/processing, not-found, not-owned, failed retry), validateAndLoadForPost (empty, ordered, missing, not-owned, not-ready, >4 images, image+video mix, image+gif mix, >1 video, 4 images OK, 1 video OK), updateAltText (owner, non-owner, not-found, no-op) |
| `tests/unit/media/media-process.processor.spec.ts` | 10 | Already-ready idempotent, not-found skip, null storageKey → failed, image variants+width/height, image thumb URL, gif thumb+mp4, video mp4+poster+thumb, video durationMs, failure path → status=failed+rethrow |

---

## Key File Paths

| What | Where |
|------|-------|
| Migration | `src/infra/database/migrations/1704067200006-create-media.ts` |
| Media entity | `src/modules/media/media.entity.ts` |
| PostMedia entity | `src/modules/media/post-media.entity.ts` |
| MediaService | `src/modules/media/media.service.ts` |
| MediaController | `src/modules/media/media.controller.ts` |
| MediaProcessProcessor | `src/modules/media/media-process.processor.ts` |
| MediaAttachAdapter | `src/modules/media/media-attach.adapter.ts` |
| MediaModule | `src/modules/media/media.module.ts` |
| MediaAttachPort | `src/modules/posts/media-attach.port.ts` |
| NoopMediaAttachService | `src/modules/posts/noop-media-attach.service.ts` |
| Unit tests (service) | `tests/unit/media/media.service.spec.ts` |
| Unit tests (processor) | `tests/unit/media/media-process.processor.spec.ts` |

---

## What Realtime+DMs+Notifications (Subtask 8) Builds On

1. **DM media**: `POST /api/v1/conversations/:id/messages` accepts `{ mediaId }`. Follow the same seam — validate `status=ready + ownership` via `MediaService.validateAndLoadForPost` or a direct repo check. The DM media item is a single item (no 4-image limit applies to DMs — 1 image/video/gif per message).
2. **`MediaAttachPort`** — already global. MessagingModule can inject `MediaService` directly (no port needed for DMs, simpler).
3. **`post_media` join** — TimelineModule's `getUserMedia` now live. No further changes needed.
4. **Avatar/banner URLs** — `users.avatar_media_id` and `users.banner_media_id` now have FK constraints to `media(id)`. UsersService can join `media` on load to populate `avatarUrl`/`bannerUrl` in `ProfileDto` and `UserDto`. Currently these fields return `null` (stub in `toAuthorDto`).
5. **EXIF stripping** — done in `MediaProcessProcessor` via `sharp().autoOrient()` without `.withMetadata()` (default strips all EXIF, preserves orientation correction).
