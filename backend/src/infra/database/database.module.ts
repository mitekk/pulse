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
        migrationsRun: false,
        logging: config.get<string>('NODE_ENV') !== 'production',
        ssl:
          config.get<string>('DATABASE_SSL') === 'true' ? { rejectUnauthorized: false } : false,
      }),
    }),
  ],
})
export class DatabaseModule {}
