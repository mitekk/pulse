import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Media, MediaType } from './media.entity';
import { STORAGE_PORT, StoragePort } from '../../infra/storage/storage.port';
import { SnowflakeUtil } from '../../common/utils/snowflake.util';
import { UploadUrlDto } from './dto/upload-url.dto';
import { UpdateMediaDto } from './dto/update-media.dto';
import { MediaDto } from './dto/media.dto';

// ── Media Limits ──────────────────────────────────────────────────────────────

/** Max images per post (type=image) */
export const MAX_IMAGES_PER_POST = 4;

/** Max size for images in bytes (~5 MB) */
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

/** Max size for video in bytes (100 MB) */
export const MAX_VIDEO_SIZE = 100 * 1024 * 1024;

/** Max size for GIF in bytes (15 MB) */
export const MAX_GIF_SIZE = 15 * 1024 * 1024;

/** Allowed MIME types per media type */
const ALLOWED_MIMES: Record<MediaType, string[]> = {
  image: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'],
  gif: ['image/gif'],
  video: ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'],
};

/** Max upload URL validity in seconds */
const UPLOAD_URL_EXPIRY = 900; // 15 minutes

// ── Helper ────────────────────────────────────────────────────────────────────

export function toMediaDto(media: Media): MediaDto {
  return {
    id: media.id,
    type: media.type,
    status: media.status,
    mime: media.mime,
    width: media.width,
    height: media.height,
    durationMs: media.durationMs,
    altText: media.altText,
    variants: media.variants,
    createdAt: media.createdAt.toISOString(),
  };
}

// ── MediaService ──────────────────────────────────────────────────────────────

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    @InjectRepository(Media)
    private readonly mediaRepo: Repository<Media>,
    @Inject(STORAGE_PORT)
    private readonly storage: StoragePort,
    @InjectQueue('media')
    private readonly mediaQueue: Queue,
  ) {}

  // ── POST /api/v1/media/upload-url ─────────────────────────────────────────

  async createUploadUrl(
    ownerId: string,
    dto: UploadUrlDto,
  ): Promise<{ mediaId: string; uploadUrl: string }> {
    const { type, mime, size } = dto;

    // ── Validate MIME ──────────────────────────────────────────────────────
    const allowed = ALLOWED_MIMES[type];
    if (!allowed.includes(mime.toLowerCase())) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_MIME_TYPE',
          message: `MIME type "${mime}" is not allowed for type "${type}". Allowed: ${allowed.join(', ')}`,
        },
      });
    }

    // ── Validate size ──────────────────────────────────────────────────────
    const maxSize =
      type === 'image' ? MAX_IMAGE_SIZE : type === 'gif' ? MAX_GIF_SIZE : MAX_VIDEO_SIZE;

    if (size > maxSize) {
      throw new BadRequestException({
        error: {
          code: 'FILE_TOO_LARGE',
          message: `File size ${size} exceeds maximum ${maxSize} bytes for type "${type}"`,
        },
      });
    }

    // ── Generate Snowflake ID + storage key ───────────────────────────────
    const id = SnowflakeUtil.instance.generate();
    const ext = mime.split('/')[1] ?? 'bin';
    const storageKey = `uploads/${ownerId}/${id}.${ext}`;

    // ── Create media row status=pending ───────────────────────────────────
    const media = this.mediaRepo.create({
      id,
      ownerId,
      type,
      mime: mime.toLowerCase(),
      status: 'pending',
      storageKey,
      variants: {},
    });
    await this.mediaRepo.save(media);

    // ── Generate presigned PUT URL ─────────────────────────────────────────
    const { uploadUrl } = await this.storage.getPresignedUploadUrl(
      storageKey,
      mime,
      UPLOAD_URL_EXPIRY,
    );

    this.logger.debug(`Created media ${id} for owner ${ownerId}, key: ${storageKey}`);

    return { mediaId: id, uploadUrl };
  }

  // ── POST /api/v1/media/:id/finalize ──────────────────────────────────────

  async finalize(mediaId: string, requesterId: string): Promise<MediaDto> {
    const media = await this.findOwned(mediaId, requesterId);

    if (media.status !== 'pending') {
      // Idempotent — allow re-finalize if still pending; otherwise reject
      if (media.status === 'processing' || media.status === 'ready') {
        return toMediaDto(media);
      }
      // Failed — allow retry
    }

    // Transition to processing
    await this.mediaRepo.update(mediaId, { status: 'processing' });

    // Enqueue processing job (idempotent by jobId)
    await this.mediaQueue
      .add(
        'media.process',
        { mediaId, ownerId: requesterId },
        {
          jobId: `media-process-${mediaId}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        },
      )
      .catch((err) =>
        this.logger.warn(`Failed to enqueue media.process for ${mediaId}: ${String(err)}`),
      );

    return toMediaDto({ ...media, status: 'processing' });
  }

  // ── GET /api/v1/media/:id ─────────────────────────────────────────────────

  async findOne(mediaId: string, requesterId: string): Promise<MediaDto> {
    const media = await this.findOwned(mediaId, requesterId);
    return toMediaDto(media);
  }

  // ── PATCH /api/v1/media/:id ───────────────────────────────────────────────

  async updateAltText(
    mediaId: string,
    requesterId: string,
    dto: UpdateMediaDto,
  ): Promise<MediaDto> {
    const media = await this.findOwned(mediaId, requesterId);

    if (dto.altText !== undefined) {
      await this.mediaRepo.update(mediaId, { altText: dto.altText });
      media.altText = dto.altText;
    }

    return toMediaDto(media);
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  /** Load a media row and enforce ownership */
  private async findOwned(mediaId: string, requesterId: string): Promise<Media> {
    const media = await this.mediaRepo.findOne({ where: { id: mediaId } });
    if (!media) {
      throw new NotFoundException({
        error: { code: 'MEDIA_NOT_FOUND', message: 'Media not found' },
      });
    }
    if (media.ownerId !== requesterId) {
      throw new ForbiddenException({
        error: { code: 'FORBIDDEN', message: 'You do not own this media item' },
      });
    }
    return media;
  }

  /**
   * Validate that a list of mediaIds are all ready, owned by the given user,
   * and satisfy post-level count/type limits.
   *
   * Called by PostsService.create() at the media-attach seam.
   *
   * Rules:
   *  - Each id must exist with status=ready
   *  - Each id must be owned by postAuthorId
   *  - Max 4 images per post (type=image)
   *  - Max 1 video or gif per post; cannot be mixed with images
   *  - No mixing of video+gif in the same post
   */
  async validateAndLoadForPost(mediaIds: string[], postAuthorId: string): Promise<Media[]> {
    if (mediaIds.length === 0) return [];

    const medias = await this.mediaRepo.findByIds(mediaIds);

    // Check all exist
    const foundIds = new Set(medias.map((m) => m.id));
    const missing = mediaIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new BadRequestException({
        error: {
          code: 'MEDIA_NOT_FOUND',
          message: `Media not found: ${missing.join(', ')}`,
        },
      });
    }

    // Validate ownership + status
    for (const m of medias) {
      if (m.ownerId !== postAuthorId) {
        throw new ForbiddenException({
          error: {
            code: 'MEDIA_NOT_OWNED',
            message: `Media ${m.id} is not owned by you`,
          },
        });
      }
      if (m.status !== 'ready') {
        throw new BadRequestException({
          error: {
            code: 'MEDIA_NOT_READY',
            message: `Media ${m.id} is not ready (status: ${m.status})`,
          },
        });
      }
    }

    // Count limits
    const images = medias.filter((m) => m.type === 'image');
    const videos = medias.filter((m) => m.type === 'video');
    const gifs = medias.filter((m) => m.type === 'gif');

    if (images.length > MAX_IMAGES_PER_POST) {
      throw new BadRequestException({
        error: {
          code: 'TOO_MANY_IMAGES',
          message: `Maximum ${MAX_IMAGES_PER_POST} images per post`,
        },
      });
    }

    if (videos.length + gifs.length > 1) {
      throw new BadRequestException({
        error: {
          code: 'TOO_MANY_VIDEOS',
          message: 'Maximum 1 video or GIF per post',
        },
      });
    }

    if ((videos.length > 0 || gifs.length > 0) && images.length > 0) {
      throw new BadRequestException({
        error: {
          code: 'MIXED_MEDIA_TYPES',
          message: 'Cannot mix video/GIF with images in the same post',
        },
      });
    }

    // All IDs verified to exist above — safe to assert
    return mediaIds.map((id) => medias.find((m) => m.id === id) as Media);
  }
}
