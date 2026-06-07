import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: posts, mentions, hashtags, post_hashtags tables.
 *
 * posts:
 *   - Snowflake BIGINT PK (time-ordered, cursor-friendly).
 *   - author_id → users ON DELETE CASCADE.
 *   - Self-referential FKs: reply_to_id, reply_root_id, repost_of_id, quote_of_id (all nullable).
 *   - conversation_id = root post id; groups a thread.
 *   - reply_policy enum stored as VARCHAR with CHECK constraint.
 *   - Denorm counters: reply_count, repost_count, like_count, bookmark_count, view_count.
 *   - GIN tsvector FTS index on text.
 *   - Partial UNIQUE(author_id, repost_of_id) WHERE repost_of_id IS NOT NULL.
 *   - Soft-delete via deleted_at.
 */
export class CreatePosts1704067200004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── posts ─────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE posts (
        id              BIGINT      NOT NULL,
        author_id       UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        text            TEXT,
        lang            VARCHAR(10),
        reply_to_id     BIGINT      REFERENCES posts (id) ON DELETE SET NULL,
        reply_root_id   BIGINT      REFERENCES posts (id) ON DELETE SET NULL,
        conversation_id BIGINT,
        repost_of_id    BIGINT      REFERENCES posts (id) ON DELETE SET NULL,
        quote_of_id     BIGINT      REFERENCES posts (id) ON DELETE SET NULL,
        reply_policy    VARCHAR(10) NOT NULL DEFAULT 'everyone'
                          CHECK (reply_policy IN ('everyone', 'following', 'mentioned')),
        reply_count     INTEGER     NOT NULL DEFAULT 0,
        repost_count    INTEGER     NOT NULL DEFAULT 0,
        like_count      INTEGER     NOT NULL DEFAULT 0,
        bookmark_count  INTEGER     NOT NULL DEFAULT 0,
        view_count      INTEGER     NOT NULL DEFAULT 0,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at      TIMESTAMPTZ,
        PRIMARY KEY (id)
      )
    `);

    // User timeline: posts by author newest first
    await queryRunner.query(`CREATE INDEX posts_author_id_idx ON posts (author_id, id DESC)`);

    // Thread replies: all direct replies to a post
    await queryRunner.query(`
      CREATE INDEX posts_reply_to_id_idx ON posts (reply_to_id, id)
        WHERE reply_to_id IS NOT NULL
    `);

    // Thread conversation: all posts in a conversation
    await queryRunner.query(`
      CREATE INDEX posts_conversation_id_idx ON posts (conversation_id, id)
        WHERE conversation_id IS NOT NULL
    `);

    // Repost lookup
    await queryRunner.query(`
      CREATE INDEX posts_repost_of_id_idx ON posts (repost_of_id)
        WHERE repost_of_id IS NOT NULL
    `);

    // Quote lookup
    await queryRunner.query(`
      CREATE INDEX posts_quote_of_id_idx ON posts (quote_of_id)
        WHERE quote_of_id IS NOT NULL
    `);

    // Partial UNIQUE: one repost per (author, original post)
    await queryRunner.query(`
      CREATE UNIQUE INDEX posts_author_repost_unique_idx
        ON posts (author_id, repost_of_id)
        WHERE repost_of_id IS NOT NULL
    `);

    // Full-text search: GIN index on tsvector of post text
    await queryRunner.query(`
      CREATE INDEX posts_fts_idx ON posts
        USING GIN (to_tsvector('english', coalesce(text, '')))
    `);

    // ── mentions ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE mentions (
        post_id           BIGINT  NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
        mentioned_user_id UUID    NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        PRIMARY KEY (post_id, mentioned_user_id)
      )
    `);

    // Reverse lookup: posts that mention user X
    await queryRunner.query(
      `CREATE INDEX mentions_mentioned_user_id_idx ON mentions (mentioned_user_id, post_id DESC)`,
    );

    // ── hashtags ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE hashtags (
        id         BIGINT      NOT NULL,
        tag        CITEXT      NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (id),
        UNIQUE (tag)
      )
    `);

    // ── post_hashtags ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE post_hashtags (
        post_id    BIGINT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
        hashtag_id BIGINT NOT NULL REFERENCES hashtags (id) ON DELETE CASCADE,
        PRIMARY KEY (post_id, hashtag_id)
      )
    `);

    // Tag timeline: all posts for hashtag X newest first
    await queryRunner.query(
      `CREATE INDEX post_hashtags_hashtag_post_idx ON post_hashtags (hashtag_id, post_id DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS post_hashtags`);
    await queryRunner.query(`DROP TABLE IF EXISTS hashtags`);
    await queryRunner.query(`DROP TABLE IF EXISTS mentions`);
    await queryRunner.query(`DROP TABLE IF EXISTS posts`);
  }
}
