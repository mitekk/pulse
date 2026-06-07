import { Injectable } from '@nestjs/common';
import { PostViewerDto } from './dto/post.dto';
import { ViewerFlagsPort } from './viewer-flags.port';

/**
 * NoopViewerFlagsService — default implementation of ViewerFlagsPort.
 * Returns all flags as false. Used by PostsModule before EngagementModule replaces it.
 *
 * Phase 4 (EngagementModule) replaces this with ViewerFlagsAdapter which delegates
 * to ViewerFlagsService (Redis sets + DB fallback).
 */
@Injectable()
export class NoopViewerFlagsService implements ViewerFlagsPort {
  async hydrate(_viewerId: string | null, postIds: string[]): Promise<Map<string, PostViewerDto>> {
    const result = new Map<string, PostViewerDto>();
    for (const id of postIds) {
      result.set(id, { liked: false, reposted: false, bookmarked: false });
    }
    return result;
  }

  async hydrateOne(_viewerId: string | null, _postId: string): Promise<PostViewerDto> {
    return { liked: false, reposted: false, bookmarked: false };
  }
}
