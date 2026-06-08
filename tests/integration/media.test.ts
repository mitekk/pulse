/**
 * Integration tests: Media
 *
 * Covers: upload-url request (contract shape), finalize (stub — doesn't do real
 *         object storage in CI without MinIO), get media, update alt text.
 *
 * Note: Real MinIO is not assumed to be running in the integration test environment.
 * We test the API contract (request/response shape, auth, validation) and mock the
 * MinIO presigned URL generation at the storage service level by checking error paths.
 */
import supertest from 'supertest';
import { getApp, closeApp, truncateAll } from './helpers/app';
import { createUser, bearerHeader } from './helpers/auth';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

let app: NestFastifyApplication;
let http: ReturnType<typeof supertest>;

beforeAll(async () => {
  app = await getApp();
  http = supertest(app.getHttpServer());
});

afterAll(async () => {
  await closeApp();
});

beforeEach(async () => {
  await truncateAll();
});

// ─── Upload URL ───────────────────────────────────────────────────────────────

describe('POST /api/v1/media/upload-url', () => {
  it('returns 401 when unauthenticated', async () => {
    await http
      .post('/api/v1/media/upload-url')
      .send({ type: 'image', mime: 'image/jpeg', size: 1024 })
      .expect(401);
  });

  it('returns 400 for invalid MIME type', async () => {
    const alice = await createUser(app);

    await http
      .post('/api/v1/media/upload-url')
      .set('Authorization', bearerHeader(alice))
      .send({ type: 'image', mime: 'application/exe', size: 1024 })
      .expect(400);
  });

  it('returns 400 for missing required fields', async () => {
    const alice = await createUser(app);

    await http
      .post('/api/v1/media/upload-url')
      .set('Authorization', bearerHeader(alice))
      .send({ type: 'image' })
      .expect(400);
  });

  it('returns 400 for invalid media type', async () => {
    const alice = await createUser(app);

    await http
      .post('/api/v1/media/upload-url')
      .set('Authorization', bearerHeader(alice))
      .send({ type: 'document', mime: 'image/jpeg', size: 1024 })
      .expect(400);
  });

  it('returns 413 FILE_TOO_LARGE when the declared size exceeds the per-file limit', async () => {
    const alice = await createUser(app);

    const res = await http
      .post('/api/v1/media/upload-url')
      .set('Authorization', bearerHeader(alice))
      .send({ type: 'image', mime: 'image/jpeg', size: 2 * 1024 * 1024 }); // 2 MB > 1 MB/file

    expect(res.status).toBe(413);
    expect(res.body.error?.code).toBe('FILE_TOO_LARGE');
  });

  it('returns 400 VIDEO_NOT_SUPPORTED for a video upload (deferred)', async () => {
    const alice = await createUser(app);

    const res = await http
      .post('/api/v1/media/upload-url')
      .set('Authorization', bearerHeader(alice))
      .send({ type: 'video', mime: 'video/mp4', size: 1024 });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VIDEO_NOT_SUPPORTED');
  });

  it('returns a presigned POST { mediaId, upload: { url, fields } } for a valid image', async () => {
    // Presigning is local computation (no network), so this is deterministic
    // even without a running MinIO. The reserve step exercises the real
    // storage_usage counter created by the accounting migration.
    const alice = await createUser(app);

    const res = await http
      .post('/api/v1/media/upload-url')
      .set('Authorization', bearerHeader(alice))
      .send({ type: 'image', mime: 'image/jpeg', size: 102400 })
      .expect(201);

    expect(res.body.mediaId).toBeTruthy();
    expect(res.body.upload).toBeTruthy();
    expect(typeof res.body.upload.url).toBe('string');
    expect(res.body.upload.fields).toBeTruthy();
    // The POST policy must pin the exact object key + content-type at the edge.
    expect(res.body.upload.fields.key).toContain(`media/${alice.id}/`);
    expect(res.body.upload.fields['Content-Type']).toBe('image/jpeg');
    // The uploadUrl field from the old PUT flow is gone.
    expect(res.body.uploadUrl).toBeUndefined();
  });
});

// ─── Media endpoints (require a media record to exist) ───────────────────────

describe('GET /api/v1/media/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    await http.get('/api/v1/media/999999999999999998').expect(401);
  });

  it('returns 404 for non-existent media id', async () => {
    const alice = await createUser(app);

    await http
      .get('/api/v1/media/999999999999999999')
      .set('Authorization', bearerHeader(alice))
      .expect(404);
  });
});

describe('PATCH /api/v1/media/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    await http
      .patch('/api/v1/media/999999999999999998')
      .send({ altText: 'Test alt text' })
      .expect(401);
  });

  it('returns 404 for non-existent media id', async () => {
    const alice = await createUser(app);

    await http
      .patch('/api/v1/media/999999999999999999')
      .set('Authorization', bearerHeader(alice))
      .send({ altText: 'Test alt text' })
      .expect(404);
  });
});

describe('POST /api/v1/media/:id/finalize', () => {
  it('returns 401 when unauthenticated', async () => {
    await http
      .post('/api/v1/media/999999999999999998/finalize')
      .expect(401);
  });

  it('returns 404 for non-existent media id', async () => {
    const alice = await createUser(app);

    await http
      .post('/api/v1/media/999999999999999999/finalize')
      .set('Authorization', bearerHeader(alice))
      .expect(404);
  });
});
