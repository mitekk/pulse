import { plainToInstance } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUrl, Max, Min, validateSync } from 'class-validator';

export class EnvironmentVariables {
  @IsString()
  NODE_ENV: string = 'development';

  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  PORT: number = 3000;

  // Database
  @IsString()
  DATABASE_URL!: string;

  @IsString()
  @IsOptional()
  DB_NAME: string = 'tweeter';

  @IsString()
  @IsOptional()
  DB_USER: string = 'tweeter';

  @IsString()
  @IsOptional()
  DB_PASSWORD: string = 'tweeter';

  @IsString()
  @IsOptional()
  DB_HOST: string = 'localhost';

  // Enable TLS to Postgres (managed providers). Decoupled from NODE_ENV so a
  // production build can still connect to a non-SSL local/Docker Postgres.
  @IsString()
  @IsOptional()
  DATABASE_SSL: string = 'false';

  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  DB_PORT: number = 5432;

  // Redis
  @IsString()
  REDIS_URL!: string;

  // CORS
  @IsUrl({ require_tld: false, require_protocol: true })
  WEB_ORIGIN!: string;

  // JWT (seams for Phase 2)
  @IsString()
  @IsOptional()
  JWT_ACCESS_SECRET: string = 'change-me-in-production';

  @IsString()
  @IsOptional()
  JWT_REFRESH_SECRET: string = 'change-me-refresh-in-production';

  @IsString()
  @IsOptional()
  JWT_ACCESS_EXPIRY: string = '15m';

  @IsString()
  @IsOptional()
  JWT_REFRESH_EXPIRY: string = '30d';

  // MinIO / S3 Storage
  @IsString()
  MINIO_ENDPOINT!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  MINIO_PORT: number = 9000;

  @IsString()
  @IsOptional()
  MINIO_USE_SSL: string = 'false';

  @IsString()
  MINIO_ACCESS_KEY!: string;

  @IsString()
  MINIO_SECRET_KEY!: string;

  @IsString()
  @IsOptional()
  MINIO_BUCKET: string = 'tweeter-media';

  // Snowflake
  @IsInt()
  @Min(0)
  @Max(1023)
  @IsOptional()
  SNOWFLAKE_MACHINE_ID: number = 0;

  // Celebrity threshold for fan-out
  @IsInt()
  @Min(1)
  @IsOptional()
  CELEBRITY_FOLLOWER_THRESHOLD: number = 10000;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
