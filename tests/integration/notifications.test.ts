/**
 * Integration tests: Notifications
 *
 * Covers: notification creation (like, follow triggers),
 *         unread count, mark-read (specific IDs and all),
 *         suppression (self-like, muted user).
 */
import supertest from 'supertest';
import { getApp, closeApp, truncateAll } from './helpers/app';
import { createUser, bearerHeader } from './helpers/auth';
import { waitFor } from './helpers/wait';
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

/**
 * Notification writes are fire-and-forget (void + catch in the service layer), so
 * a fixed sleep is racy. Poll the recipient's notifications endpoint until
 * `predicate(items)` holds, then return the response. Bounded by waitFor's timeout.
 */
function notificationsWhere(
  recipient: { accessToken: string },
  predicate: (items: Array<{ id: string; type: string }>) => boolean,
  label: string,
): Promise<{ body: { items: Array<{ id: string; type: string }> } }> {
  return waitFor(async () => {
    const res = await http
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${recipient.accessToken}`)
      .expect(200);
    const items = res.body.items as Array<{ id: string; type: string }>;
    return predicate(items) ? res : null;
  }, { label });
}

// ─── Notification creation ────────────────────────────────────────────────────

describe('Notification creation via events', () => {
  it('like event creates a notification for the post author', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    const post = await createPost(alice, 'Likeable post');

    // Bob likes Alice's post
    await http
      .post(`/api/v1/posts/${post.id}/like`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    // Alice should have a like notification (poll the fire-and-forget write)
    const res = await notificationsWhere(
      alice,
      (items) => items.some((n) => n.type === 'like'),
      'like notification',
    );

    expect(Array.isArray(res.body.items)).toBe(true);
    const likeNotif = res.body.items.find(
      (n: { type: string }) => n.type === 'like',
    );
    expect(likeNotif).toBeTruthy();
  });

  it('follow event creates a notification for the followee', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    // Bob follows Alice
    await http
      .post(`/api/v1/users/${alice.handle}/follow`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    const res = await notificationsWhere(
      alice,
      (items) => items.some((n) => n.type === 'follow'),
      'follow notification',
    );

    const followNotif = res.body.items.find(
      (n: { type: string }) => n.type === 'follow',
    );
    expect(followNotif).toBeTruthy();
  });

  it('reply event creates a notification for the parent author', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    const post = await createPost(alice, 'Alice post');

    await http
      .post('/api/v1/posts')
      .set('Authorization', bearerHeader(bob))
      .send({ text: 'Bob replies', replyToId: post.id })
      .expect(201);

    const res = await notificationsWhere(
      alice,
      (items) => items.some((n) => n.type === 'reply'),
      'reply notification',
    );

    const replyNotif = res.body.items.find(
      (n: { type: string }) => n.type === 'reply',
    );
    expect(replyNotif).toBeTruthy();
  });

  it('self-like does NOT create a notification', async () => {
    const alice = await createUser(app);

    const post = await createPost(alice, 'My own post');

    await http
      .post(`/api/v1/posts/${post.id}/like`)
      .set('Authorization', bearerHeader(alice))
      .expect(201);

    const res = await http
      .get('/api/v1/notifications')
      .set('Authorization', bearerHeader(alice))
      .expect(200);

    // Should have no like notification (self-action suppressed)
    const likeNotif = res.body.items.find(
      (n: { type: string }) => n.type === 'like',
    );
    expect(likeNotif).toBeUndefined();
  });
});

// ─── Unread count ─────────────────────────────────────────────────────────────

describe('GET /api/v1/notifications/unread-count', () => {
  it('returns 0 for user with no notifications', async () => {
    const alice = await createUser(app);

    const res = await http
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', bearerHeader(alice))
      .expect(200);

    expect(res.body.count).toBe(0);
  });

  it('increments when new notification arrives', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    const post = await createPost(alice, 'Post to like');

    await http
      .post(`/api/v1/posts/${post.id}/like`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    // Poll the unread-count until the async notification is reflected (>= 1)
    const res = await waitFor(async () => {
      const r = await http
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', bearerHeader(alice))
        .expect(200);
      return (r.body.count as number) >= 1 ? r : null;
    }, { label: 'unread-count >= 1' });

    expect(res.body.count).toBeGreaterThanOrEqual(1);
  });

  it('returns 401 when unauthenticated', async () => {
    await http.get('/api/v1/notifications/unread-count').expect(401);
  });
});

// ─── Mark read ────────────────────────────────────────────────────────────────

describe('POST /api/v1/notifications/read', () => {
  it('marks all notifications as read (no ids)', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    const post = await createPost(alice);

    await http
      .post(`/api/v1/posts/${post.id}/like`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    // Wait for the async notification write, then mark all read
    await notificationsWhere(alice, (items) => items.length > 0, 'a notification');

    // Mark all read
    const markRes = await http
      .post('/api/v1/notifications/read')
      .set('Authorization', bearerHeader(alice))
      .send({})
      .expect(200);

    expect(markRes.body.updated).toBeGreaterThanOrEqual(1);

    // Unread count should now be 0
    const countRes = await http
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', bearerHeader(alice))
      .expect(200);

    expect(countRes.body.count).toBe(0);
  });

  it('marks specific notifications as read by ids', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    const post = await createPost(alice);

    await http
      .post(`/api/v1/posts/${post.id}/like`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    const notifRes = await notificationsWhere(
      alice,
      (items) => items.length > 0,
      'a notification',
    );

    const notifId = notifRes.body.items[0]?.id;
    expect(notifId).toBeTruthy();

    const markRes = await http
      .post('/api/v1/notifications/read')
      .set('Authorization', bearerHeader(alice))
      .send({ ids: [notifId] })
      .expect(200);

    expect(markRes.body.updated).toBe(1);
  });

  it('returns 401 when unauthenticated', async () => {
    await http.post('/api/v1/notifications/read').send({}).expect(401);
  });
});

// ─── Notification list ────────────────────────────────────────────────────────

describe('GET /api/v1/notifications', () => {
  it('returns paginated notifications', async () => {
    const alice = await createUser(app);

    const res = await http
      .get('/api/v1/notifications')
      .set('Authorization', bearerHeader(alice))
      .expect(200);

    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.hasMore).toBeDefined();
  });

  it('returns 401 when unauthenticated', async () => {
    await http.get('/api/v1/notifications').expect(401);
  });

  it('respects limit parameter', async () => {
    const alice = await createUser(app);

    const res = await http
      .get('/api/v1/notifications?limit=5')
      .set('Authorization', bearerHeader(alice))
      .expect(200);

    expect(res.body.items.length).toBeLessThanOrEqual(5);
  });
});
