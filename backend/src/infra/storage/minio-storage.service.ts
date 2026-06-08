import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { createPresignedPost as presignPost } from '@aws-sdk/s3-presigned-post';
import type { Readable } from 'stream';
import { ObjectHead, PresignedPost, StoragePort } from './storage.port';

const DEFAULT_POST_EXPIRY = 900; // 15 minutes

/**
 * S3-compatible storage on AWS SDK v3 (MinIO in dev and prod), forcePathStyle.
 *
 * Two clients, because presigned URLs are signed against a specific host:
 *   - internal: the in-cluster endpoint (e.g. minio:9000) for server-side
 *     head/get/put/delete/list. Reachable from the backend, NOT the browser.
 *   - public: the browser-reachable endpoint (e.g. localhost:9000 / a CDN
 *     origin) used ONLY to mint presigned POSTs the browser submits to.
 *
 * Storage is swapped between dev and prod purely via env (endpoint/creds/bucket).
 */
@Injectable()
export class MinioStorageService implements StoragePort, OnModuleInit {
  private readonly logger = new Logger(MinioStorageService.name);
  private readonly internal: S3Client;
  private readonly public: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    const accessKeyId = config.get<string>('MINIO_ACCESS_KEY') ?? '';
    const secretAccessKey = config.get<string>('MINIO_SECRET_KEY') ?? '';
    const region = config.get<string>('MINIO_REGION') ?? 'us-east-1';
    this.bucket = config.get<string>('MINIO_BUCKET') ?? 'tweeter-media';

    const internalEndpoint = endpointUrl(
      config.get<string>('MINIO_ENDPOINT') ?? 'localhost',
      config.get<string>('MINIO_PORT') ?? '9000',
      config.get<string>('MINIO_USE_SSL') === 'true',
    );
    const publicEndpoint = endpointUrl(
      config.get<string>('MINIO_PUBLIC_ENDPOINT') ?? 'localhost',
      config.get<string>('MINIO_PUBLIC_PORT') ?? '9000',
      config.get<string>('MINIO_PUBLIC_USE_SSL') === 'true',
    );

    const common = { region, forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } };
    this.internal = new S3Client({ ...common, endpoint: internalEndpoint });
    this.public = new S3Client({ ...common, endpoint: publicEndpoint });

    // Public-read base for serving media. Defaults to the public endpoint +
    // bucket (path-style); set MEDIA_PUBLIC_BASE_URL to a CDN origin in prod.
    this.publicBaseUrl = (
      config.get<string>('MEDIA_PUBLIC_BASE_URL') ?? `${publicEndpoint}/${this.bucket}`
    ).replace(/\/+$/, '');
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.internal.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Bucket ready: ${this.bucket}`);
    } catch {
      try {
        await this.internal.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`Created bucket: ${this.bucket}`);
      } catch (err) {
        this.logger.error(`Failed to ensure bucket exists: ${String(err)}`);
      }
    }
  }

  async createPresignedPost(
    key: string,
    opts: { maxBytes: number; contentType: string; expiresIn?: number },
  ): Promise<PresignedPost> {
    const { url, fields } = await presignPost(this.public, {
      Bucket: this.bucket,
      Key: key,
      Conditions: [
        ['content-length-range', 1, opts.maxBytes],
        ['eq', '$Content-Type', opts.contentType],
      ],
      Fields: { 'Content-Type': opts.contentType },
      Expires: opts.expiresIn ?? DEFAULT_POST_EXPIRY,
    });
    return { url, fields };
  }

  async headObject(key: string): Promise<ObjectHead | null> {
    try {
      const r = await this.internal.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: r.ContentLength ?? 0, contentType: r.ContentType ?? null };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async getObjectStream(key: string): Promise<Readable> {
    const r = await this.internal.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return r.Body as Readable;
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.internal.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentLength: body.length,
      }),
    );
  }

  async deleteObject(key: string): Promise<void> {
    await this.internal.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  getPublicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key}`;
  }

  async listBucketBytes(): Promise<number> {
    let total = 0;
    let token: string | undefined;
    do {
      const r = await this.internal.send(
        new ListObjectsV2Command({ Bucket: this.bucket, ContinuationToken: token }),
      );
      for (const obj of r.Contents ?? []) total += obj.Size ?? 0;
      token = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (token);
    return total;
  }
}

function endpointUrl(host: string, port: string | number, ssl: boolean): string {
  return `${ssl ? 'https' : 'http'}://${host}:${port}`;
}

function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === 'NotFound' || e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404;
}
