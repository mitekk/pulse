import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Readable } from 'stream';
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
  };
  return { default: vi.fn().mockReturnValue(sharpInstance) };
});

vi.mock('fluent-ffmpeg', () => {
  const ffmpegInstance = {
    videoCodec: vi.fn().mockReturnThis(),
    audioCodec: vi.fn().mockReturnThis(),
    outputOptions: vi.fn().mockReturnThis(),
    frames: vi.fn().mockReturnThis(),
    on: vi.fn().mockImplementation(function (this: unknown, event: string, cb: () => void) {
      if (event === 'end') setImmediate(() => cb());
      return this;
    }),
    save: vi.fn().mockReturnThis(),
    screenshots: vi.fn().mockReturnThis(),
  };
  const ffmpegFn = vi.fn().mockReturnValue(ffmpegInstance);
  (ffmpegFn as unknown as { ffprobe: unknown }).ffprobe = vi.fn(
    (_path: string, cb: (err: null, data: unknown) => void) => {
      cb(null, {
        streams: [{ codec_type: 'video', width: 1280, height: 720 }],
        format: { duration: 30.5 },
      });
    },
  );
  return { default: ffmpegFn };
});

vi.mock('fs/promises', () => ({
  mkdtemp: vi.fn().mockResolvedValue('/tmp/media-test-123'),
  rm: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(Buffer.from('fake-file-data')),
}));

vi.mock('fs', () => ({ createWriteStream: vi.fn().mockReturnValue({}) }));
vi.mock('stream/promises', () => ({ pipeline: vi.fn().mockResolvedValue(undefined) }));

import { MediaProcessProcessor } from '../../../src/modules/media/media-process.processor';

function makeMedia(overrides: Partial<Media> = {}): Media {
  return {
    id: '1111111111111',
    ownerId: 'user-uuid-1',
    type: 'image',
    status: 'processing',
    storageKey: 'media/user-uuid-1/uuid/original.jpeg',
    mime: 'image/jpeg',
    width: null,
    height: null,
    durationMs: null,
    altText: null,
    variants: {},
    byteSize: 1000,
    committedAt: new Date('2026-06-07T00:00:00Z'),
    createdAt: new Date('2026-06-07T00:00:00Z'),
    updatedAt: new Date('2026-06-07T00:00:00Z'),
    owner: {} as never,
    ...overrides,
  } as Media;
}

function makeJob(data: { mediaId: string; ownerId: string }): Job {
  return { data, attemptsMade: 0 } as unknown as Job;
}

describe('MediaProcessProcessor', () => {
  let processor: MediaProcessProcessor;

  const mediaRepo = { findOne: vi.fn(), update: vi.fn().mockResolvedValue({}) };

  const storageMock = {
    createPresignedPost: vi.fn(),
    headObject: vi.fn(),
    getObjectStream: vi.fn().mockResolvedValue(Readable.from([Buffer.from('orig')])),
    putObject: vi.fn().mockResolvedValue(undefined),
    deleteObject: vi.fn().mockResolvedValue(undefined),
    getPublicUrl: vi.fn((k: string) => `http://localhost:9000/tweeter-media/${k}`),
    listBucketBytes: vi.fn().mockResolvedValue(0),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    storageMock.getObjectStream.mockResolvedValue(Readable.from([Buffer.from('orig')]));
    const moduleRef = await Test.createTestingModule({
      providers: [
        MediaProcessProcessor,
        { provide: getRepositoryToken(Media), useValue: mediaRepo },
        { provide: STORAGE_PORT, useValue: storageMock },
      ],
    }).compile();
    processor = moduleRef.get(MediaProcessProcessor);
  });

  afterEach(() => vi.restoreAllMocks());

  it('skips when media is already ready (idempotent)', async () => {
    mediaRepo.findOne.mockResolvedValue(makeMedia({ status: 'ready' }));
    await processor.process(makeJob({ mediaId: '1111111111111', ownerId: 'user-uuid-1' }));
    expect(mediaRepo.update).not.toHaveBeenCalled();
  });

  it('skips silently when media does not exist', async () => {
    mediaRepo.findOne.mockResolvedValue(null);
    await expect(
      processor.process(makeJob({ mediaId: 'nope', ownerId: 'user-uuid-1' })),
    ).resolves.toBeUndefined();
    expect(mediaRepo.update).not.toHaveBeenCalled();
  });

  it('marks media failed when storageKey is null', async () => {
    mediaRepo.findOne.mockResolvedValue(makeMedia({ storageKey: null }));
    await processor.process(makeJob({ mediaId: '1111111111111', ownerId: 'user-uuid-1' }));
    expect(mediaRepo.update).toHaveBeenCalledWith('1111111111111', { status: 'failed' });
  });

  it('processes an image via server-side I/O and stores variant KEYS', async () => {
    mediaRepo.findOne.mockResolvedValue(makeMedia({ type: 'image', mime: 'image/jpeg' }));
    await processor.process(makeJob({ mediaId: '1111111111111', ownerId: 'user-uuid-1' }));

    expect(storageMock.getObjectStream).toHaveBeenCalled(); // downloaded via internal client
    expect(storageMock.putObject).toHaveBeenCalled(); // variant uploaded via internal client
    const [, patch] = mediaRepo.update.mock.calls[0];
    expect(patch.status).toBe('ready');
    expect(patch.width).toBe(1920);
    expect(patch.height).toBe(1080);
    // variant is a KEY (no host/expiry), not a presigned URL
    expect(patch.variants.thumb).toBe('processed/user-uuid-1/1111111111111/thumb');
  });

  it('processes a gif: thumb + mp4 variant keys', async () => {
    mediaRepo.findOne.mockResolvedValue(makeMedia({ type: 'gif', mime: 'image/gif' }));
    await processor.process(makeJob({ mediaId: '1111111111111', ownerId: 'user-uuid-1' }));
    const [, patch] = mediaRepo.update.mock.calls[0];
    expect(patch.status).toBe('ready');
    expect(patch.variants.thumb).toBe('processed/user-uuid-1/1111111111111/thumb');
    expect(patch.variants.mp4).toBe('processed/user-uuid-1/1111111111111/mp4');
  });

  it('processes a video: mp4 + poster + thumb keys + durationMs', async () => {
    mediaRepo.findOne.mockResolvedValue(makeMedia({ type: 'video', mime: 'video/mp4' }));
    await processor.process(makeJob({ mediaId: '1111111111111', ownerId: 'user-uuid-1' }));
    const [, patch] = mediaRepo.update.mock.calls[0];
    expect(patch.status).toBe('ready');
    expect(patch.variants.mp4).toBe('processed/user-uuid-1/1111111111111/mp4');
    expect(patch.variants.poster).toBe('processed/user-uuid-1/1111111111111/poster');
    expect(patch.durationMs).toBe(30500);
  });

  it('marks media failed and rethrows when the download fails', async () => {
    mediaRepo.findOne.mockResolvedValue(makeMedia({ type: 'image', mime: 'image/jpeg' }));
    storageMock.getObjectStream.mockRejectedValueOnce(new Error('storage down'));
    await expect(
      processor.process(makeJob({ mediaId: '1111111111111', ownerId: 'user-uuid-1' })),
    ).rejects.toThrow('storage down');
    expect(mediaRepo.update).toHaveBeenCalledWith('1111111111111', { status: 'failed' });
  });
});
