import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Job } from 'bullmq';
import { Media } from '../../../src/modules/media/media.entity';
import { STORAGE_PORT } from '../../../src/infra/storage/storage.port';

// ── Module-level mocks (hoisted before imports) ────────────────────────────────

vi.mock('sharp', () => {
  const sharpInstance = {
    metadata: vi.fn().mockResolvedValue({ width: 1920, height: 1080 }),
    autoOrient: vi.fn().mockReturnThis(),
    resize: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    toFile: vi.fn().mockResolvedValue({}),
    // page option constructor
  };
  const sharpFn = vi.fn().mockReturnValue(sharpInstance);
  return { default: sharpFn };
});

vi.mock('fluent-ffmpeg', () => {
  const ffmpegInstance = {
    videoCodec: vi.fn().mockReturnThis(),
    audioCodec: vi.fn().mockReturnThis(),
    outputOptions: vi.fn().mockReturnThis(),
    frames: vi.fn().mockReturnThis(),
    on: vi.fn().mockImplementation(function (
      this: ReturnType<typeof ffmpegInstance.on>,
      event: string,
      cb: (...args: unknown[]) => void,
    ) {
      if (event === 'end') {
        // Call the end callback asynchronously
        setImmediate(() => cb());
      }
      return this;
    }),
    save: vi.fn().mockReturnThis(),
    screenshots: vi.fn().mockReturnThis(),
  };

  const ffmpegFn = vi.fn().mockReturnValue(ffmpegInstance);
  // ffprobe mock
  (ffmpegFn as unknown as { ffprobe: typeof ffmpegFn.ffprobe }).ffprobe = vi.fn(
    (_path: string, cb: (err: null, data: unknown) => void) => {
      cb(null, {
        streams: [{ codec_type: 'video', width: 1280, height: 720 }],
        format: { duration: 30.5 },
      });
    },
  );
  return { default: ffmpegFn };
});

// ── Mock fs promises ───────────────────────────────────────────────────────────

vi.mock('fs/promises', () => ({
  mkdtemp: vi.fn().mockResolvedValue('/tmp/media-test-123'),
  rm: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(Buffer.from('fake-file-data')),
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { MediaProcessProcessor } from '../../../src/modules/media/media-process.processor';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMedia(overrides: Partial<Media> = {}): Media {
  return {
    id: '1111111111111',
    ownerId: 'user-uuid-1',
    type: 'image',
    status: 'processing',
    storageKey: 'uploads/user-uuid-1/1111111111111.jpeg',
    mime: 'image/jpeg',
    width: null,
    height: null,
    durationMs: null,
    altText: null,
    variants: {},
    createdAt: new Date('2026-06-07T00:00:00Z'),
    owner: {} as never,
    ...overrides,
  } as Media;
}

function makeJob(data: { mediaId: string; ownerId: string }): Job {
  return { data, attemptsMade: 0 } as unknown as Job;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MediaProcessProcessor', () => {
  let processor: MediaProcessProcessor;

  const mediaRepo = {
    findOne: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
  };

  const storageMock = {
    getPresignedUploadUrl: vi.fn().mockResolvedValue({
      uploadUrl: 'https://minio/presigned-put',
      key: 'k',
      expiresIn: 600,
    }),
    getPresignedDownloadUrl: vi.fn().mockResolvedValue({
      url: 'https://minio/variant-url',
      expiresIn: 31536000,
    }),
    delete: vi.fn(),
    exists: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock fetch globally for download + upload helpers
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: {},
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    }) as unknown as typeof fetch;

    const moduleRef = await Test.createTestingModule({
      providers: [
        MediaProcessProcessor,
        { provide: getRepositoryToken(Media), useValue: mediaRepo },
        { provide: STORAGE_PORT, useValue: storageMock },
      ],
    }).compile();

    processor = moduleRef.get(MediaProcessProcessor);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Already-ready idempotency ─────────────────────────────────────────────

  it('skips processing when media is already ready (idempotent)', async () => {
    const media = makeMedia({ status: 'ready' });
    mediaRepo.findOne.mockResolvedValue(media);

    await processor.process(makeJob({ mediaId: '1111111111111', ownerId: 'user-uuid-1' }));

    expect(mediaRepo.update).not.toHaveBeenCalled();
  });

  it('skips silently when media does not exist', async () => {
    mediaRepo.findOne.mockResolvedValue(null);

    await expect(
      processor.process(makeJob({ mediaId: 'nonexistent', ownerId: 'user-uuid-1' })),
    ).resolves.toBeUndefined();
    expect(mediaRepo.update).not.toHaveBeenCalled();
  });

  it('marks media as failed when storageKey is null', async () => {
    const media = makeMedia({ storageKey: null });
    mediaRepo.findOne.mockResolvedValue(media);

    await processor.process(makeJob({ mediaId: '1111111111111', ownerId: 'user-uuid-1' }));

    expect(mediaRepo.update).toHaveBeenCalledWith('1111111111111', { status: 'failed' });
  });

  // ── Image processing ──────────────────────────────────────────────────────

  it('processes image: uploads variants and sets status=ready', async () => {
    const media = makeMedia({ type: 'image', mime: 'image/jpeg' });
    mediaRepo.findOne.mockResolvedValue(media);

    await processor.process(makeJob({ mediaId: '1111111111111', ownerId: 'user-uuid-1' }));

    // Should update with status=ready and variants populated
    const updateCall = mediaRepo.update.mock.calls[0];
    expect(updateCall[0]).toBe('1111111111111');
    expect(updateCall[1].status).toBe('ready');
    expect(updateCall[1].variants).toBeDefined();
    expect(typeof updateCall[1].variants).toBe('object');
  });

  it('populates thumb variant for images', async () => {
    const media = makeMedia({ type: 'image', mime: 'image/jpeg' });
    mediaRepo.findOne.mockResolvedValue(media);

    await processor.process(makeJob({ mediaId: '1111111111111', ownerId: 'user-uuid-1' }));

    const updateCall = mediaRepo.update.mock.calls[0];
    expect(updateCall[1].variants.thumb).toBe('https://minio/variant-url');
  });

  it('populates width and height from image metadata', async () => {
    const media = makeMedia({ type: 'image', mime: 'image/jpeg' });
    mediaRepo.findOne.mockResolvedValue(media);

    await processor.process(makeJob({ mediaId: '1111111111111', ownerId: 'user-uuid-1' }));

    const updateCall = mediaRepo.update.mock.calls[0];
    expect(updateCall[1].width).toBe(1920);
    expect(updateCall[1].height).toBe(1080);
  });

  // ── GIF processing ────────────────────────────────────────────────────────

  it('processes gif: produces thumb and mp4 variants', async () => {
    const media = makeMedia({ type: 'gif', mime: 'image/gif' });
    mediaRepo.findOne.mockResolvedValue(media);

    await processor.process(makeJob({ mediaId: '1111111111111', ownerId: 'user-uuid-1' }));

    const updateCall = mediaRepo.update.mock.calls[0];
    expect(updateCall[1].status).toBe('ready');
    expect(updateCall[1].variants.thumb).toBeDefined();
    expect(updateCall[1].variants.mp4).toBeDefined();
  });

  // ── Video processing ──────────────────────────────────────────────────────

  it('processes video: produces mp4, poster, and thumb variants', async () => {
    const media = makeMedia({ type: 'video', mime: 'video/mp4' });
    mediaRepo.findOne.mockResolvedValue(media);

    await processor.process(makeJob({ mediaId: '1111111111111', ownerId: 'user-uuid-1' }));

    const updateCall = mediaRepo.update.mock.calls[0];
    expect(updateCall[1].status).toBe('ready');
    expect(updateCall[1].variants.mp4).toBeDefined();
    expect(updateCall[1].variants.poster).toBeDefined();
    expect(updateCall[1].variants.thumb).toBeDefined();
  });

  it('populates durationMs from video probe', async () => {
    const media = makeMedia({ type: 'video', mime: 'video/mp4' });
    mediaRepo.findOne.mockResolvedValue(media);

    await processor.process(makeJob({ mediaId: '1111111111111', ownerId: 'user-uuid-1' }));

    const updateCall = mediaRepo.update.mock.calls[0];
    expect(updateCall[1].durationMs).toBe(30500); // 30.5s * 1000
  });

  // ── Failure path ──────────────────────────────────────────────────────────

  it('marks media as failed and rethrows when processing throws', async () => {
    const media = makeMedia({ type: 'image', mime: 'image/jpeg' });
    mediaRepo.findOne.mockResolvedValue(media);

    // Make fetch fail to trigger error path
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    await expect(
      processor.process(makeJob({ mediaId: '1111111111111', ownerId: 'user-uuid-1' })),
    ).rejects.toThrow('Network error');

    expect(mediaRepo.update).toHaveBeenCalledWith('1111111111111', { status: 'failed' });
  });
});
