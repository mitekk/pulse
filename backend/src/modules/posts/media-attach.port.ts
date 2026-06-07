/**
 * MediaAttachPort — interface for validating and attaching media to posts.
 *
 * Implemented by MediaModule; PostsModule depends only on this interface
 * (noop default) to avoid a circular import with MediaModule.
 */
export const MEDIA_ATTACH_PORT = 'MEDIA_ATTACH_PORT';

export interface AttachedMediaItem {
  id: string;
  type: 'image' | 'gif' | 'video';
  mime: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  altText: string | null;
  variants: {
    thumb?: string;
    small?: string;
    medium?: string;
    large?: string;
    mp4?: string;
    poster?: string;
  };
}

export interface MediaAttachPort {
  /**
   * Validate that each mediaId is status=ready, owned by postAuthorId,
   * and within post-level count/type limits.
   * Returns ordered list of AttachedMediaItems (in mediaIds order).
   * Throws BadRequestException or ForbiddenException on violation.
   */
  validateAndLoad(mediaIds: string[], postAuthorId: string): Promise<AttachedMediaItem[]>;
}
