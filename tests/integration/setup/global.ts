/**
 * Global setup — runs once before ALL integration test files.
 * Creates the test database schema by running TypeORM migrations.
 *
 * This file is referenced by vitest.integration.config.ts globalSetup.
 * Vitest transpiles TS files in globalSetup via esbuild, so TypeScript imports work.
 */
import { DataSource } from 'typeorm';
import { resolve } from 'path';

const DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgresql://tweeter:tweeter@localhost:5433/tweeter_test';

export async function setup(): Promise<void> {
  if (
    !DATABASE_URL.includes('test') &&
    !DATABASE_URL.includes('localhost') &&
    !DATABASE_URL.includes('127.0.0.1') &&
    !process.env['ALLOW_INTEGRATION_NON_LOCAL']
  ) {
    throw new Error(
      `Integration tests must run against a local/test database. DATABASE_URL="${DATABASE_URL}" looks like a remote DB. Aborting.`,
    );
  }

  const ds = new DataSource({
    type: 'postgres',
    url: DATABASE_URL,
    entities: [],
    migrations: [
      resolve(
        __dirname,
        '../../../backend/src/infra/database/migrations/*{.ts,.js}',
      ),
    ],
    synchronize: false,
    migrationsRun: false,
    logging: false,
  });

  await ds.initialize();

  // Drop all tables and re-run migrations for a clean slate
  await ds.query(`
    DO $$ DECLARE
      r RECORD;
    BEGIN
      FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
      END LOOP;
    END $$;
  `);

  // Also drop the TypeORM migrations table to force fresh run
  await ds.query(`DROP TABLE IF EXISTS migrations`);

  await ds.runMigrations();
  await ds.destroy();

  process.stdout.write('[Integration] Database migrations complete.\n');
}

export async function teardown(): Promise<void> {
  process.stdout.write('[Integration] Global teardown complete.\n');
}
