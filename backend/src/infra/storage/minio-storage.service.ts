import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import { PresignedDownloadResult, PresignedUploadResult, StoragePort } from './storage.port';

const DEFAULT_UPLOAD_EXPIRY = 300; // 5 minutes
const DEFAULT_DOWNLOAD_EXPIRY = 3600; // 1 hour

/**
 * MinioStorageService — S3-compatible object storage via the MinIO client.
 *
 * Implements StoragePort. Bucket is read from MINIO_BUCKET env var.
 * On module init, ensures the bucket exists (creates it if absent).
 */
@Injectable()
export class MinioStorageService implements StoragePort, OnModuleInit {
  private readonly logger = new Logger(MinioStorageService.name);
  private readonly client: Minio.Client;
  // Presigned URLs are SigV4-signed against the client's endpoint host, so a URL
  // signed with the internal docker host (`minio:9000`) is both unreachable from
  // a browser AND would fail signature validation if the host were rewritten.
  // This second client is configured with the publicly reachable endpoint and is
  // used ONLY to mint presigned upload/download URLs handed to clients.
  private readonly presignClient: Minio.Client;
  private readonly bucket: string;
  private readonly endpointHost: string;

  constructor(private readonly config: ConfigService) {
    const endpoint = config.get<string>('MINIO_ENDPOINT') ?? 'localhost';
    const port = config.get<number>('MINIO_PORT') ?? 9000;
    const useSSL = config.get<string>('MINIO_USE_SSL') === 'true';
    const accessKey = config.get<string>('MINIO_ACCESS_KEY') ?? '';
    const secretKey = config.get<string>('MINIO_SECRET_KEY') ?? '';

    this.bucket = config.get<string>('MINIO_BUCKET') ?? 'tweeter-media';
    this.endpointHost = endpoint;
    // Setting region explicitly makes the SDK skip its getBucketRegion() network
    // probe. That probe is what broke presigning against the public endpoint:
    // the presign client points at the host-published address (localhost:9000),
    // which is unreachable from *inside* the container, so the probe threw
    // ECONNREFUSED before any URL was signed. With region set, no probe happens
    // and the URL is signed offline for the public host.
    const region = config.get<string>('MINIO_REGION') ?? 'us-east-1';

    this.client = new Minio.Client({
      endPoint: endpoint,
      port,
      useSSL,
      accessKey,
      secretKey,
      region,
    });

    // Public endpoint for presigning — falls back to the internal endpoint when
    // unset (e.g. local non-docker runs where they are the same host).
    const publicEndpoint = config.get<string>('MINIO_PUBLIC_ENDPOINT') || endpoint;
    const publicPort = config.get<number>('MINIO_PUBLIC_PORT') ?? port;
    const publicUseSSL = config.get<string>('MINIO_PUBLIC_USE_SSL')
      ? config.get<string>('MINIO_PUBLIC_USE_SSL') === 'true'
      : useSSL;

    this.presignClient = new Minio.Client({
      endPoint: publicEndpoint,
      port: publicPort,
      useSSL: publicUseSSL,
      accessKey,
      secretKey,
      region,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.ensureBucketExists();
  }

  private async ensureBucketExists(): Promise<void> {
    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket);
        this.logger.log(`Created MinIO bucket: ${this.bucket}`);
      } else {
        this.logger.log(`MinIO bucket ready: ${this.bucket}`);
      }
    } catch (err) {
      this.logger.error(`Failed to ensure MinIO bucket exists: ${String(err)}`);
    }
  }

  async getPresignedUploadUrl(
    key: string,
    _mimeType: string,
    expiresIn: number = DEFAULT_UPLOAD_EXPIRY,
  ): Promise<PresignedUploadResult> {
    const uploadUrl = await this.presignClient.presignedPutObject(this.bucket, key, expiresIn);

    return {
      uploadUrl,
      key,
      expiresIn,
    };
  }

  async getPresignedDownloadUrl(
    key: string,
    expiresIn: number = DEFAULT_DOWNLOAD_EXPIRY,
  ): Promise<PresignedDownloadResult> {
    const url = await this.presignClient.presignedGetObject(this.bucket, key, expiresIn);
    return { url, expiresIn };
  }

  async delete(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucket, key);
      return true;
    } catch (err) {
      const minioErr = err as { code?: string };
      if (minioErr.code === 'NotFound' || minioErr.code === 'NoSuchKey') {
        return false;
      }
      throw err;
    }
  }

  /** Expose endpoint info for debug/health checks */
  getEndpoint(): string {
    return this.endpointHost;
  }
}
