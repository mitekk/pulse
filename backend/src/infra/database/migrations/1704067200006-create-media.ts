import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: media, post_media tables + deferred FK constraints on users
 *
 * Design decisions:
 * - media.id is Snowflake BIGINT (stored as BIGINT, serialized as string in DTOs)
 * - owner_id → users ON DELETE CASCADE (media owned by user; delete cascades)
 * - type and status use VARCHAR with CHECK constraints (portable, no ALTER TYPE needed)
 * - variants JSONB: { thumb?, small?, medium?, large?, mp4?, poster? } — public URLs
 * - post_media: composite PK (post_id, media_id), position for ordering
 * - users.avatar_media_id / users.banner_media_id FK added here (deferred from users migration)
 *   using ON DELETE SET NULL — avatar/banner reset to null if media is deleted
 */
export class CreateMedia1704067200006 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── media ─────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE media (
        id            BIGINT        NOT NULL,
        owner_id      UUID          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        type          VARCHAR(10)   NOT NULL
                        CHECK (type IN ('image', 'gif', 'video')),
        status        VARCHAR(20)   NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
        storage_key   VARCHAR(512),
        mime          VARCHAR(127)  NOT NULL,
        width         INTEGER,
        height        INTEGER,
        duration_ms   INTEGER,
        alt_text      VARCHAR(1000),
        variants      JSONB         NOT NULL DEFAULT '{}',
        created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT media_pkey PRIMARY KEY (id)
      )
    `);

    // Index for the user's media tab query
    await queryRunner.query(`
      CREATE INDEX media_owner_created_idx ON media (owner_id, created_at DESC);
    `);

    // ── post_media ────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE post_media (
        post_id     BIGINT    NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
        media_id    BIGINT    NOT NULL REFERENCES media (id) ON DELETE RESTRICT,
        position    SMALLINT  NOT NULL DEFAULT 0,
        CONSTRAINT post_media_pkey PRIMARY KEY (post_id, media_id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX post_media_media_id_idx ON post_media (media_id);
    `);

    // ── Deferred FK constraints on users ────────────────────────────────────
    // These columns exist from the users migration as plain UUID columns.
    // Now that the media table exists, we can add the FK constraints.
    await queryRunner.query(`
      ALTER TABLE users
        ADD CONSTRAINT users_avatar_media_id_fk
          FOREIGN KEY (avatar_media_id) REFERENCES media (id) ON DELETE SET NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE users
        ADD CONSTRAINT users_banner_media_id_fk
          FOREIGN KEY (banner_media_id) REFERENCES media (id) ON DELETE SET NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove FK constraints from users first (they reference media)
    await queryRunner.query(`
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_banner_media_id_fk;
    `);
    await queryRunner.query(`
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_avatar_media_id_fk;
    `);

    // Drop tables (post_media first — FK to media)
    await queryRunner.query(`DROP TABLE IF EXISTS post_media`);
    await queryRunner.query(`DROP TABLE IF EXISTS media`);
  }
}
