/**
 * Integration tests: Engagement (likes, reposts, bookmarks, counters)
 *
 * Covers: like/unlike, repost/unrepost, bookmark/unbookmark, counter accuracy,
 *         double-like guard, viewer flags reflecting state.
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

// ─── Likes ────────────────────────────────────────────────────────────────────

describe('POST /api/v1/posts/:id/like', () => {
  it('likes a post and returns liked=true with incremented count', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    const post = await createPost(alice);

    const res = await http
      .post(`/api/v1/posts/${post.id}/like`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    expect(res.body.liked).toBe(true);
    expect(res.body.count).toBe(1);
  });

  it('like is idempotent (double-like returns same state, count not doubled)', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    const post = await createPost(alice);

    await http
      .post(`/api/v1/posts/${post.id}/like`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    // Second like — should succeed or return conflict but not increment twice
    const second = await http
      .post(`/api/v1/posts/${post.id}/like`)
      .set('Authorization', bearerHeader(bob));

    expect([201, 409]).toContain(second.status);

    // Count must still be 1
    const postRes = await http.get(`/api/v1/posts/${post.id}`).expect(200);
    expect(postRes.body.post.counts.likes).toBe(1);
  });

  it('returns 404 when liking non-existent post', async () => {
    const alice = await createUser(app);
    await http
      .post('/api/v1/posts/999999999999999/like')
      .set('Authorization', bearerHeader(alice))
      .expect(404);
  });

  it('returns 401 when unauthenticated', async () => {
    const alice = await createUser(app);
    const post = await createPost(alice);
    await http.post(`/api/v1/posts/${post.id}/like`).expect(401);
  });

  it('viewer flag liked=true after liking', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    const post = await createPost(alice);

    await http
      .post(`/api/v1/posts/${post.id}/like`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    const res = await http
      .get(`/api/v1/posts/${post.id}`)
      .set('Authorization', bearerHeader(bob))
      .expect(200);

    expect(res.body.post.viewer?.liked).toBe(true);
  });
});

describe('DELETE /api/v1/posts/:id/like', () => {
  it('unlikes a post and decrements counter', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    const post = await createPost(alice);

    await http
      .post(`/api/v1/posts/${post.id}/like`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    const res = await http
      .delete(`/api/v1/posts/${post.id}/like`)
      .set('Authorization', bearerHeader(bob))
      .expect(200);

    expect(res.body.liked).toBe(false);
    expect(res.body.count).toBe(0);
  });

  it('unlike when not liked is idempotent (200, count=0)', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    const post = await createPost(alice);

    const res = await http
      .delete(`/api/v1/posts/${post.id}/like`)
      .set('Authorization', bearerHeader(bob))
      .expect(200);

    expect(res.body.count).toBe(0);
  });

  it('viewer flag liked=false after unliking', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    const post = await createPost(alice);

    await http
      .post(`/api/v1/posts/${post.id}/like`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    await http
      .delete(`/api/v1/posts/${post.id}/like`)
      .set('Authorization', bearerHeader(bob))
      .expect(200);

    const res = await http
      .get(`/api/v1/posts/${post.id}`)
      .set('Authorization', bearerHeader(bob))
      .expect(200);

    expect(res.body.post.viewer?.liked).toBe(false);
  });
});

// ─── Reposts ──────────────────────────────────────────────────────────────────

describe('POST /api/v1/posts/:id/repost', () => {
  it('reposts a post and returns reposted=true with count=1', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    const post = await createPost(alice);

    const res = await http
      .post(`/api/v1/posts/${post.id}/repost`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    expect(res.body.reposted).toBe(true);
    expect(res.body.count).toBe(1);
  });

  it('repost is idempotent (double-repost does not increment twice)', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    const post = await createPost(alice);

    await http
      .post(`/api/v1/posts/${post.id}/repost`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    await http
      .post(`/api/v1/posts/${post.id}/repost`)
      .set('Authorization', bearerHeader(bob));

    const postRes = await http.get(`/api/v1/posts/${post.id}`).expect(200);
    expect(postRes.body.post.counts.reposts).toBe(1);
  });

  it('viewer flag reposted=true after repost', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    const post = await createPost(alice);

    await http
      .post(`/api/v1/posts/${post.id}/repost`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    const res = await http
      .get(`/api/v1/posts/${post.id}`)
      .set('Authorization', bearerHeader(bob))
      .expect(200);

    expect(res.body.post.viewer?.reposted).toBe(true);
  });
});

describe('DELETE /api/v1/posts/:id/repost', () => {
  it('un-reposts and decrements counter', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    const post = await createPost(alice);

    await http
      .post(`/api/v1/posts/${post.id}/repost`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    const res = await http
      .delete(`/api/v1/posts/${post.id}/repost`)
      .set('Authorization', bearerHeader(bob))
      .expect(200);

    expect(res.body.reposted).toBe(false);
    expect(res.body.count).toBe(0);
  });
});

// ─── Bookmarks ────────────────────────────────────────────────────────────────

describe('POST /api/v1/posts/:id/bookmark', () => {
  it('bookmarks a post', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    const post = await createPost(alice);

    const res = await http
      .post(`/api/v1/posts/${post.id}/bookmark`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    expect(res.body.bookmarked).toBe(true);
  });

  it('viewer flag bookmarked=true after bookmark', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    const post = await createPost(alice);

    await http
      .post(`/api/v1/posts/${post.id}/bookmark`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    const res = await http
      .get(`/api/v1/posts/${post.id}`)
      .set('Authorization', bearerHeader(bob))
      .expect(200);

    expect(res.body.post.viewer?.bookmarked).toBe(true);
  });
});

describe('DELETE /api/v1/posts/:id/bookmark', () => {
  it('removes bookmark', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    const post = await createPost(alice);

    await http
      .post(`/api/v1/posts/${post.id}/bookmark`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    const res = await http
      .delete(`/api/v1/posts/${post.id}/bookmark`)
      .set('Authorization', bearerHeader(bob))
      .expect(200);

    expect(res.body.bookmarked).toBe(false);
  });
});

// ─── Bookmarks list ───────────────────────────────────────────────────────────

describe('GET /api/v1/bookmarks', () => {
  it('returns bookmarked posts for current user', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    const post = await createPost(alice);

    await http
      .post(`/api/v1/posts/${post.id}/bookmark`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    const res = await http
      .get('/api/v1/bookmarks')
      .set('Authorization', bearerHeader(bob))
      .expect(200);

    const ids = res.body.items.map((p: { id: string }) => p.id);
    expect(ids).toContain(post.id);
  });

  it('does not return other users\' bookmarks', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);
    const charlie = await createUser(app);

    const post = await createPost(alice);

    await http
      .post(`/api/v1/posts/${post.id}/bookmark`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    const res = await http
      .get('/api/v1/bookmarks')
      .set('Authorization', bearerHeader(charlie))
      .expect(200);

    const ids = res.body.items.map((p: { id: string }) => p.id);
    expect(ids).not.toContain(post.id);
  });

  it('returns 401 when unauthenticated', async () => {
    await http.get('/api/v1/bookmarks').expect(401);
  });
});

// ─── Counter consistency ──────────────────────────────────────────────────────

describe('Counter consistency', () => {
  it('like/unlike cycle keeps count at 0', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    const post = await createPost(alice);

    await http
      .post(`/api/v1/posts/${post.id}/like`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    await http
      .delete(`/api/v1/posts/${post.id}/like`)
      .set('Authorization', bearerHeader(bob))
      .expect(200);

    const res = await http.get(`/api/v1/posts/${post.id}`).expect(200);
    expect(res.body.post.counts.likes).toBe(0);
  });

  it('multiple users liking increments count correctly', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);
    const charlie = await createUser(app);

    const post = await createPost(alice);

    await http
      .post(`/api/v1/posts/${post.id}/like`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    await http
      .post(`/api/v1/posts/${post.id}/like`)
      .set('Authorization', bearerHeader(charlie))
      .expect(201);

    const res = await http.get(`/api/v1/posts/${post.id}`).expect(200);
    expect(res.body.post.counts.likes).toBe(2);
  });
});

// ─── Post likes list ──────────────────────────────────────────────────────────

describe('GET /api/v1/posts/:id/likes', () => {
  it('lists users who liked a post', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    const post = await createPost(alice);

    await http
      .post(`/api/v1/posts/${post.id}/like`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    const res = await http
      .get(`/api/v1/posts/${post.id}/likes`)
      .expect(200);

    const handles = res.body.items.map((u: { handle: string }) => u.handle);
    expect(handles).toContain(bob.handle);
  });
});
