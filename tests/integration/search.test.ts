/**
 * Integration tests: Search, Suggestions, Trends
 *
 * Covers: full-text post search, people search, media search,
 *         typeahead suggestions, trends endpoint.
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
  text: string,
): Promise<{ id: string; [key: string]: unknown }> {
  const res = await http
    .post('/api/v1/posts')
    .set('Authorization', `Bearer ${user.accessToken}`)
    .send({ text })
    .expect(201);
  return res.body.post as { id: string; [key: string]: unknown };
}

// ─── Post search ─────────────────────────────────────────────────────────────

describe('GET /api/v1/search?type=top|latest', () => {
  it('finds a post by keyword (type=latest)', async () => {
    const alice = await createUser(app);

    const post = await createPost(alice, 'Unique phrase xyzuniquekeyword2026');

    const res = await http
      .get('/api/v1/search?q=xyzuniquekeyword2026&type=latest')
      .expect(200);

    expect(Array.isArray(res.body.items)).toBe(true);
    const ids = res.body.items.map((p: { id: string }) => p.id);
    expect(ids).toContain(post.id);
  });

  it('returns empty results for query with no matches', async () => {
    const res = await http
      .get('/api/v1/search?q=zzznomatcheseverxyz&type=latest')
      .expect(200);

    expect(res.body.items.length).toBe(0);
  });

  it('works without authentication (Optional auth)', async () => {
    await http.get('/api/v1/search?q=test&type=top').expect(200);
  });

  it('returns 400 for missing q parameter', async () => {
    await http.get('/api/v1/search').expect(400);
  });

  it('does not show posts from blocked users to authenticated viewer', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    const uniqueTerm = `blocktest${Date.now().toString(36)}`;
    const post = await createPost(alice, `Post with ${uniqueTerm}`);

    // Bob blocks Alice
    await http
      .post(`/api/v1/users/${alice.handle}/block`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    const res = await http
      .get(`/api/v1/search?q=${uniqueTerm}&type=latest`)
      .set('Authorization', bearerHeader(bob))
      .expect(200);

    const ids = res.body.items.map((p: { id: string }) => p.id);
    expect(ids).not.toContain(post.id);
  });

  it('does not show posts from private accounts to non-followers', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    // Make Alice private
    await http
      .patch('/api/v1/users/me')
      .set('Authorization', bearerHeader(alice))
      .send({ isPrivate: true })
      .expect(200);

    const uniqueTerm = `privatesearch${Date.now().toString(36)}`;
    await createPost(alice, `Private post with ${uniqueTerm}`);

    const res = await http
      .get(`/api/v1/search?q=${uniqueTerm}&type=latest`)
      .set('Authorization', bearerHeader(bob))
      .expect(200);

    // Private posts should not appear for non-followers
    expect(res.body.items.length).toBe(0);
  });
});

// ─── People search ────────────────────────────────────────────────────────────

describe('GET /api/v1/search?type=people', () => {
  it('finds users by handle fragment', async () => {
    const alice = await createUser(app, { handle: 'searchalice001' });

    const res = await http
      .get('/api/v1/search?q=searchalice001&type=people')
      .expect(200);

    expect(Array.isArray(res.body.items)).toBe(true);
    const handles = res.body.items.map((u: { handle: string }) => u.handle);
    expect(handles).toContain(alice.handle);
  });

  it('does not show blocked users in people search', async () => {
    const alice = await createUser(app, { handle: 'blockedsearch001' });
    const bob = await createUser(app);

    // Bob blocks Alice
    await http
      .post(`/api/v1/users/${alice.handle}/block`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    const res = await http
      .get('/api/v1/search?q=blockedsearch001&type=people')
      .set('Authorization', bearerHeader(bob))
      .expect(200);

    const handles = res.body.items.map((u: { handle: string }) => u.handle);
    expect(handles).not.toContain(alice.handle);
  });
});

// ─── Suggestions ─────────────────────────────────────────────────────────────

describe('GET /api/v1/search/suggest', () => {
  it('returns user and tag suggestions', async () => {
    const alice = await createUser(app, { handle: 'suggestalice001' });

    const res = await http
      .get('/api/v1/search/suggest?q=suggestalice')
      .expect(200);

    expect(Array.isArray(res.body.users)).toBe(true);
    expect(Array.isArray(res.body.tags)).toBe(true);

    const handles = res.body.users.map((u: { handle: string }) => u.handle);
    expect(handles).toContain(alice.handle);
  });

  it('works without authentication', async () => {
    await http.get('/api/v1/search/suggest?q=any').expect(200);
  });

  it('returns 400 for missing q parameter', async () => {
    await http.get('/api/v1/search/suggest').expect(400);
  });
});

// ─── Trends ───────────────────────────────────────────────────────────────────

describe('GET /api/v1/trends', () => {
  it('returns trends array (may be empty on fresh start)', async () => {
    const res = await http.get('/api/v1/trends').expect(200);

    expect(res.body.trends).toBeDefined();
    expect(Array.isArray(res.body.trends)).toBe(true);
  });

  it('works without authentication', async () => {
    await http.get('/api/v1/trends').expect(200);
  });
});
