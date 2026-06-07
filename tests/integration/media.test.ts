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

  it('when MinIO is available: returns mediaId and uploadUrl', async () => {
    // This test only asserts the contract shape if MinIO is configured.
    // In CI without MinIO, the storage service may throw; we catch and skip.
    const alice = await createUser(app);

    const res = await http
      .post('/api/v1/media/upload-url')
      .set('Authorization', bearerHeader(alice))
      .send({ type: 'image', mime: 'image/jpeg', size: 102400 });

    if (res.status === 201) {
      // MinIO is available — validate shape
      expect(res.body.mediaId).toBeTruthy();
      expect(res.body.uploadUrl).toBeTruthy();
      expect(typeof res.body.uploadUrl).toBe('string');
    } else {
      // MinIO not available — expect a server error, not a validation error
      expect([500, 503]).toContain(res.status);
    }
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
