import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: create `reports` table.
 *
 * Reports are store-only abuse reports submitted by authenticated users.
 * reporter_id is ON DELETE SET NULL — reports are preserved even if the
 * reporter deletes their account (audit trail).
 */
export class CreateReports1704067200009 implements MigrationInterface {
  name = 'CreateReports1704067200009';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reports" (
        "id"          BIGINT       NOT NULL,
        "reporter_id" UUID         REFERENCES "users"("id") ON DELETE SET NULL,
        "target_type" VARCHAR(10)  NOT NULL CHECK ("target_type" IN ('post', 'user')),
        "target_id"   VARCHAR(40)  NOT NULL,
        "reason"      VARCHAR(30)  NOT NULL CHECK ("reason" IN ('spam', 'harassment', 'hate_speech', 'misinformation', 'other')),
        "description" VARCHAR(500),
        "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_reports" PRIMARY KEY ("id")
      )
    `);

    // Index for looking up reports by reporter
    await queryRunner.query(`
      CREATE INDEX "idx_reports_reporter_id" ON "reports" ("reporter_id")
      WHERE "reporter_id" IS NOT NULL
    `);

    // Index for looking up reports by target (admin tooling)
    await queryRunner.query(`
      CREATE INDEX "idx_reports_target" ON "reports" ("target_type", "target_id")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_reports_target"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_reports_reporter_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reports"`);
  }
}
