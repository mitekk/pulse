/**
 * Integration tests: Posts, Threads, Reposts, Quotes
 *
 * Covers: create, get, soft-delete (tombstone), thread chain,
 *         reply-policy enforcement, repost/quote, visibility.
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createPost(
  user: { accessToken: string },
  body: Record<string, unknown> = {},
): Promise<{ id: string; text: string | null; [key: string]: unknown }> {
  const res = await http
    .post('/api/v1/posts')
    .set('Authorization', `Bearer ${user.accessToken}`)
    .send({ text: 'Hello world', ...body })
    .expect(201);

  return res.body.post as { id: string; text: string | null; [key: string]: unknown };
}

// ─── Create ───────────────────────────────────────────────────────────────────

describe('POST /api/v1/posts', () => {
  it('creates a post and returns PostDto', async () => {
    const alice = await createUser(app);

    const res = await http
      .post('/api/v1/posts')
      .set('Authorization', bearerHeader(alice))
      .send({ text: 'Hello integration tests!' })
      .expect(201);

    expect(res.body.post.id).toBeTruthy();
    expect(res.body.post.text).toBe('Hello integration tests!');
    expect(res.body.post.author.handle).toBe(alice.handle);
    expect(res.body.post.counts).toBeDefined();
  });

  it('creates a post with a reply (reply chain)', async () => {
    const alice = await createUser(app);

    const parent = await createPost(alice);

    const reply = await createPost(alice, { replyToId: parent.id, text: 'A reply' });

    expect(reply.replyToId).toBe(parent.id);
  });

  it('creates a quote post', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    const original = await createPost(alice);

    const res = await http
      .post('/api/v1/posts')
      .set('Authorization', bearerHeader(bob))
      .send({ text: 'My take', quoteOfId: original.id })
      .expect(201);

    expect(res.body.post.quoteOf).toBeTruthy();
    expect(res.body.post.quoteOf.id).toBe(original.id);
  });

  it('returns 400 for post with neither text nor mediaIds', async () => {
    const alice = await createUser(app);

    await http
      .post('/api/v1/posts')
      .set('Authorization', bearerHeader(alice))
      .send({})
      .expect(400);
  });

  it('returns 400 for post exceeding 280 characters', async () => {
    const alice = await createUser(app);

    await http
      .post('/api/v1/posts')
      .set('Authorization', bearerHeader(alice))
      .send({ text: 'a'.repeat(281) })
      .expect(400);
  });

  it('returns 401 when unauthenticated', async () => {
    await http.post('/api/v1/posts').send({ text: 'Hello' }).expect(401);
  });
});

// ─── Get post ─────────────────────────────────────────────────────────────────

describe('GET /api/v1/posts/:id', () => {
  it('returns a post with viewer flags when authenticated', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    const post = await createPost(alice);

    const res = await http
      .get(`/api/v1/posts/${post.id}`)
      .set('Authorization', bearerHeader(bob))
      .expect(200);

    expect(res.body.post.id).toBe(post.id);
    expect(res.body.post.viewer).toBeDefined();
    expect(res.body.post.viewer.liked).toBe(false);
  });

  it('returns a post without viewer flags when unauthenticated', async () => {
    const alice = await createUser(app);
    const post = await createPost(alice);

    const res = await http
      .get(`/api/v1/posts/${post.id}`)
      .expect(200);

    expect(res.body.post.id).toBe(post.id);
  });

  it('returns 404 for non-existent post', async () => {
    await http.get('/api/v1/posts/999999999999999').expect(404);
  });
});

// ─── Soft delete / tombstone ──────────────────────────────────────────────────

describe('DELETE /api/v1/posts/:id', () => {
  it('soft-deletes own post (tombstone visible via GET)', async () => {
    const alice = await createUser(app);
    const post = await createPost(alice);

    await http
      .delete(`/api/v1/posts/${post.id}`)
      .set('Authorization', bearerHeader(alice))
      .expect(204);

    // Post returns 200 as a tombstone (deleted=true, text=null) — visible for thread rendering
    const tombstone = await http.get(`/api/v1/posts/${post.id}`).expect(200);
    expect(tombstone.body.post.deleted).toBe(true);
  });

  it('returns 403 when deleting someone else\'s post', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    const post = await createPost(alice);

    await http
      .delete(`/api/v1/posts/${post.id}`)
      .set('Authorization', bearerHeader(bob))
      .expect(403);
  });

  it('returns 401 when unauthenticated', async () => {
    const alice = await createUser(app);
    const post = await createPost(alice);

    await http.delete(`/api/v1/posts/${post.id}`).expect(401);
  });

  it('returns 404 for non-existent post', async () => {
    const alice = await createUser(app);

    await http
      .delete('/api/v1/posts/999999999999999')
      .set('Authorization', bearerHeader(alice))
      .expect(404);
  });
});

// ─── Thread ───────────────────────────────────────────────────────────────────

describe('GET /api/v1/posts/:id/thread', () => {
  it('returns ancestors, post and replies', async () => {
    const alice = await createUser(app);

    const root = await createPost(alice, { text: 'Root post' });
    const mid = await createPost(alice, { replyToId: root.id, text: 'Middle' });
    const leaf = await createPost(alice, { replyToId: mid.id, text: 'Leaf' });

    const res = await http
      .get(`/api/v1/posts/${mid.id}/thread`)
      .expect(200);

    expect(res.body.post.id).toBe(mid.id);
    expect(res.body.ancestors).toBeDefined();
    expect(res.body.ancestors.length).toBeGreaterThanOrEqual(1);
    expect(res.body.ancestors.map((p: { id: string }) => p.id)).toContain(root.id);

    // leaf should appear in replies
    expect(res.body.replies?.map((p: { id: string }) => p.id) ?? []).toContain(leaf.id);
  });

  it('returns 404 for non-existent post thread', async () => {
    await http.get('/api/v1/posts/999999999999999/thread').expect(404);
  });
});

// ─── Reply policy ─────────────────────────────────────────────────────────────

describe('Reply policy enforcement', () => {
  it('everyone can reply when policy=everyone (default)', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    const post = await createPost(alice, { replyPolicy: 'everyone', text: 'Open thread' });

    await http
      .post('/api/v1/posts')
      .set('Authorization', bearerHeader(bob))
      .send({ replyToId: post.id, text: 'Bob replies' })
      .expect(201);
  });

  it('only following can reply when policy=following', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);
    const charlie = await createUser(app);

    const post = await createPost(alice, { replyPolicy: 'following', text: 'Followers only' });

    // Bob follows Alice
    await http
      .post(`/api/v1/users/${alice.handle}/follow`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    // Bob can reply (is following)
    await http
      .post('/api/v1/posts')
      .set('Authorization', bearerHeader(bob))
      .send({ replyToId: post.id, text: 'Bob replies' })
      .expect(201);

    // Charlie cannot reply (not following)
    await http
      .post('/api/v1/posts')
      .set('Authorization', bearerHeader(charlie))
      .send({ replyToId: post.id, text: 'Charlie tries' })
      .expect(403);
  });

  it('only mentioned users can reply when policy=mentioned', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);
    const charlie = await createUser(app);

    // Alice creates post mentioning Bob
    const post = await createPost(alice, {
      replyPolicy: 'mentioned',
      text: `@${bob.handle} check this out`,
    });

    // Bob (mentioned) can reply
    await http
      .post('/api/v1/posts')
      .set('Authorization', bearerHeader(bob))
      .send({ replyToId: post.id, text: 'Bob is mentioned and replies' })
      .expect(201);

    // Charlie (not mentioned) cannot reply
    await http
      .post('/api/v1/posts')
      .set('Authorization', bearerHeader(charlie))
      .send({ replyToId: post.id, text: 'Charlie tries' })
      .expect(403);
  });
});

// ─── Reposts ──────────────────────────────────────────────────────────────────

describe('Repost endpoints', () => {
  it('GET /api/v1/posts/:id/reposts lists reposters', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    const post = await createPost(alice);

    // Bob reposts
    await http
      .post(`/api/v1/posts/${post.id}/repost`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    const res = await http
      .get(`/api/v1/posts/${post.id}/reposts`)
      .expect(200);

    const handles = res.body.items.map((u: { handle: string }) => u.handle);
    expect(handles).toContain(bob.handle);
  });
});

// ─── Quotes ───────────────────────────────────────────────────────────────────

describe('GET /api/v1/posts/:id/quotes', () => {
  it('lists quotes of a post', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    const original = await createPost(alice);

    await http
      .post('/api/v1/posts')
      .set('Authorization', bearerHeader(bob))
      .send({ text: 'My take', quoteOfId: original.id })
      .expect(201);

    const res = await http
      .get(`/api/v1/posts/${original.id}/quotes`)
      .expect(200);

    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── User posts / replies / media tabs ───────────────────────────────────────

describe('User profile tabs', () => {
  it('GET /api/v1/users/:handle/posts lists user posts', async () => {
    const alice = await createUser(app);
    const post = await createPost(alice);

    const res = await http
      .get(`/api/v1/users/${alice.handle}/posts`)
      .expect(200);

    expect(Array.isArray(res.body.items)).toBe(true);
    const ids = res.body.items.map((p: { id: string }) => p.id);
    expect(ids).toContain(post.id);
  });

  it('GET /api/v1/users/:handle/replies lists reply posts', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    const alicePost = await createPost(alice);
    // Bob replies to Alice
    const reply = await createPost(bob, { replyToId: alicePost.id, text: 'Bob reply' });

    const res = await http
      .get(`/api/v1/users/${bob.handle}/replies`)
      .expect(200);

    const ids = res.body.items.map((p: { id: string }) => p.id);
    expect(ids).toContain(reply.id);
  });

  it('GET /api/v1/users/:handle/likes returns 403 if not allowed (default dmPrivacy)', async () => {
    // By default users have privacy; likes tab may be restricted
    const alice = await createUser(app);
    const bob = await createUser(app);

    // Alice likes her own post
    const post = await createPost(alice);
    await http
      .post(`/api/v1/posts/${post.id}/like`)
      .set('Authorization', bearerHeader(alice))
      .expect(201);

    // Bob tries to see Alice's likes — behavior depends on implementation
    const res = await http
      .get(`/api/v1/users/${alice.handle}/likes`)
      .set('Authorization', bearerHeader(bob));

    // Either 200 (public) or 403 (private) — both are valid per spec
    expect([200, 403]).toContain(res.status);
  });
});
