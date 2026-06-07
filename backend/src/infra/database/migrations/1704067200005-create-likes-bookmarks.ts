import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: likes, bookmarks tables.
 *
 * likes:
 *   - Composite PK (user_id, post_id) — prevents duplicate likes at DB level.
 *   - user_id → users ON DELETE CASCADE.
 *   - post_id → posts ON DELETE CASCADE.
 *   - Index (post_id) — for "who liked this post" queries.
 *   - Index (user_id, post_id) — for viewer-flag lookups (covered by PK but explicit).
 *   - created_at for cursor pagination of "user's liked posts" timeline.
 *
 * bookmarks:
 *   - Composite PK (user_id, post_id) — prevents duplicate bookmarks at DB level.
 *   - user_id → users ON DELETE CASCADE.
 *   - post_id → posts ON DELETE CASCADE.
 *   - Index (user_id, post_id DESC) — cursor-paginated bookmark list per user.
 *   - Bookmarks are private; no index on (post_id) alone.
 *   - created_at for cursor pagination.
 */
export class CreateLikesBookmarks1704067200005 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── likes ──────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE likes (
        user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        post_id    BIGINT      NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, post_id)
      )
    `);

    // "Who liked post X?" — for GET /posts/:id/likes
    await queryRunner.query(`CREATE INDEX likes_post_id_idx ON likes (post_id, created_at DESC)`);

    // ── bookmarks ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE bookmarks (
        user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        post_id    BIGINT      NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, post_id)
      )
    `);

    // "User's bookmarks, newest first" — for GET /bookmarks
    await queryRunner.query(
      `CREATE INDEX bookmarks_user_id_idx ON bookmarks (user_id, created_at DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS bookmarks`);
    await queryRunner.query(`DROP TABLE IF EXISTS likes`);
  }
}
