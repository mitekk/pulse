import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SearchOptions, SearchPort, SuggestOptions, SuggestResult } from './search.port';
import { buildTsQuery } from './search-query-parser';

/**
 * PostgresSearchAdapter — concrete implementation of SearchPort using:
 *   - GIN tsvector index on posts.text for full-text search (posts table)
 *   - pg_trgm GIN index on users.handle / users.display_name for people search
 *
 * NOTE: The posts table has a FUNCTIONAL GIN index:
 *   CREATE INDEX idx_posts_fts ON posts USING GIN (to_tsvector('english', coalesce(text, '')))
 *
 * This is a computed expression index — Postgres maintains it automatically on
 * insert/update. The `search.index` BullMQ job is therefore a light no-op seam
 * kept only as the external-engine swap point (ADR-0005). No explicit tsvector
 * column update is needed in that processor.
 *
 * Cursor encoding:
 *   - top/media:  base64url of JSON `{ score: number, id: string }`
 *   - latest:     base64url of JSON `{ id: string }`
 *   - people:     base64url of JSON `{ id: string }`
 */
@Injectable()
export class PostgresSearchAdapter implements SearchPort {
  private readonly logger = new Logger(PostgresSearchAdapter.name);

  constructor(private readonly dataSource: DataSource) {}

  async search(options: SearchOptions): Promise<{
    postIds: string[];
    userIds: string[];
    nextCursor: string | null;
  }> {
    const { query, type, limit } = options;
    const tsQuery = buildTsQuery(query);

    if (!tsQuery) {
      return { postIds: [], userIds: [], nextCursor: null };
    }

    switch (type) {
      case 'people':
        return this.searchPeople(tsQuery, options);
      case 'latest':
        return this.searchLatest(tsQuery, options, limit);
      case 'media':
        return this.searchMedia(tsQuery, options, limit);
      case 'top':
      default:
        return this.searchTop(tsQuery, options, limit);
    }
  }

  private async searchTop(
    tsQuery: string,
    options: SearchOptions,
    limit: number,
  ): Promise<{ postIds: string[]; userIds: string[]; nextCursor: string | null }> {
    const { cursor } = options;
    let cursorScore: number | null = null;
    let cursorId: string | null = null;

    if (cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
          score?: number;
          id?: string;
        };
        cursorScore = decoded.score ?? null;
        cursorId = decoded.id ?? null;
      } catch {
        // Invalid cursor — ignore, start from beginning
      }
    }

    // Blended relevance: ts_rank + engagement counters (like_count, repost_count, reply_count)
    // Use a computed score to allow cursor-based pagination without OFFSET.
    const params: unknown[] = [tsQuery, limit + 1];
    let cursorClause = '';
    if (cursorScore !== null && cursorId !== null) {
      params.push(cursorScore, cursorId);
      cursorClause = `AND (
        ts_rank(to_tsvector('english', coalesce(p.text, '')), plainto_tsquery('english', $1))
        * (1 + p.like_count * 0.5 + p.repost_count * 0.3 + p.reply_count * 0.1)
        < $${params.length - 1}
        OR (
          ts_rank(to_tsvector('english', coalesce(p.text, '')), plainto_tsquery('english', $1))
          * (1 + p.like_count * 0.5 + p.repost_count * 0.3 + p.reply_count * 0.1)
          = $${params.length - 1}
          AND p.id < $${params.length}
        )
      )`;
    }

    const rows = await this.dataSource.query<{ post_id: string; score: number }[]>(
      `SELECT
        p.id AS post_id,
        (
          ts_rank(to_tsvector('english', coalesce(p.text, '')), plainto_tsquery('english', $1))
          * (1 + p.like_count * 0.5 + p.repost_count * 0.3 + p.reply_count * 0.1)
        ) AS score
      FROM posts p
      WHERE
        p.deleted_at IS NULL
        AND p.text IS NOT NULL
        AND to_tsvector('english', coalesce(p.text, '')) @@ plainto_tsquery('english', $1)
        ${cursorClause}
      ORDER BY score DESC, p.id DESC
      LIMIT $2`,
      params,
    );

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const lastRow = page[page.length - 1];
    const nextCursor =
      hasMore && lastRow
        ? Buffer.from(JSON.stringify({ score: lastRow.score, id: lastRow.post_id })).toString(
            'base64url',
          )
        : null;

    return { postIds: page.map((r) => r.post_id), userIds: [], nextCursor };
  }

  private async searchLatest(
    tsQuery: string,
    options: SearchOptions,
    limit: number,
  ): Promise<{ postIds: string[]; userIds: string[]; nextCursor: string | null }> {
    const { cursor } = options;
    let cursorId: string | null = null;

    if (cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
          id?: string;
        };
        cursorId = decoded.id ?? null;
      } catch {
        // Invalid cursor — ignore
      }
    }

    const params: unknown[] = [tsQuery, limit + 1];
    let cursorClause = '';
    if (cursorId) {
      params.push(cursorId);
      cursorClause = `AND p.id < $${params.length}`;
    }

    const rows = await this.dataSource.query<{ post_id: string }[]>(
      `SELECT p.id AS post_id
      FROM posts p
      WHERE
        p.deleted_at IS NULL
        AND p.text IS NOT NULL
        AND to_tsvector('english', coalesce(p.text, '')) @@ plainto_tsquery('english', $1)
        ${cursorClause}
      ORDER BY p.id DESC
      LIMIT $2`,
      params,
    );

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const lastRow = page[page.length - 1];
    const nextCursor =
      hasMore && lastRow
        ? Buffer.from(JSON.stringify({ id: lastRow.post_id })).toString('base64url')
        : null;

    return { postIds: page.map((r) => r.post_id), userIds: [], nextCursor };
  }

  private async searchMedia(
    tsQuery: string,
    options: SearchOptions,
    limit: number,
  ): Promise<{ postIds: string[]; userIds: string[]; nextCursor: string | null }> {
    const { cursor } = options;
    let cursorId: string | null = null;

    if (cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
          id?: string;
        };
        cursorId = decoded.id ?? null;
      } catch {
        // Invalid cursor — ignore
      }
    }

    const params: unknown[] = [tsQuery, limit + 1];
    let cursorClause = '';
    if (cursorId) {
      params.push(cursorId);
      cursorClause = `AND p.id < $${params.length}`;
    }

    // Posts with media: join to media table via post_media junction (or posts.media_ids if stored differently)
    // Architecture: media are linked via MediaModule's post_media join table or embedded in posts
    // We look for posts that have at least one associated media item
    const rows = await this.dataSource.query<{ post_id: string }[]>(
      `SELECT DISTINCT p.id AS post_id
      FROM posts p
      INNER JOIN post_media pm ON pm.post_id = p.id
      WHERE
        p.deleted_at IS NULL
        AND p.text IS NOT NULL
        AND to_tsvector('english', coalesce(p.text, '')) @@ plainto_tsquery('english', $1)
        ${cursorClause}
      ORDER BY post_id DESC
      LIMIT $2`,
      params,
    );

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const lastRow = page[page.length - 1];
    const nextCursor =
      hasMore && lastRow
        ? Buffer.from(JSON.stringify({ id: lastRow.post_id })).toString('base64url')
        : null;

    return { postIds: page.map((r) => r.post_id), userIds: [], nextCursor };
  }

  private async searchPeople(
    tsQuery: string,
    options: SearchOptions,
  ): Promise<{ postIds: string[]; userIds: string[]; nextCursor: string | null }> {
    const { limit, cursor } = options;
    let cursorId: string | null = null;

    if (cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
          id?: string;
        };
        cursorId = decoded.id ?? null;
      } catch {
        // Invalid cursor — ignore
      }
    }

    // pg_trgm similarity search on handle + display_name
    // The baseline migration enables pg_trgm extension
    const params: unknown[] = [tsQuery, tsQuery, limit + 1];
    let cursorClause = '';
    if (cursorId) {
      params.push(cursorId);
      cursorClause = `AND u.id::text < $${params.length}`;
    }

    const rows = await this.dataSource.query<{ user_id: string; sim: number }[]>(
      `SELECT
        u.id AS user_id,
        GREATEST(
          similarity(u.handle, $1),
          similarity(u.display_name, $2)
        ) AS sim
      FROM users u
      WHERE
        u.deleted_at IS NULL
        AND (
          u.handle ILIKE '%' || $1 || '%'
          OR u.display_name ILIKE '%' || $2 || '%'
        )
        ${cursorClause}
      ORDER BY sim DESC, u.id DESC
      LIMIT $3`,
      params,
    );

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const lastRow = page[page.length - 1];
    const nextCursor =
      hasMore && lastRow
        ? Buffer.from(JSON.stringify({ id: lastRow.user_id })).toString('base64url')
        : null;

    return { postIds: [], userIds: page.map((r) => r.user_id), nextCursor };
  }

  async suggest(options: SuggestOptions): Promise<SuggestResult> {
    const { query, limit } = options;
    if (!query.trim()) {
      return { userIds: [], tags: [] };
    }

    // Parallel: users by trigram + tags prefix-match
    const [userRows, tagRows] = await Promise.all([
      this.dataSource.query<{ user_id: string }[]>(
        `SELECT u.id AS user_id
        FROM users u
        WHERE
          u.deleted_at IS NULL
          AND (
            u.handle ILIKE $1 || '%'
            OR u.display_name ILIKE '%' || $1 || '%'
          )
        ORDER BY u.followers_count DESC
        LIMIT $2`,
        [query.trim(), Math.ceil(limit / 2)],
      ),
      this.dataSource.query<{ tag: string }[]>(
        `SELECT h.tag
        FROM hashtags h
        WHERE h.tag ILIKE $1 || '%'
        ORDER BY h.id DESC
        LIMIT $2`,
        [query.trim().replace(/^#/, ''), Math.ceil(limit / 2)],
      ),
    ]);

    return {
      userIds: userRows.map((r) => r.user_id),
      tags: tagRows.map((r) => r.tag),
    };
  }
}
