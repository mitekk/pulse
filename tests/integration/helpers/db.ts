/**
 * Database helpers for integration tests.
 * Provides migration runner and data factory helpers.
 */
import { DataSource } from 'typeorm';
import { resolve } from 'path';

const DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgresql://tweeter:tweeter@localhost:5432/tweeter_test';

/** Standalone DataSource used to run migrations before any app boots */
export async function runMigrations(): Promise<void> {
  const ds = new DataSource({
    type: 'postgres',
    url: DATABASE_URL,
    entities: [
      resolve(
        __dirname,
        '../../../backend/src/modules/**/*.entity{.ts,.js}',
      ),
    ],
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
  await ds.runMigrations();
  await ds.destroy();
}
