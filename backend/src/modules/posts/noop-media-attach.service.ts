import { Injectable } from '@nestjs/common';
import type { AttachedMediaItem, MediaAttachPort } from './media-attach.port';

/**
 * NoopMediaAttachService — default implementation of MediaAttachPort.
 * Returns empty array for all media IDs (no validation, no attachment), so
 * uploaded media is not linked to posts. This seam is currently UNWIRED — see
 * docs/known-limitations.md. The real impl is MediaAttachAdapter (MediaModule);
 * to enable it, bind MEDIA_ATTACH_PORT -> MediaAttachAdapter in PostsModule
 * (breaking the posts<->media cycle), NOT via an "AppModule override" (which
 * does not work for module-scoped tokens).
 */
@Injectable()
export class NoopMediaAttachService implements MediaAttachPort {
  async validateAndLoad(_mediaIds: string[], _postAuthorId: string): Promise<AttachedMediaItem[]> {
    return [];
  }
}
