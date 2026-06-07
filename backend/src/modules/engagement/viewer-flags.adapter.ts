import { Injectable } from '@nestjs/common';
import { PostViewerDto } from '../posts/dto/post.dto';
import { ViewerFlagsPort } from '../posts/viewer-flags.port';
import { ViewerFlagsService } from './viewer-flags.service';

/**
 * ViewerFlagsAdapter — implements ViewerFlagsPort by delegating to ViewerFlagsService.
 *
 * This adapter lives in EngagementModule and is provided to PostsModule via
 * the VIEWER_FLAGS_PORT injection token. It avoids a circular module dependency
 * because PostsModule declares the port interface, EngagementModule provides
 * the implementation.
 */
@Injectable()
export class ViewerFlagsAdapter implements ViewerFlagsPort {
  constructor(private readonly viewerFlagsService: ViewerFlagsService) {}

  async hydrate(viewerId: string | null, postIds: string[]): Promise<Map<string, PostViewerDto>> {
    return this.viewerFlagsService.hydrate(viewerId, postIds);
  }

  async hydrateOne(viewerId: string | null, postId: string): Promise<PostViewerDto> {
    return this.viewerFlagsService.hydrateOne(viewerId, postId);
  }
}
