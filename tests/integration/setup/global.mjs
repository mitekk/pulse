/**
 * Global setup — runs once before ALL integration test files.
 * Creates the test database schema by running TypeORM migrations.
 * Written as .mjs (ESM) so Node can load it without transpilation.
 */
import { createRequire } from 'module';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Ensure env is set before any require
const DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgresql://tweeter:tweeter@localhost:5433/tweeter_test';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function setup() {
  // Dynamic import after env is set
  const { DataSource } = await import('typeorm');

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

  await ds.runMigrations();
  await ds.destroy();

  process.stdout.write('[Integration] Database migrations complete.\n');
}

export async function teardown() {
  process.stdout.write('[Integration] Global teardown complete.\n');
}
