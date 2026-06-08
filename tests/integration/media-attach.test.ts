/**
 * Integration tests: Media-Attach wiring in PostsService
 *
 * Verifies that the real MediaAttachAdapter (from @Global MediaModule) is wired
 * into PostsModule.  Covers happy-path attach, ownership enforcement, and
 * status enforcement — the three rules that matter most at the seam.
 *
 * Bootstrap/auth/truncate helpers are the same singletons used by all siblings.
 */
import supertest from 'supertest';
import { getApp, closeApp, truncateAll, getDataSource } from './helpers/app';
import { createUser, bearerHeader } from './helpers/auth';
import { SnowflakeUtil } from '../../backend/src/common/utils/snowflake.util';
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

// ── Seed helper ───────────────────────────────────────────────────────────────

interface SeedMediaOpts {
  ownerId: string;
  type?: 'image' | 'gif' | 'video';
  status?: 'pending' | 'processing' | 'ready' | 'failed';
  mime?: string;
}

/**
 * Directly inserts a media row (skips MinIO upload).
 * Returns the generated Snowflake id string.
 */
async function seedMedia(opts: SeedMediaOpts): Promise<string> {
  const ds = await getDataSource();
  const id = new SnowflakeUtil(7).generate(); // machine 7 — avoids colliding with app-generated IDs

  const type = opts.type ?? 'image';
  const status = opts.status ?? 'ready';
  const mime = opts.mime ?? 'image/jpeg';

  await ds.query(
    `INSERT INTO media
       (id, owner_id, type, status, mime, storage_key, width, height, duration_ms, alt_text, variants, created_at)
     VALUES ($1, $2, $3, $4, $5, NULL, 800, 600, NULL, NULL, '{}', NOW())`,
    [id, opts.ownerId, type, status, mime],
  );

  return id;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Media-attach: POST /api/v1/posts with mediaIds', () => {
  it('attaches a ready image and returns it in the post media array', async () => {
    const alice = await createUser(app);
    const mediaId = await seedMedia({ ownerId: alice.id, type: 'image', mime: 'image/jpeg' });

    const res = await http
      .post('/api/v1/posts')
      .set('Authorization', bearerHeader(alice))
      .send({ text: 'Look at this photo', mediaIds: [mediaId] })
      .expect(201);

    const post = res.body.post as {
      id: string;
      media: Array<{ id: string; type: string; width: number | null; height: number | null }>;
    };

    // The post must be created and contain exactly the one media item we seeded
    expect(post.id).toBeTruthy();
    expect(Array.isArray(post.media)).toBe(true);
    expect(post.media).toHaveLength(1);

    // Assert actual data values from the API — id, type and geometric fields
    const attached = post.media[0];
    expect(attached.id).toBe(mediaId);
    expect(attached.type).toBe('image');
    // width and height were set to 800 × 600 in the seed row
    expect(attached.width).toBe(800);
    expect(attached.height).toBe(600);
  });

  it('returns 403 with MEDIA_NOT_OWNED when media belongs to a different user', async () => {
    const alice = await createUser(app);
    const bob = await createUser(app);

    // Media owned by Bob — Alice tries to attach it to her post
    const mediaId = await seedMedia({ ownerId: bob.id, type: 'image', status: 'ready' });

    const res = await http
      .post('/api/v1/posts')
      .set('Authorization', bearerHeader(alice))
      .send({ text: 'Trying to steal media', mediaIds: [mediaId] })
      .expect(403);

    expect(res.body.error?.code).toBe('MEDIA_NOT_OWNED');
  });

  it('returns 400 with MEDIA_NOT_READY when media status is pending', async () => {
    const alice = await createUser(app);

    // Media owned by Alice but not yet ready
    const mediaId = await seedMedia({
      ownerId: alice.id,
      type: 'image',
      status: 'pending',
    });

    const res = await http
      .post('/api/v1/posts')
      .set('Authorization', bearerHeader(alice))
      .send({ text: 'Attaching unfinished upload', mediaIds: [mediaId] })
      .expect(400);

    expect(res.body.error?.code).toBe('MEDIA_NOT_READY');
  });
});
