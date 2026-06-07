import { Injectable } from '@nestjs/common';
import type { AttachedMediaItem, MediaAttachPort } from './media-attach.port';

/**
 * NoopMediaAttachService — default implementation of MediaAttachPort.
 * Returns empty array for all media IDs (no validation, no attachment).
 * MediaModule replaces this with MediaAttachAdapter in AppModule scope.
 */
@Injectable()
export class NoopMediaAttachService implements MediaAttachPort {
  async validateAndLoad(_mediaIds: string[], _postAuthorId: string): Promise<AttachedMediaItem[]> {
    return [];
  }
}
