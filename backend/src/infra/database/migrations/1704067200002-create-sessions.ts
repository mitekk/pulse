import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: sessions table
 *
 * Design decisions:
 * - id is Snowflake BIGINT stored as BIGINT (serialized as string in JSON)
 * - refresh_hash: SHA-256 hex of the raw 256-bit refresh token
 * - family_id: UUID that groups all tokens in a rotation lineage.
 *   On reuse detection, all sessions with the same family_id are revoked.
 * - revoked_at: null = active; non-null = revoked (logout, reuse, or admin)
 * - Index on (user_id, expires_at) supports session listing + cleanup cron
 * - Index on (family_id) supports O(1) family-wide revocation
 */
export class CreateSessions1704067200002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE sessions (
        id            BIGINT        PRIMARY KEY,
        user_id       UUID          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        refresh_hash  VARCHAR(64)   NOT NULL,
        family_id     UUID          NOT NULL,
        user_agent    VARCHAR(512),
        ip            VARCHAR(45),
        created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        expires_at    TIMESTAMPTZ   NOT NULL,
        revoked_at    TIMESTAMPTZ
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX sessions_refresh_hash_uidx ON sessions (refresh_hash);
    `);

    await queryRunner.query(`
      CREATE INDEX sessions_user_id_expires_idx ON sessions (user_id, expires_at);
    `);

    await queryRunner.query(`
      CREATE INDEX sessions_family_id_idx ON sessions (family_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS sessions`);
  }
}
