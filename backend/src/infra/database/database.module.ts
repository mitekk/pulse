import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { resolve } from 'path';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        entities: [resolve(__dirname, '../../modules/**/*.entity{.ts,.js}')],
        migrations: [resolve(__dirname, './migrations/*{.ts,.js}')],
        synchronize: false,
        // Auto-apply pending migrations on boot so a fresh `docker compose up`
        // comes up with a ready schema. Idempotent (TypeORM tracks applied
        // migrations); set DB_MIGRATIONS_RUN=false to opt out (e.g. multi-instance
        // deploys that run migrations as a separate step).
        migrationsRun: config.get<string>('DB_MIGRATIONS_RUN') !== 'false',
        logging: config.get<string>('NODE_ENV') !== 'production',
        ssl: config.get<string>('DATABASE_SSL') === 'true' ? { rejectUnauthorized: false } : false,
      }),
    }),
  ],
})
export class DatabaseModule {}
