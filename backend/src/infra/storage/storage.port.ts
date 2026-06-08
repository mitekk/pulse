import type { Readable } from 'stream';

/**
 * StoragePort — storage-agnostic object-store interface.
 *
 * The only implementation is S3-compatible (MinIO in dev and prod via AWS SDK
 * v3, forcePathStyle). Inject StoragePort in domain code — never the concrete
 * service. Two endpoint roles matter:
 *   - browser-facing: presigned POST (upload) + public GET URLs (serve)
 *   - server-side:    head/get/put/delete/list over the internal endpoint
 */
export const STORAGE_PORT = Symbol('STORAGE_PORT');

/** A presigned POST the browser submits as multipart/form-data (file last). */
export interface PresignedPost {
  /** Form action URL (public endpoint, path-style: <endpoint>/<bucket>). */
  url: string;
  /** Required form fields (policy, signature, key, Content-Type, …). */
  fields: Record<string, string>;
}

/** Result of a HEAD on an object. */
export interface ObjectHead {
  size: number;
  contentType: string | null;
}

export interface StoragePort {
  /**
   * Presigned POST for a direct browser upload. Enforces an exact key, a
   * content-length range [1, maxBytes], and an exact Content-Type at the edge,
   * so a client cannot exceed the cap or upload a disallowed type even if it
   * bypasses the UI. Signed against the PUBLIC endpoint.
   */
  createPresignedPost(
    key: string,
    opts: { maxBytes: number; contentType: string; expiresIn?: number },
  ): Promise<PresignedPost>;

  /** HEAD an object (internal endpoint). Returns null if it does not exist. */
  headObject(key: string): Promise<ObjectHead | null>;

  /** Server-side read — stream the object's bytes (internal endpoint). */
  getObjectStream(key: string): Promise<Readable>;

  /** Server-side write (internal endpoint). */
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;

  /** Delete an object; no error if it is already absent (internal endpoint). */
  deleteObject(key: string): Promise<void>;

  /** Stable public-read URL for a key (public-read bucket / CDN). Sync, no signing. */
  getPublicUrl(key: string): string;

  /** Sum of all object byte sizes in the bucket — usage reconciliation seam. */
  listBucketBytes(): Promise<number>;
}
