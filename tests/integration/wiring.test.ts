/**
 * Integration tests: Production DI wiring assertions + RealtimePublisherService round-trip
 *
 * Part 1 — DI wiring assertions:
 *   Verifies that the production bindings are live in the integration bootstrap:
 *   - REALTIME_PUBLISHER_PORT resolves to RealtimePublisherService (not the Noop)
 *   - MEDIA_ATTACH_PORT resolves to MediaAttachAdapter (not the Noop)
 *
 * Part 2 — Publisher pub/sub round-trip:
 *   Injects a fake Socket.IO server, calls publishNotification, and asserts that
 *   the Redis pub/sub hop delivers the payload back via the real subscriber and
 *   emits to the correct room.
 */

import { getApp, closeApp } from './helpers/app';
import { REALTIME_PUBLISHER_PORT } from '../../backend/src/modules/timeline/realtime-publisher.port';
import { RealtimePublisherService } from '../../backend/src/modules/realtime/realtime-publisher.service';
import { MEDIA_ATTACH_PORT } from '../../backend/src/modules/posts/media-attach.port';
import { MediaAttachAdapter } from '../../backend/src/modules/media/media-attach.adapter';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

let app: NestFastifyApplication;

beforeAll(async () => {
  app = await getApp();
});

afterAll(async () => {
  await closeApp();
});

// ── Part 1: DI wiring assertions ──────────────────────────────────────────────

describe('Production DI wiring', () => {
  it('REALTIME_PUBLISHER_PORT resolves to the real RealtimePublisherService', () => {
    const instance = app.get(REALTIME_PUBLISHER_PORT, { strict: false });
    expect(instance).toBeInstanceOf(RealtimePublisherService);
  });

  it('MEDIA_ATTACH_PORT resolves to the real MediaAttachAdapter', () => {
    const instance = app.get(MEDIA_ATTACH_PORT, { strict: false });
    expect(instance).toBeInstanceOf(MediaAttachAdapter);
  });
});

// ── Part 2: RealtimePublisherService pub/sub round-trip ───────────────────────

describe('RealtimePublisherService pub/sub round-trip', () => {
  /**
   * Fake Socket.IO server that captures all .to().emit() calls.
   * We inject this via publisher.setServer() before the test and restore
   * undefined afterwards so the singleton doesn't leak a stale reference.
   */
  interface CapturedEmit {
    room: string;
    event: string;
    payload: unknown;
  }

  const captured: CapturedEmit[] = [];

  const fakeIo = {
    to(room: string) {
      return {
        emit(event: string, payload: unknown) {
          captured.push({ room, event, payload });
        },
      };
    },
  };

  let publisher: RealtimePublisherService;

  beforeAll(() => {
    publisher = app.get(REALTIME_PUBLISHER_PORT, { strict: false }) as RealtimePublisherService;
    // Inject the fake Socket.IO server so handlePubSubMessage can emit
    publisher.setServer(fakeIo as any);
  });

  afterAll(() => {
    // Restore: remove fake server reference so it does not leak to other test files
    publisher.setServer(undefined as any);
  });

  beforeEach(() => {
    // Clear captures between tests
    captured.length = 0;
  });

  it('publishNotification delivers to the correct room via Redis pub/sub', async () => {
    const recipientId = 'test-user-uuid-wiring-01';
    const notification = { id: 'n1', type: 'like', createdAt: '2026-06-08T00:00:00Z' };

    // The ioredis subscriber connection uses enableReadyCheck=true.  When the app
    // re-initialises (each file calls closeApp→getApp) the subscriber reconnects and
    // ioredis fires a ready-check INFO command.  Redis rejects INFO in subscriber
    // mode, ioredis logs the error and reconnects, looping until it eventually
    // succeeds.  During this cycle the subscriber IS subscribed to channels and CAN
    // receive messages — ioredis re-subscribes before the ready check — but the
    // connection's status property never reaches 'ready'.
    //
    // Strategy: retry-publish every 250ms for up to 10s.  On each attempt we publish
    // and wait 200ms for the round-trip.  Once the subscriber has recovered from the
    // reconnect cycle a publish will succeed.
    const totalBudgetMs = 10_000;
    const retryIntervalMs = 250;
    const perAttemptWaitMs = 200;
    const deadline = Date.now() + totalBudgetMs;

    while (captured.length === 0 && Date.now() < deadline) {
      await publisher.publishNotification(recipientId, notification);
      // Short wait: if the subscriber is ready the message arrives within ~10ms
      const attemptEnd = Date.now() + perAttemptWaitMs;
      while (captured.length === 0 && Date.now() < attemptEnd) {
        await new Promise<void>((resolve) => setTimeout(resolve, 20));
      }
      if (captured.length > 0) break;
      // No capture yet — wait before next publish attempt
      await new Promise<void>((resolve) => setTimeout(resolve, retryIntervalMs));
    }

    // Assert correct room, event, and payload
    const entry = captured.find((c) => c.room === `user:${recipientId}`);
    expect(entry).toBeDefined();
    expect(entry!.room).toBe(`user:${recipientId}`);
    expect(entry!.event).toBe('notification.new');
    expect(entry!.payload).toMatchObject({ id: 'n1', type: 'like' });
  });

  it('publishNotification resolves without throwing when no io is set', async () => {
    // Temporarily clear the server reference to verify the bail-early guard
    publisher.setServer(undefined as any);

    await expect(
      publisher.publishNotification('orphan-user', { id: 'n2', type: 'follow' }),
    ).resolves.not.toThrow();

    // Restore fake io for any remaining tests in this describe block
    publisher.setServer(fakeIo as any);
  });
});
