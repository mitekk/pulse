/**
 * Integration tests: Timelines
 *
 * Covers: home feed fan-out appearance, hashtag timeline,
 *         cursor pagination, empty states.
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

// ─── Home timeline ────────────────────────────────────────────────────────────

describe('GET /api/v1/timeline/home', () => {
  it('returns empty timeline for new user with no follows', async () => {
    const alice = await createUser(app);

    const res = await http
      .get('/api/v1/timeline/home')
      .set('Authorization', bearerHeader(alice))
      .expect(200);

    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBe(0);
    expect(res.body.hasMore).toBe(false);
  });

  it('includes posts from followed users', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    // Alice follows Bob
    await http
      .post(`/api/v1/users/${bob.handle}/follow`)
      .set('Authorization', bearerHeader(alice))
      .expect(201);

    // Bob posts
    const post = await createPost(bob, 'Bob post for Alice feed');

    // Alice's home feed should include Bob's post
    const res = await http
      .get('/api/v1/timeline/home')
      .set('Authorization', bearerHeader(alice))
      .expect(200);

    const ids = res.body.items.map((p: { id: string }) => p.id);
    expect(ids).toContain(post.id);
  });

  it('does not include posts from unfollowed users', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    // Not following Bob
    const post = await createPost(bob, 'Not for Alice');

    const res = await http
      .get('/api/v1/timeline/home')
      .set('Authorization', bearerHeader(alice))
      .expect(200);

    const ids = res.body.items.map((p: { id: string }) => p.id);
    expect(ids).not.toContain(post.id);
  });

  it('does not include posts from muted users', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    // Alice follows then mutes Bob
    await http
      .post(`/api/v1/users/${bob.handle}/follow`)
      .set('Authorization', bearerHeader(alice))
      .expect(201);

    await http
      .post(`/api/v1/users/${bob.handle}/mute`)
      .set('Authorization', bearerHeader(alice))
      .expect(201);

    const post = await createPost(bob, 'Muted post');

    const res = await http
      .get('/api/v1/timeline/home')
      .set('Authorization', bearerHeader(alice))
      .expect(200);

    const ids = res.body.items.map((p: { id: string }) => p.id);
    expect(ids).not.toContain(post.id);
  });

  it('does not include posts from blocked users', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    // Alice follows Bob
    await http
      .post(`/api/v1/users/${bob.handle}/follow`)
      .set('Authorization', bearerHeader(alice))
      .expect(201);

    const post = await createPost(bob, 'To-be-blocked post');

    // Alice then blocks Bob
    await http
      .post(`/api/v1/users/${bob.handle}/block`)
      .set('Authorization', bearerHeader(alice))
      .expect(201);

    const res = await http
      .get('/api/v1/timeline/home')
      .set('Authorization', bearerHeader(alice))
      .expect(200);

    const ids = res.body.items.map((p: { id: string }) => p.id);
    expect(ids).not.toContain(post.id);
  });

  it('includes own posts in home feed', async () => {
    const alice = await createUser(app);

    const post = await createPost(alice, 'My own post');

    const res = await http
      .get('/api/v1/timeline/home')
      .set('Authorization', bearerHeader(alice))
      .expect(200);

    const ids = res.body.items.map((p: { id: string }) => p.id);
    expect(ids).toContain(post.id);
  });

  it('returns 401 when unauthenticated', async () => {
    await http.get('/api/v1/timeline/home').expect(401);
  });

  it('supports cursor pagination', async () => {
    const alice = await createUser(app);

    // Create 3 posts
    const posts: Array<{ id: string }> = [];
    for (let i = 0; i < 3; i++) {
      posts.push(await createPost(alice, `Post ${i}`));
    }

    // Get first page with limit=2
    const page1 = await http
      .get('/api/v1/timeline/home?limit=2')
      .set('Authorization', bearerHeader(alice))
      .expect(200);

    expect(page1.body.items.length).toBeLessThanOrEqual(2);

    if (page1.body.hasMore && page1.body.cursor) {
      // Get next page
      const page2 = await http
        .get(`/api/v1/timeline/home?limit=2&cursor=${page1.body.cursor}`)
        .set('Authorization', bearerHeader(alice))
        .expect(200);

      // Pages should not overlap
      const page1Ids = page1.body.items.map((p: { id: string }) => p.id);
      const page2Ids = page2.body.items.map((p: { id: string }) => p.id);
      const overlap = page1Ids.filter((id: string) => page2Ids.includes(id));
      expect(overlap.length).toBe(0);
    }
  });
});

// ─── Hashtag timeline ─────────────────────────────────────────────────────────

describe('GET /api/v1/timeline/hashtag/:tag', () => {
  it('returns posts containing the hashtag', async () => {
    const alice = await createUser(app);

    const post = await createPost(alice, 'Check out #integration testing');

    const res = await http
      .get('/api/v1/timeline/hashtag/integration')
      .expect(200);

    const ids = res.body.items.map((p: { id: string }) => p.id);
    expect(ids).toContain(post.id);
  });

  it('returns empty list for hashtag with no posts', async () => {
    const res = await http
      .get('/api/v1/timeline/hashtag/nosuchhashtag12345')
      .expect(200);

    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBe(0);
  });

  it('works without authentication (Optional auth)', async () => {
    await http.get('/api/v1/timeline/hashtag/anything').expect(200);
  });
});
