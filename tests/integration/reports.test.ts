/**
 * Integration tests: Reports + Health
 *
 * Covers: report submission (happy path + validation + auth),
 *         duplicate report handling, health endpoint.
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

async function createPost(
  user: { accessToken: string },
  text = 'Test post',
): Promise<{ id: string; [key: string]: unknown }> {
  const res = await http
    .post('/api/v1/posts')
    .set('Authorization', `Bearer ${user.accessToken}`)
    .send({ text })
    .expect(201);
  return res.body.post as { id: string; [key: string]: unknown };
}

// ─── Health ───────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns status=ok with db and redis status', async () => {
    const res = await http.get('/health').expect(200);

    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('ok');
    expect(res.body.redis).toBe('ok');
  });
});

// ─── Reports ─────────────────────────────────────────────────────────────────

describe('POST /api/v1/reports', () => {
  it('submits a post report and returns ReportDto', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    const post = await createPost(alice, 'Spammy post');

    const res = await http
      .post('/api/v1/reports')
      .set('Authorization', bearerHeader(bob))
      .send({
        targetType: 'post',
        targetId: post.id,
        reason: 'spam',
        description: 'This is spam content',
      })
      .expect(201);

    expect(res.body.report.id).toBeTruthy();
    expect(res.body.report.targetType).toBe('post');
    expect(res.body.report.reason).toBe('spam');
  });

  it('submits a user report', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    const res = await http
      .post('/api/v1/reports')
      .set('Authorization', bearerHeader(bob))
      .send({
        targetType: 'user',
        targetId: alice.id,
        reason: 'harassment',
      })
      .expect(201);

    expect(res.body.report.targetType).toBe('user');
  });

  it('returns 400 for invalid reason', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    const post = await createPost(alice);

    await http
      .post('/api/v1/reports')
      .set('Authorization', bearerHeader(bob))
      .send({
        targetType: 'post',
        targetId: post.id,
        reason: 'invalid_reason_xyz',
      })
      .expect(400);
  });

  it('returns 400 for invalid targetType', async () => {
    const alice = await createUser(app);

    await http
      .post('/api/v1/reports')
      .set('Authorization', bearerHeader(alice))
      .send({
        targetType: 'comment',
        targetId: 'some-id',
        reason: 'spam',
      })
      .expect(400);
  });

  it('returns 400 for missing required fields', async () => {
    const alice = await createUser(app);

    await http
      .post('/api/v1/reports')
      .set('Authorization', bearerHeader(alice))
      .send({ targetType: 'post' })
      .expect(400);
  });

  it('returns 401 when unauthenticated', async () => {
    await http
      .post('/api/v1/reports')
      .send({
        targetType: 'post',
        targetId: 'some-id',
        reason: 'spam',
      })
      .expect(401);
  });

  it('returns 409 or 200 for duplicate report (same reporter + target)', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    const post = await createPost(alice);

    await http
      .post('/api/v1/reports')
      .set('Authorization', bearerHeader(bob))
      .send({ targetType: 'post', targetId: post.id, reason: 'spam' })
      .expect(201);

    // Duplicate report — either idempotent (200/201) or conflict (409)
    const second = await http
      .post('/api/v1/reports')
      .set('Authorization', bearerHeader(bob))
      .send({ targetType: 'post', targetId: post.id, reason: 'spam' });

    expect([200, 201, 409]).toContain(second.status);
  });

  it('all valid reason values are accepted', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    const validReasons = ['spam', 'harassment', 'hate_speech', 'misinformation', 'other'];

    for (const reason of validReasons) {
      const post = await createPost(alice, `Post for ${reason}`);

      const res = await http
        .post('/api/v1/reports')
        .set('Authorization', bearerHeader(bob))
        .send({ targetType: 'post', targetId: post.id, reason })
        .expect(201);

      expect(res.body.report.reason).toBe(reason);
    }
  });
});
