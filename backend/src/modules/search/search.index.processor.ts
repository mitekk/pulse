import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

export interface SearchIndexJobData {
  action: 'upsert' | 'delete';
  postId: string;
  authorId?: string;
}

/**
 * SearchIndexProcessor — processes `search.index` jobs from the `search` queue.
 *
 * NOTE: The posts table uses a FUNCTIONAL GIN expression index:
 *   CREATE INDEX ... USING GIN (to_tsvector('english', coalesce(text, '')))
 *
 * Postgres maintains this index automatically on INSERT/UPDATE/DELETE.
 * Therefore this processor does NOT need to update any stored tsvector column.
 *
 * This processor exists solely as the external-engine swap seam (ADR-0005).
 * When the team migrates to Elasticsearch/OpenSearch, this processor will call
 * the external indexing API instead of this no-op body.
 *
 * On upsert: log intent (index maintained by Postgres expression index).
 * On delete: log intent (FTS index entry removed automatically by Postgres).
 */
@Processor('search')
export class SearchIndexProcessor extends WorkerHost {
  private readonly logger = new Logger(SearchIndexProcessor.name);

  async process(job: Job<SearchIndexJobData>): Promise<void> {
    const { action, postId } = job.data;

    if (action === 'upsert') {
      this.logger.debug(
        `[search.index] upsert postId=${postId} — Postgres GIN expression index auto-updated`,
      );
    } else if (action === 'delete') {
      this.logger.debug(
        `[search.index] delete postId=${postId} — Postgres GIN expression index auto-purged`,
      );
    } else {
      this.logger.warn(`[search.index] Unknown action=${String(action)} postId=${postId}`);
    }

    // Future: await externalSearchClient.index({ id: postId, ... })
  }
}
