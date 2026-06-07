import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Baseline migration — enables PostgreSQL extensions required by the platform:
 *   - citext: case-insensitive text type for handle/email lookups
 *   - pg_trgm: trigram GIN indexes for typeahead/fuzzy search
 *
 * This migration must run before any domain migrations.
 * Requires SUPERUSER or rds_superuser (managed hosts) to CREATE EXTENSION.
 */
export class Baseline1704067200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "citext"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pg_trgm"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Dropping extensions could break other databases on the same cluster;
    // use IF EXISTS to be safe. In practice, do not drop in production.
    await queryRunner.query(`DROP EXTENSION IF EXISTS "pg_trgm"`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS "citext"`);
  }
}
