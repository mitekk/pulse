import { PostViewerDto } from './dto/post.dto';

/**
 * ViewerFlagsPort — interface for hydrating viewer engagement flags on posts.
 *
 * Defined in PostsModule so PostsService can inject it without a circular dependency.
 * EngagementModule provides the real implementation (ViewerFlagsAdapter) that delegates
 * to ViewerFlagsService.
 *
 * Default (NoopViewerFlagsService) returns all false — used in PostsModule before
 * EngagementModule is loaded, and in unit tests that don't need real flags.
 */
export const VIEWER_FLAGS_PORT = 'VIEWER_FLAGS_PORT';

export interface ViewerFlagsPort {
  /**
   * Hydrate viewer flags for a list of post IDs.
   * Returns a map: postId → { liked, reposted, bookmarked }.
   */
  hydrate(viewerId: string | null, postIds: string[]): Promise<Map<string, PostViewerDto>>;

  /**
   * Hydrate viewer flags for a single post.
   */
  hydrateOne(viewerId: string | null, postId: string): Promise<PostViewerDto>;
}
