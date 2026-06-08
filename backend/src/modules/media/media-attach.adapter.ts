import { Inject, Injectable } from '@nestjs/common';
import type { AttachedMediaItem, MediaAttachPort } from '../posts/media-attach.port';
import { MediaService } from './media.service';
import { STORAGE_PORT, StoragePort } from '../../infra/storage/storage.port';
import { serializeVariants } from './media-url.util';

/**
 * MediaAttachAdapter — real implementation of MediaAttachPort.
 * Validates via MediaService and serializes variant keys → public URLs so the
 * post-create response carries usable media URLs.
 */
@Injectable()
export class MediaAttachAdapter implements MediaAttachPort {
  constructor(
    private readonly mediaService: MediaService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  async validateAndLoad(mediaIds: string[], postAuthorId: string): Promise<AttachedMediaItem[]> {
    const medias = await this.mediaService.validateAndLoadForPost(mediaIds, postAuthorId);
    return medias.map((m) => ({
      id: m.id,
      type: m.type,
      mime: m.mime,
      width: m.width,
      height: m.height,
      durationMs: m.durationMs,
      altText: m.altText,
      variants: serializeVariants(m.variants, this.storage),
    }));
  }
}
