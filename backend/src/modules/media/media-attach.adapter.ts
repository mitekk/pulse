import { Injectable } from '@nestjs/common';
import type { AttachedMediaItem, MediaAttachPort } from '../posts/media-attach.port';
import { MediaService } from './media.service';

/**
 * MediaAttachAdapter — real implementation of MediaAttachPort.
 * Delegates to MediaService.validateAndLoadForPost.
 * Registered globally in MediaModule so PostsService picks it up.
 */
@Injectable()
export class MediaAttachAdapter implements MediaAttachPort {
  constructor(private readonly mediaService: MediaService) {}

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
      variants: m.variants,
    }));
  }
}
