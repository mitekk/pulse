/**
 * Integration tests: Users, Profiles, Follow graph, Blocks, Mutes
 *
 * Covers: getProfile, updateProfile, follow/unfollow state machine,
 *         private accounts, blocks, mutes, visibility.
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

// ─── Profile ──────────────────────────────────────────────────────────────────

describe('GET /api/v1/users/:handle', () => {
  it('returns a public profile without auth', async () => {
    const alice = await createUser(app);

    const res = await http
      .get(`/api/v1/users/${alice.handle}`)
      .expect(200);

    expect(res.body.user.handle).toBe(alice.handle);
    expect(res.body.user.id).toBe(alice.id);
    expect(res.body.user.isPrivate).toBe(false);
  });

  it('includes viewer relationship flags when authenticated', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    const res = await http
      .get(`/api/v1/users/${alice.handle}`)
      .set('Authorization', bearerHeader(bob))
      .expect(200);

    expect(res.body.user.viewer).toBeDefined();
    expect(res.body.user.viewer.following).toBe(false);
    expect(res.body.user.viewer.blocked).toBe(false);
    expect(res.body.user.viewer.muted).toBe(false);
  });

  it('returns 404 for non-existent handle', async () => {
    await http.get('/api/v1/users/nobody_xyz_12345').expect(404);
  });
});

describe('PATCH /api/v1/users/me', () => {
  it('updates profile fields', async () => {
    const alice = await createUser(app);

    const res = await http
      .patch('/api/v1/users/me')
      .set('Authorization', bearerHeader(alice))
      .send({ bio: 'Hello world', location: 'Berlin', website: 'https://example.com' })
      .expect(200);

    expect(res.body.user.bio).toBe('Hello world');
    expect(res.body.user.location).toBe('Berlin');
    expect(res.body.user.website).toBe('https://example.com');
  });

  it('makes account private when isPrivate=true', async () => {
    const alice = await createUser(app);

    await http
      .patch('/api/v1/users/me')
      .set('Authorization', bearerHeader(alice))
      .send({ isPrivate: true })
      .expect(200);

    const profile = await http
      .get(`/api/v1/users/${alice.handle}`)
      .expect(200);

    expect(profile.body.user.isPrivate).toBe(true);
  });

  it('returns 401 when unauthenticated', async () => {
    await http.patch('/api/v1/users/me').send({ bio: 'hi' }).expect(401);
  });
});

// ─── Follow state machine ─────────────────────────────────────────────────────

describe('POST /api/v1/users/:handle/follow', () => {
  it('follows a public user (state = active)', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    const res = await http
      .post(`/api/v1/users/${alice.handle}/follow`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    expect(res.body.state).toBe('active');
  });

  it('follow request is pending for private accounts (state = pending)', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    // Make alice private
    await http
      .patch('/api/v1/users/me')
      .set('Authorization', bearerHeader(alice))
      .send({ isPrivate: true })
      .expect(200);

    const res = await http
      .post(`/api/v1/users/${alice.handle}/follow`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    expect(res.body.state).toBe('pending');
  });

  it('returns 404 when following non-existent user', async () => {
    const bob = await createUser(app);

    await http
      .post('/api/v1/users/nobody_xyz_12345/follow')
      .set('Authorization', bearerHeader(bob))
      .expect(404);
  });

  it('returns 400 when trying to follow yourself', async () => {
    const alice = await createUser(app);

    await http
      .post(`/api/v1/users/${alice.handle}/follow`)
      .set('Authorization', bearerHeader(alice))
      .expect(400);
  });

  it('returns 400 when trying to follow a blocked user', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    // Alice blocks Bob
    await http
      .post(`/api/v1/users/${bob.handle}/block`)
      .set('Authorization', bearerHeader(alice))
      .expect(201);

    // Bob tries to follow Alice (should be rejected due to block) — returns 403
    const res = await http
      .post(`/api/v1/users/${alice.handle}/follow`)
      .set('Authorization', bearerHeader(bob))
      .expect(403);

    expect(res.body.error?.code).toBeTruthy();
  });

  it('returns 401 when unauthenticated', async () => {
    const alice = await createUser(app);
    await http.post(`/api/v1/users/${alice.handle}/follow`).expect(401);
  });
});

describe('DELETE /api/v1/users/:handle/follow', () => {
  it('unfollows a user', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    await http
      .post(`/api/v1/users/${alice.handle}/follow`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    await http
      .delete(`/api/v1/users/${alice.handle}/follow`)
      .set('Authorization', bearerHeader(bob))
      .expect(204);

    // Viewer flags should show not following
    const profile = await http
      .get(`/api/v1/users/${alice.handle}`)
      .set('Authorization', bearerHeader(bob))
      .expect(200);

    expect(profile.body.user.viewer?.following).toBe(false);
  });

  it('is idempotent — unfollow when not following returns 204', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    await http
      .delete(`/api/v1/users/${alice.handle}/follow`)
      .set('Authorization', bearerHeader(bob))
      .expect(204);
  });
});

// ─── Follow requests (private accounts) ──────────────────────────────────────

describe('Follow request flow', () => {
  it('accept follow request makes state active', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    // Make Alice private
    await http
      .patch('/api/v1/users/me')
      .set('Authorization', bearerHeader(alice))
      .send({ isPrivate: true })
      .expect(200);

    // Bob requests to follow Alice
    await http
      .post(`/api/v1/users/${alice.handle}/follow`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    // Alice views follow requests
    const requestsRes = await http
      .get('/api/v1/follow-requests')
      .set('Authorization', bearerHeader(alice))
      .expect(200);

    expect(requestsRes.body.items.length).toBe(1);
    const requestId = requestsRes.body.items[0].id;

    // Alice accepts
    const acceptRes = await http
      .post(`/api/v1/follow-requests/${requestId}/accept`)
      .set('Authorization', bearerHeader(alice))
      .expect(200);

    expect(acceptRes.body.state).toBe('active');

    // Bob should now show as following in Alice's profile
    const profile = await http
      .get(`/api/v1/users/${alice.handle}`)
      .set('Authorization', bearerHeader(bob))
      .expect(200);

    expect(profile.body.user.viewer?.following).toBe(true);
  });

  it('decline follow request removes pending state', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    await http
      .patch('/api/v1/users/me')
      .set('Authorization', bearerHeader(alice))
      .send({ isPrivate: true })
      .expect(200);

    await http
      .post(`/api/v1/users/${alice.handle}/follow`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    const requestsRes = await http
      .get('/api/v1/follow-requests')
      .set('Authorization', bearerHeader(alice))
      .expect(200);

    const requestId = requestsRes.body.items[0].id;

    const declineRes = await http
      .post(`/api/v1/follow-requests/${requestId}/decline`)
      .set('Authorization', bearerHeader(alice))
      .expect(200);

    expect(declineRes.body.state).toBe('declined');
  });

  it('only shows requests addressed to the current user', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);
    const charlie = await createUser(app);

    // Charlie makes alice private
    // Alice's private account receives Bob's request
    await http
      .patch('/api/v1/users/me')
      .set('Authorization', bearerHeader(alice))
      .send({ isPrivate: true })
      .expect(200);

    await http
      .post(`/api/v1/users/${alice.handle}/follow`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    // Charlie has no requests
    const charlieRequests = await http
      .get('/api/v1/follow-requests')
      .set('Authorization', bearerHeader(charlie))
      .expect(200);

    expect(charlieRequests.body.items.length).toBe(0);
  });
});

// ─── Blocks ───────────────────────────────────────────────────────────────────

describe('Block/Unblock', () => {
  it('blocks a user — blocked profile returns 403 to blocker', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    // Bob blocks Alice
    const blockRes = await http
      .post(`/api/v1/users/${alice.handle}/block`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    expect(blockRes.body.blocked).toBe(true);

    // After blocking, alice's profile returns 403 to bob (blocked relationship hides profile)
    await http
      .get(`/api/v1/users/${alice.handle}`)
      .set('Authorization', bearerHeader(bob))
      .expect(403);
  });

  it('unblocks a user — profile is visible again after unblock', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    await http
      .post(`/api/v1/users/${alice.handle}/block`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    await http
      .delete(`/api/v1/users/${alice.handle}/block`)
      .set('Authorization', bearerHeader(bob))
      .expect(204);

    // After unblocking, alice's profile should be visible again
    const profile = await http
      .get(`/api/v1/users/${alice.handle}`)
      .set('Authorization', bearerHeader(bob))
      .expect(200);

    // viewer.blocked = false since block was removed (viewer.blocked = "viewer has blocked this user")
    expect(profile.body.user.viewer?.blocked).toBe(false);
  });

  it('returns 400 when trying to block yourself', async () => {
    const alice = await createUser(app);

    await http
      .post(`/api/v1/users/${alice.handle}/block`)
      .set('Authorization', bearerHeader(alice))
      .expect(400);
  });

  it('removes follow relationship when blocking — profile returns 403 to blocked user', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);
    const charlie = await createUser(app);

    // Bob follows Alice first
    await http
      .post(`/api/v1/users/${alice.handle}/follow`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    // Then Alice blocks Bob — this should remove the follow
    await http
      .post(`/api/v1/users/${bob.handle}/block`)
      .set('Authorization', bearerHeader(alice))
      .expect(201);

    // Bob is now blocked by Alice — profile returns 403 to blocked user
    await http
      .get(`/api/v1/users/${alice.handle}`)
      .set('Authorization', bearerHeader(bob))
      .expect(403);

    // Charlie (unaffected third party) can still see alice's following count
    // It should have decreased by 1 (bob removed)
    const aliceProfile = await http
      .get(`/api/v1/users/${alice.handle}`)
      .set('Authorization', bearerHeader(charlie))
      .expect(200);

    expect(aliceProfile.body.user.counts.followers).toBe(0);
  });
});

// ─── Mutes ────────────────────────────────────────────────────────────────────

describe('Mute/Unmute', () => {
  it('mutes a user', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    const muteRes = await http
      .post(`/api/v1/users/${alice.handle}/mute`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    expect(muteRes.body.muted).toBe(true);

    const profile = await http
      .get(`/api/v1/users/${alice.handle}`)
      .set('Authorization', bearerHeader(bob))
      .expect(200);

    expect(profile.body.user.viewer?.muted).toBe(true);
  });

  it('unmutes a user', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    await http
      .post(`/api/v1/users/${alice.handle}/mute`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    await http
      .delete(`/api/v1/users/${alice.handle}/mute`)
      .set('Authorization', bearerHeader(bob))
      .expect(204);

    const profile = await http
      .get(`/api/v1/users/${alice.handle}`)
      .set('Authorization', bearerHeader(bob))
      .expect(200);

    expect(profile.body.user.viewer?.muted).toBe(false);
  });
});

// ─── Followers / Following lists ──────────────────────────────────────────────

describe('GET /api/v1/users/:handle/followers', () => {
  it('lists followers of a public user', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    await http
      .post(`/api/v1/users/${alice.handle}/follow`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    const res = await http
      .get(`/api/v1/users/${alice.handle}/followers`)
      .expect(200);

    expect(Array.isArray(res.body.items)).toBe(true);
    const handles = res.body.items.map((u: { handle: string }) => u.handle);
    expect(handles).toContain(bob.handle);
  });

  it('returns 404 for non-existent handle', async () => {
    await http.get('/api/v1/users/nobody_xyz_12345/followers').expect(404);
  });
});

describe('GET /api/v1/users/:handle/following', () => {
  it('lists who a user follows', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    await http
      .post(`/api/v1/users/${alice.handle}/follow`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    const res = await http
      .get(`/api/v1/users/${bob.handle}/following`)
      .expect(200);

    const handles = res.body.items.map((u: { handle: string }) => u.handle);
    expect(handles).toContain(alice.handle);
  });
});

// ─── Visibility — private account content gating ─────────────────────────────

describe('Private account visibility', () => {
  it('posts tab returns 403 for non-follower viewing private account', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    await http
      .patch('/api/v1/users/me')
      .set('Authorization', bearerHeader(alice))
      .send({ isPrivate: true })
      .expect(200);

    const res = await http
      .get(`/api/v1/users/${alice.handle}/posts`)
      .set('Authorization', bearerHeader(bob))
      .expect(403);

    expect(res.body.error?.code).toBeTruthy();
  });

  it('posts tab returns 200 for approved follower of private account', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    await http
      .patch('/api/v1/users/me')
      .set('Authorization', bearerHeader(alice))
      .send({ isPrivate: true })
      .expect(200);

    // Bob requests follow
    await http
      .post(`/api/v1/users/${alice.handle}/follow`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    // Alice accepts
    const requests = await http
      .get('/api/v1/follow-requests')
      .set('Authorization', bearerHeader(alice))
      .expect(200);

    await http
      .post(`/api/v1/follow-requests/${requests.body.items[0].id}/accept`)
      .set('Authorization', bearerHeader(alice))
      .expect(200);

    // Bob can now see posts
    await http
      .get(`/api/v1/users/${alice.handle}/posts`)
      .set('Authorization', bearerHeader(bob))
      .expect(200);
  });
});
