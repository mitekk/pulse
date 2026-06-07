import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: users table + email_verification_tokens table
 *
 * Design decisions:
 * - users.id is UUID (locked ADR-0002)
 * - handle and email use citext for case-insensitive uniqueness
 * - avatar_media_id / banner_media_id are plain uuid columns (FK added in media migration)
 * - dm_privacy enum stored as varchar with CHECK constraint for portability
 * - GIN trigram indexes on handle + display_name for typeahead search
 * - email_verification_tokens is a separate table (not a column) so tokens can be
 *   invalidated, expired, and re-issued without touching the users row
 */
export class CreateUsers1704067200001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── users ────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE users (
        id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        handle              CITEXT        NOT NULL,
        display_name        VARCHAR(50)   NOT NULL,
        email               CITEXT        NOT NULL,
        password_hash       VARCHAR(255)  NOT NULL,
        bio                 VARCHAR(160),
        location            VARCHAR(30),
        website             VARCHAR(100),
        avatar_media_id     UUID,
        banner_media_id     UUID,
        is_verified         BOOLEAN       NOT NULL DEFAULT FALSE,
        is_private          BOOLEAN       NOT NULL DEFAULT FALSE,
        dm_privacy          VARCHAR(10)   NOT NULL DEFAULT 'following'
                              CHECK (dm_privacy IN ('everyone', 'following')),
        followers_count     INTEGER       NOT NULL DEFAULT 0,
        following_count     INTEGER       NOT NULL DEFAULT 0,
        posts_count         INTEGER       NOT NULL DEFAULT 0,
        email_verified_at   TIMESTAMPTZ,
        created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        deleted_at          TIMESTAMPTZ
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX users_handle_uidx ON users (handle);
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX users_email_uidx ON users (email);
    `);

    // GIN trigram indexes for fast partial-match typeahead on handle + display_name
    await queryRunner.query(`
      CREATE INDEX users_handle_trgm_idx ON users USING GIN (handle gin_trgm_ops);
    `);

    await queryRunner.query(`
      CREATE INDEX users_display_name_trgm_idx ON users USING GIN (display_name gin_trgm_ops);
    `);

    // ── email_verification_tokens ─────────────────────────────────────────────
    // Stores hashed verification tokens (raw token is emailed / logged in dev).
    // token_hash: SHA-256 hex of the raw 32-byte random token.
    await queryRunner.query(`
      CREATE TABLE email_verification_tokens (
        id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        token_hash  VARCHAR(64)   NOT NULL,
        expires_at  TIMESTAMPTZ   NOT NULL,
        used_at     TIMESTAMPTZ,
        created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX evt_token_hash_uidx ON email_verification_tokens (token_hash);
    `);

    await queryRunner.query(`
      CREATE INDEX evt_user_id_idx ON email_verification_tokens (user_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS email_verification_tokens`);
    await queryRunner.query(`DROP TABLE IF EXISTS users`);
  }
}
