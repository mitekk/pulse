import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: media storage accounting.
 *
 * - media: add byte_size (reserved→actual), committed_at, updated_at, and a
 *   (status, created_at) index for the orphan reaper / reconciliation.
 * - storage_usage: single-row counter (id = 1) that is the source of truth for
 *   total reserved+committed bytes; enforced via atomic CAS in QuotaService.
 */
export class MediaStorageAccounting1704067200010 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE media
        ADD COLUMN IF NOT EXISTS byte_size    BIGINT      NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS committed_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    `);

    // Reaper + reconciliation scan by lifecycle state.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS media_status_created_idx ON media (status, created_at)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS storage_usage (
        id          SMALLINT    NOT NULL,
        total_bytes BIGINT      NOT NULL DEFAULT 0 CHECK (total_bytes >= 0),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT storage_usage_pkey PRIMARY KEY (id)
      )
    `);

    // Seed the singleton row.
    await queryRunner.query(`
      INSERT INTO storage_usage (id, total_bytes) VALUES (1, 0)
      ON CONFLICT (id) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS storage_usage`);
    await queryRunner.query(`DROP INDEX IF EXISTS media_status_created_idx`);
    await queryRunner.query(`
      ALTER TABLE media
        DROP COLUMN IF EXISTS byte_size,
        DROP COLUMN IF EXISTS committed_at,
        DROP COLUMN IF EXISTS updated_at
    `);
  }
}
