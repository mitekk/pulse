import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { Media } from './media.entity';
import { STORAGE_PORT, StoragePort, PresignedPost } from '../../infra/storage/storage.port';
import { SnowflakeUtil } from '../../common/utils/snowflake.util';
import { UploadUrlDto } from './dto/upload-url.dto';
import { UpdateMediaDto } from './dto/update-media.dto';
import { MediaDto } from './dto/media.dto';
import { MediaLimits } from './media-limits';
import { QuotaService } from './quota.service';
import { mediaToDto } from './media-url.util';

const UPLOAD_POST_EXPIRY = 900; // 15 minutes — keep in sync with the reaper's pending TTL

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    @InjectRepository(Media) private readonly mediaRepo: Repository<Media>,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @InjectQueue('media') private readonly mediaQueue: Queue,
    private readonly limits: MediaLimits,
    private readonly quota: QuotaService,
  ) {}

  // ── POST /api/v1/media/uploads ────────────────────────────────────────────

  /**
   * Reserve global quota and return a presigned POST. The POST policy caps
   * content-length to maxBytesPerFile and pins Content-Type, so MinIO rejects an
   * oversize/wrong-type upload at the edge even if the client bypasses the UI.
   */
  async createUploadUrl(
    ownerId: string,
    dto: UploadUrlDto,
  ): Promise<{ mediaId: string; upload: PresignedPost }> {
    const { type, size } = dto;
    const mime = dto.mime.toLowerCase();

    if (type === 'video') {
      throw new BadRequestException({
        error: { code: 'VIDEO_NOT_SUPPORTED', message: 'Video uploads are not enabled.' },
      });
    }
    if (!this.limits.isMimeAllowed(mime)) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_MIME_TYPE',
          message: `MIME type "${mime}" is not allowed. Allowed: ${this.limits.allowedMimes.join(', ')}`,
        },
      });
    }
    if (size > this.limits.maxBytesPerFile) {
      throw new HttpException(
        {
          error: {
            code: 'FILE_TOO_LARGE',
            message: `File size ${size} exceeds the ${this.limits.maxBytesPerFile}-byte per-file limit.`,
          },
        },
        HttpStatus.PAYLOAD_TOO_LARGE, // 413
      );
    }

    // Atomically reserve against the global cap (throws 507 if it would exceed).
    await this.quota.reserve(size);
    try {
      const id = SnowflakeUtil.instance.generate();
      const ext = mime.split('/')[1] ?? 'bin';
      const storageKey = `media/${ownerId}/${randomUUID()}/original.${ext}`;

      const media = this.mediaRepo.create({
        id,
        ownerId,
        type,
        mime,
        status: 'pending',
        storageKey,
        byteSize: size,
        variants: {},
      });
      await this.mediaRepo.save(media);

      const upload = await this.storage.createPresignedPost(storageKey, {
        maxBytes: this.limits.maxBytesPerFile,
        contentType: mime,
        expiresIn: UPLOAD_POST_EXPIRY,
      });

      this.logger.debug(`Reserved ${size}B for media ${id} (owner ${ownerId})`);
      return { mediaId: id, upload };
    } catch (err) {
      // Roll back the reservation if we failed to create the row / presign.
      await this.quota.release(size);
      throw err;
    }
  }

  // ── POST /api/v1/media/:id/finalize ───────────────────────────────────────

  /**
   * Verify the object actually landed, commit the reservation to its real size,
   * and enqueue processing. Idempotent once processing/ready.
   */
  async finalize(mediaId: string, requesterId: string): Promise<MediaDto> {
    const media = await this.findOwned(mediaId, requesterId);

    if (media.status === 'processing' || media.status === 'ready') {
      return mediaToDto(media, this.storage); // idempotent
    }

    const head = media.storageKey ? await this.storage.headObject(media.storageKey) : null;
    if (!head) {
      throw new BadRequestException({
        error: { code: 'MEDIA_NOT_UPLOADED', message: 'No uploaded object found for this media.' },
      });
    }
    if (head.size > this.limits.maxBytesPerFile) {
      await this.failAndRelease(media);
      throw new HttpException(
        { error: { code: 'FILE_TOO_LARGE', message: 'Uploaded file exceeds the per-file limit.' } },
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    // Commit reservation to the actual size (client-declared was an estimate).
    await this.quota.adjust(head.size - media.byteSize);
    await this.mediaRepo.update(mediaId, {
      status: 'processing',
      byteSize: head.size,
      committedAt: new Date(),
    });

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

    return mediaToDto({ ...media, status: 'processing', byteSize: head.size }, this.storage);
  }

  // ── GET /api/v1/media/:id ─────────────────────────────────────────────────

  async findOne(mediaId: string, requesterId: string): Promise<MediaDto> {
    const media = await this.findOwned(mediaId, requesterId);
    return mediaToDto(media, this.storage);
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
    return mediaToDto(media, this.storage);
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

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

  private async failAndRelease(media: Media): Promise<void> {
    await this.mediaRepo.update(media.id, { status: 'failed' });
    await this.quota.release(media.byteSize);
  }

  /**
   * Authoritative per-post media check (the attach seam called by PostsService).
   * The presigned-POST policy caps each FILE; the per-POST total + count + type
   * rules are enforced here. Rules: ≤ maxFilesPerPost, all ready+owned, total
   * bytes ≤ maxBytesPerPost, no video (deferred), ≤ 1 GIF, no GIF+image mixing.
   */
  async validateAndLoadForPost(mediaIds: string[], postAuthorId: string): Promise<Media[]> {
    if (mediaIds.length === 0) return [];

    if (mediaIds.length > this.limits.maxFilesPerPost) {
      throw new HttpException(
        {
          error: {
            code: 'TOO_MANY_FILES',
            message: `Maximum ${this.limits.maxFilesPerPost} media files per post.`,
          },
        },
        HttpStatus.UNPROCESSABLE_ENTITY, // 422
      );
    }

    const medias = await this.mediaRepo.findBy({ id: In(mediaIds) });
    const foundIds = new Set(medias.map((m) => m.id));
    const missing = mediaIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new BadRequestException({
        error: { code: 'MEDIA_NOT_FOUND', message: `Media not found: ${missing.join(', ')}` },
      });
    }

    for (const m of medias) {
      if (m.ownerId !== postAuthorId) {
        throw new ForbiddenException({
          error: { code: 'MEDIA_NOT_OWNED', message: `Media ${m.id} is not owned by you` },
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
      if (m.type === 'video') {
        throw new BadRequestException({
          error: { code: 'VIDEO_NOT_SUPPORTED', message: 'Video uploads are not enabled.' },
        });
      }
    }

    const totalBytes = medias.reduce((sum, m) => sum + m.byteSize, 0);
    if (totalBytes > this.limits.maxBytesPerPost) {
      throw new HttpException(
        {
          error: {
            code: 'POST_MEDIA_TOO_LARGE',
            message: `Total media (${totalBytes}B) exceeds the ${this.limits.maxBytesPerPost}-byte per-post limit.`,
          },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const gifs = medias.filter((m) => m.type === 'gif');
    const images = medias.filter((m) => m.type === 'image');
    if (gifs.length > 1) {
      throw new BadRequestException({
        error: { code: 'TOO_MANY_GIFS', message: 'Maximum 1 GIF per post.' },
      });
    }
    if (gifs.length > 0 && images.length > 0) {
      throw new BadRequestException({
        error: {
          code: 'MIXED_MEDIA_TYPES',
          message: 'Cannot mix a GIF with images in the same post.',
        },
      });
    }

    return mediaIds.map((id) => medias.find((m) => m.id === id) as Media);
  }
}
