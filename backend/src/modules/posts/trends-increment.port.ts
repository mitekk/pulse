/**
 * TrendsIncrementPort — seam for incrementing trending counters.
 *
 * Default: NoopTrendsIncrementService (no-op).
 * AppModule overrides with TrendsService from HashtagsModule.
 *
 * This pattern avoids a circular dependency between PostsModule → HashtagsModule.
 */

export const TRENDS_INCREMENT_PORT = 'TRENDS_INCREMENT_PORT';

export interface TrendsIncrementPort {
  incrementTags(tags: string[]): Promise<void>;
}
