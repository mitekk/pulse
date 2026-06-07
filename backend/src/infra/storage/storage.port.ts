/**
 * StoragePort — interface for object storage operations.
 *
 * Implementations: MinioStorageService (local/self-hosted), AwsS3StorageService (future).
 * Inject StoragePort in domain services — never import MinioStorageService directly.
 */
export interface PresignedUploadResult {
  /** Presigned URL the client uploads to directly (PUT) */
  uploadUrl: string;
  /** Object key (path) within the bucket */
  key: string;
  /** How long the presigned URL is valid (seconds) */
  expiresIn: number;
}

export interface PresignedDownloadResult {
  /** Presigned URL for reading the object */
  url: string;
  /** How long the URL is valid (seconds) */
  expiresIn: number;
}

export const STORAGE_PORT = Symbol('STORAGE_PORT');

export interface StoragePort {
  /**
   * Generate a presigned URL for a direct client upload.
   * The bucket is determined by configuration.
   */
  getPresignedUploadUrl(
    key: string,
    mimeType: string,
    expiresIn?: number,
  ): Promise<PresignedUploadResult>;

  /**
   * Generate a presigned URL for a client to download/view an object.
   */
  getPresignedDownloadUrl(key: string, expiresIn?: number): Promise<PresignedDownloadResult>;

  /**
   * Delete an object from storage.
   */
  delete(key: string): Promise<void>;

  /**
   * Check whether an object exists in storage.
   */
  exists(key: string): Promise<boolean>;
}
