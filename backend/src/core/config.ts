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

  // Run pending migrations automatically on boot ('false' to disable).
  @IsString()
  @IsOptional()
  DB_MIGRATIONS_RUN: string = 'true';

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

  // Publicly reachable MinIO endpoint used to mint presigned URLs for browsers.
  // Defaults to the internal endpoint when unset (non-docker local runs).
  @IsString()
  @IsOptional()
  MINIO_PUBLIC_ENDPOINT?: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  MINIO_PUBLIC_PORT?: number;

  @IsString()
  @IsOptional()
  MINIO_PUBLIC_USE_SSL?: string;

  // S3 region — set so the SDK skips its getBucketRegion network probe (which
  // is unreachable when presigning against the host-published endpoint).
  @IsString()
  @IsOptional()
  MINIO_REGION: string = 'us-east-1';

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

  // Fail fast in production on missing/placeholder JWT secrets — otherwise the
  // app would silently sign tokens with a blank or well-known default, allowing
  // forgery. Dev/test may use defaults for convenience.
  if (validatedConfig.NODE_ENV === 'production') {
    const weak = ['', 'change-me-in-production', 'change-me-refresh-in-production'];
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
      const value = validatedConfig[key];
      if (!value || weak.includes(value) || value.length < 16) {
        throw new Error(
          `${key} must be set to a strong (>=16 char) secret in production; refusing to start with a blank or default value.`,
        );
      }
    }
  }

  return validatedConfig;
}
