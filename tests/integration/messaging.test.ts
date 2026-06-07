/**
 * Integration tests: Messaging (DMs)
 *
 * Covers: conversation create (idempotent), message send with nonce idempotency,
 *         DM permission enforcement (dmPrivacy), read receipts, conversation mute.
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

// ─── Conversation creation ────────────────────────────────────────────────────

describe('POST /api/v1/conversations', () => {
  it('creates a conversation between two users', async () => {
    const alice = await createUser(app, { handle: 'alice_dm' });
    const bob = await createUser(app, { handle: 'bob_dm' });

    // Set both users to allow DMs from everyone
    await http
      .patch('/api/v1/users/me')
      .set('Authorization', bearerHeader(alice))
      .send({ dmPrivacy: 'everyone' })
      .expect(200);

    const res = await http
      .post('/api/v1/conversations')
      .set('Authorization', bearerHeader(bob))
      .send({ recipientHandle: alice.handle })
      .expect(201);

    expect(res.body.conversation.id).toBeTruthy();
    const handles = res.body.conversation.participants.map(
      (p: { handle: string }) => p.handle,
    );
    expect(handles).toContain(alice.handle);
    expect(handles).toContain(bob.handle);
  });

  it('is idempotent — returns existing conversation on second call', async () => {
    const alice = await createUser(app, { handle: 'alice_dm2' });
    const bob = await createUser(app, { handle: 'bob_dm2' });

    await http
      .patch('/api/v1/users/me')
      .set('Authorization', bearerHeader(alice))
      .send({ dmPrivacy: 'everyone' })
      .expect(200);

    const first = await http
      .post('/api/v1/conversations')
      .set('Authorization', bearerHeader(bob))
      .send({ recipientHandle: alice.handle })
      .expect(201);

    const second = await http
      .post('/api/v1/conversations')
      .set('Authorization', bearerHeader(bob))
      .send({ recipientHandle: alice.handle })
      .expect(201);

    expect(first.body.conversation.id).toBe(second.body.conversation.id);
  });

  it('returns 400 when DM privacy restricts sender (not following)', async () => {
    const alice = await createUser(app, { handle: 'alice_dm3' });
    const bob = await createUser(app, { handle: 'bob_dm3' });

    // Alice restricts DMs to following only (default)
    // Bob doesn't follow Alice — so Bob should not be able to DM Alice
    await http
      .patch('/api/v1/users/me')
      .set('Authorization', bearerHeader(alice))
      .send({ dmPrivacy: 'following' })
      .expect(200);

    const res = await http
      .post('/api/v1/conversations')
      .set('Authorization', bearerHeader(bob))
      .send({ recipientHandle: alice.handle });

    // Should be rejected — 400 or 403
    expect([400, 403]).toContain(res.status);
  });

  it('allows DM when mutual follow exists (dmPrivacy=following requires mutual)', async () => {
    const alice = await createUser(app, { handle: 'alice_dm4' });
    const bob = await createUser(app, { handle: 'bob_dm4' });

    await http
      .patch('/api/v1/users/me')
      .set('Authorization', bearerHeader(alice))
      .send({ dmPrivacy: 'following' })
      .expect(200);

    // Bob follows Alice AND Alice follows Bob (mutual)
    await http
      .post(`/api/v1/users/${alice.handle}/follow`)
      .set('Authorization', bearerHeader(bob))
      .expect(201);

    await http
      .post(`/api/v1/users/${bob.handle}/follow`)
      .set('Authorization', bearerHeader(alice))
      .expect(201);

    await http
      .post('/api/v1/conversations')
      .set('Authorization', bearerHeader(bob))
      .send({ recipientHandle: alice.handle })
      .expect(201);
  });

  it('returns 404 for non-existent recipient', async () => {
    const bob = await createUser(app);

    await http
      .post('/api/v1/conversations')
      .set('Authorization', bearerHeader(bob))
      .send({ recipientHandle: 'nobody_xyz_12345' })
      .expect(404);
  });

  it('returns 401 when unauthenticated', async () => {
    await http
      .post('/api/v1/conversations')
      .send({ recipientHandle: 'anybody' })
      .expect(401);
  });
});

// ─── Messages ─────────────────────────────────────────────────────────────────

describe('POST /api/v1/conversations/:id/messages', () => {
  it('sends a message and returns MessageDto', async () => {
    const alice = await createUser(app, { handle: 'alice_msg' });
    const bob = await createUser(app, { handle: 'bob_msg' });

    await http
      .patch('/api/v1/users/me')
      .set('Authorization', bearerHeader(alice))
      .send({ dmPrivacy: 'everyone' })
      .expect(200);

    const convRes = await http
      .post('/api/v1/conversations')
      .set('Authorization', bearerHeader(bob))
      .send({ recipientHandle: alice.handle })
      .expect(201);

    const convId = convRes.body.conversation.id;

    const msgRes = await http
      .post(`/api/v1/conversations/${convId}/messages`)
      .set('Authorization', bearerHeader(bob))
      .send({ text: 'Hello Alice!', clientNonce: 'nonce-001' })
      .expect(201);

    expect(msgRes.body.message.text).toBe('Hello Alice!');
    expect(msgRes.body.message.id).toBeTruthy();
  });

  it('nonce idempotency — same nonce returns same message', async () => {
    const alice = await createUser(app, { handle: 'alice_nonce' });
    const bob = await createUser(app, { handle: 'bob_nonce' });

    await http
      .patch('/api/v1/users/me')
      .set('Authorization', bearerHeader(alice))
      .send({ dmPrivacy: 'everyone' })
      .expect(200);

    const convRes = await http
      .post('/api/v1/conversations')
      .set('Authorization', bearerHeader(bob))
      .send({ recipientHandle: alice.handle })
      .expect(201);

    const convId = convRes.body.conversation.id;

    const first = await http
      .post(`/api/v1/conversations/${convId}/messages`)
      .set('Authorization', bearerHeader(bob))
      .send({ text: 'Idempotent msg', clientNonce: 'nonce-idem-001' })
      .expect(201);

    const second = await http
      .post(`/api/v1/conversations/${convId}/messages`)
      .set('Authorization', bearerHeader(bob))
      .send({ text: 'Idempotent msg', clientNonce: 'nonce-idem-001' })
      .expect(201);

    expect(first.body.message.id).toBe(second.body.message.id);
  });

  it('returns 400 when clientNonce is missing', async () => {
    const alice = await createUser(app, { handle: 'alice_no_nonce' });
    const bob = await createUser(app, { handle: 'bob_no_nonce' });

    await http
      .patch('/api/v1/users/me')
      .set('Authorization', bearerHeader(alice))
      .send({ dmPrivacy: 'everyone' })
      .expect(200);

    const convRes = await http
      .post('/api/v1/conversations')
      .set('Authorization', bearerHeader(bob))
      .send({ recipientHandle: alice.handle })
      .expect(201);

    const convId = convRes.body.conversation.id;

    await http
      .post(`/api/v1/conversations/${convId}/messages`)
      .set('Authorization', bearerHeader(bob))
      .send({ text: 'No nonce' })
      .expect(400);
  });

  it('returns 403 when non-participant tries to send a message', async () => {
    const alice = await createUser(app, { handle: 'alice_403' });
    const bob = await createUser(app, { handle: 'bob_403' });
    const charlie = await createUser(app, { handle: 'charlie_403' });

    await http
      .patch('/api/v1/users/me')
      .set('Authorization', bearerHeader(alice))
      .send({ dmPrivacy: 'everyone' })
      .expect(200);

    const convRes = await http
      .post('/api/v1/conversations')
      .set('Authorization', bearerHeader(bob))
      .send({ recipientHandle: alice.handle })
      .expect(201);

    const convId = convRes.body.conversation.id;

    // Charlie is not in the conversation
    await http
      .post(`/api/v1/conversations/${convId}/messages`)
      .set('Authorization', bearerHeader(charlie))
      .send({ text: 'Intrusion attempt', clientNonce: 'nonce-charlie-001' })
      .expect(403);
  });
});

// ─── List conversations ───────────────────────────────────────────────────────

describe('GET /api/v1/conversations', () => {
  it('lists conversations for the current user', async () => {
    const alice = await createUser(app, { handle: 'alice_list' });
    const bob = await createUser(app, { handle: 'bob_list' });

    await http
      .patch('/api/v1/users/me')
      .set('Authorization', bearerHeader(alice))
      .send({ dmPrivacy: 'everyone' })
      .expect(200);

    await http
      .post('/api/v1/conversations')
      .set('Authorization', bearerHeader(bob))
      .send({ recipientHandle: alice.handle })
      .expect(201);

    const res = await http
      .get('/api/v1/conversations')
      .set('Authorization', bearerHeader(alice))
      .expect(200);

    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
  });

  it('returns 401 when unauthenticated', async () => {
    await http.get('/api/v1/conversations').expect(401);
  });
});

// ─── Messages list ────────────────────────────────────────────────────────────

describe('GET /api/v1/conversations/:id/messages', () => {
  it('lists messages in a conversation', async () => {
    const alice = await createUser(app, { handle: 'alice_msgs' });
    const bob = await createUser(app, { handle: 'bob_msgs' });

    await http
      .patch('/api/v1/users/me')
      .set('Authorization', bearerHeader(alice))
      .send({ dmPrivacy: 'everyone' })
      .expect(200);

    const convRes = await http
      .post('/api/v1/conversations')
      .set('Authorization', bearerHeader(bob))
      .send({ recipientHandle: alice.handle })
      .expect(201);

    const convId = convRes.body.conversation.id;

    await http
      .post(`/api/v1/conversations/${convId}/messages`)
      .set('Authorization', bearerHeader(bob))
      .send({ text: 'Hello!', clientNonce: 'nonce-hello-001' })
      .expect(201);

    const res = await http
      .get(`/api/v1/conversations/${convId}/messages`)
      .set('Authorization', bearerHeader(alice))
      .expect(200);

    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    expect(res.body.items[0].text).toBe('Hello!');
  });

  it('returns 403 for non-participant', async () => {
    const alice = await createUser(app, { handle: 'alice_msgs2' });
    const bob = await createUser(app, { handle: 'bob_msgs2' });
    const charlie = await createUser(app, { handle: 'charlie_msgs2' });

    await http
      .patch('/api/v1/users/me')
      .set('Authorization', bearerHeader(alice))
      .send({ dmPrivacy: 'everyone' })
      .expect(200);

    const convRes = await http
      .post('/api/v1/conversations')
      .set('Authorization', bearerHeader(bob))
      .send({ recipientHandle: alice.handle })
      .expect(201);

    const convId = convRes.body.conversation.id;

    await http
      .get(`/api/v1/conversations/${convId}/messages`)
      .set('Authorization', bearerHeader(charlie))
      .expect(403);
  });
});

// ─── Read receipts ────────────────────────────────────────────────────────────

describe('POST /api/v1/conversations/:id/read', () => {
  it('marks conversation as read', async () => {
    const alice = await createUser(app, { handle: 'alice_read' });
    const bob = await createUser(app, { handle: 'bob_read' });

    await http
      .patch('/api/v1/users/me')
      .set('Authorization', bearerHeader(alice))
      .send({ dmPrivacy: 'everyone' })
      .expect(200);

    const convRes = await http
      .post('/api/v1/conversations')
      .set('Authorization', bearerHeader(bob))
      .send({ recipientHandle: alice.handle })
      .expect(201);

    const convId = convRes.body.conversation.id;

    const msgRes = await http
      .post(`/api/v1/conversations/${convId}/messages`)
      .set('Authorization', bearerHeader(bob))
      .send({ text: 'Read me', clientNonce: 'nonce-read-001' })
      .expect(201);

    const messageId = msgRes.body.message.id;

    const readRes = await http
      .post(`/api/v1/conversations/${convId}/read`)
      .set('Authorization', bearerHeader(alice))
      .send({ lastReadMessageId: messageId })
      .expect(200);

    expect(readRes.body.ok).toBe(true);
  });
});

// ─── Conversation mute ────────────────────────────────────────────────────────

describe('Conversation mute/unmute', () => {
  it('mutes and unmutes a conversation', async () => {
    const alice = await createUser(app, { handle: 'alice_mute' });
    const bob = await createUser(app, { handle: 'bob_mute' });

    await http
      .patch('/api/v1/users/me')
      .set('Authorization', bearerHeader(alice))
      .send({ dmPrivacy: 'everyone' })
      .expect(200);

    const convRes = await http
      .post('/api/v1/conversations')
      .set('Authorization', bearerHeader(bob))
      .send({ recipientHandle: alice.handle })
      .expect(201);

    const convId = convRes.body.conversation.id;

    const muteRes = await http
      .post(`/api/v1/conversations/${convId}/mute`)
      .set('Authorization', bearerHeader(alice))
      .expect(200);

    expect(muteRes.body.muted).toBe(true);

    const unmuteRes = await http
      .delete(`/api/v1/conversations/${convId}/mute`)
      .set('Authorization', bearerHeader(alice))
      .expect(200);

    expect(unmuteRes.body.muted).toBe(false);
  });
});
