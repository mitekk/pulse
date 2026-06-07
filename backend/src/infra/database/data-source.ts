/**
 * TypeORM DataSource — used by the TypeORM CLI for migration:generate/run/revert.
 * This file is NOT imported by the NestJS app module; the app uses TypeOrmModule.forRootAsync.
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../../../.env') });

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env['DATABASE_URL'],
  entities: [resolve(__dirname, '../../modules/**/*.entity{.ts,.js}')],
  migrations: [resolve(__dirname, './migrations/*{.ts,.js}')],
  synchronize: false,
  migrationsRun: false,
  logging: process.env['NODE_ENV'] !== 'production',
});
