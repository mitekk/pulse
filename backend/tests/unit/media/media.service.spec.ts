import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { MediaService } from '../../../src/modules/media/media.service';
import { Media } from '../../../src/modules/media/media.entity';
import { MediaLimits } from '../../../src/modules/media/media-limits';
import { QuotaService } from '../../../src/modules/media/quota.service';
import { STORAGE_PORT } from '../../../src/infra/storage/storage.port';

const ONE_MB = 1024 * 1024;

function makeMedia(overrides: Partial<Media> = {}): Media {
  return {
    id: '1111111111111',
    ownerId: 'user-uuid-1',
    type: 'image',
    status: 'pending',
    storageKey: 'media/user-uuid-1/uuid/original.jpeg',
    mime: 'image/jpeg',
    width: null,
    height: null,
    durationMs: null,
    altText: null,
    variants: {},
    byteSize: 1000,
    committedAt: null,
    createdAt: new Date('2026-06-07T00:00:00Z'),
    updatedAt: new Date('2026-06-07T00:00:00Z'),
    owner: {} as never,
    ...overrides,
  } as Media;
}

describe('MediaService', () => {
  let service: MediaService;

  const mediaRepo = {
    create: vi.fn((v: Partial<Media>) => makeMedia(v)),
    save: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    findBy: vi.fn(),
  };

  const storageMock = {
    createPresignedPost: vi
      .fn()
      .mockResolvedValue({ url: 'http://minio:9000/tweeter-media', fields: { key: 'k' } }),
    headObject: vi.fn(),
    getObjectStream: vi.fn(),
    putObject: vi.fn(),
    deleteObject: vi.fn(),
    getPublicUrl: vi.fn((key: string) => `http://localhost:9000/tweeter-media/${key}`),
    listBucketBytes: vi.fn().mockResolvedValue(0),
  };

  const quota = {
    reserve: vi.fn().mockResolvedValue(undefined),
    adjust: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
  };

  const mediaQueue = { add: vi.fn().mockResolvedValue({}) };

  // Real limits with defaults (2 files · 1 MB · 2 MB · 500 MB · 80%).
  const limits = new MediaLimits({ get: () => undefined } as unknown as ConfigService);

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: getRepositoryToken(Media), useValue: mediaRepo },
        { provide: STORAGE_PORT, useValue: storageMock },
        { provide: getQueueToken('media'), useValue: mediaQueue },
        { provide: MediaLimits, useValue: limits },
        { provide: QuotaService, useValue: quota },
      ],
    }).compile();
    service = moduleRef.get(MediaService);
  });

  describe('createUploadUrl', () => {
    it('reserves quota and returns a presigned POST for a valid image', async () => {
      const result = await service.createUploadUrl('user-uuid-1', {
        type: 'image',
        mime: 'image/jpeg',
        size: 100 * 1024,
      });

      expect(result.mediaId).toBeTruthy();
      expect(result.upload.url).toContain('tweeter-media');
      expect(quota.reserve).toHaveBeenCalledWith(100 * 1024);
      expect(mediaRepo.save).toHaveBeenCalledOnce();
      expect(storageMock.createPresignedPost).toHaveBeenCalledOnce();
    });

    it('rejects a disallowed MIME type', async () => {
      await expect(
        service.createUploadUrl('user-uuid-1', {
          type: 'image',
          mime: 'application/pdf',
          size: 1000,
        }),
      ).rejects.toThrow();
      expect(quota.reserve).not.toHaveBeenCalled();
    });

    it('rejects video uploads (deferred)', async () => {
      await expect(
        service.createUploadUrl('user-uuid-1', { type: 'video', mime: 'video/mp4', size: 1000 }),
      ).rejects.toThrow();
    });

    it('rejects a file over the 1 MB per-file limit', async () => {
      await expect(
        service.createUploadUrl('user-uuid-1', {
          type: 'image',
          mime: 'image/jpeg',
          size: ONE_MB + 1,
        }),
      ).rejects.toThrow();
      expect(quota.reserve).not.toHaveBeenCalled();
    });

    it('accepts a file exactly at the per-file limit', async () => {
      await expect(
        service.createUploadUrl('user-uuid-1', { type: 'image', mime: 'image/jpeg', size: ONE_MB }),
      ).resolves.toBeDefined();
    });

    it('releases the reservation if presigning fails', async () => {
      storageMock.createPresignedPost.mockRejectedValueOnce(new Error('s3 down'));
      await expect(
        service.createUploadUrl('user-uuid-1', { type: 'image', mime: 'image/jpeg', size: 5000 }),
      ).rejects.toThrow();
      expect(quota.release).toHaveBeenCalledWith(5000);
    });

    it('propagates a cap rejection from quota.reserve', async () => {
      quota.reserve.mockRejectedValueOnce(new Error('STORAGE_CAP_EXCEEDED'));
      await expect(
        service.createUploadUrl('user-uuid-1', { type: 'image', mime: 'image/jpeg', size: 5000 }),
      ).rejects.toThrow();
      expect(mediaRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('finalize', () => {
    it('verifies the object, commits to actual size, and enqueues processing', async () => {
      mediaRepo.findOne.mockResolvedValue(makeMedia({ status: 'pending', byteSize: 1000 }));
      storageMock.headObject.mockResolvedValue({ size: 1234, contentType: 'image/jpeg' });

      const result = await service.finalize('1111111111111', 'user-uuid-1');

      expect(result.status).toBe('processing');
      expect(quota.adjust).toHaveBeenCalledWith(234); // 1234 actual − 1000 reserved
      expect(mediaRepo.update).toHaveBeenCalledWith(
        '1111111111111',
        expect.objectContaining({ status: 'processing', byteSize: 1234 }),
      );
      expect(mediaQueue.add).toHaveBeenCalledOnce();
    });

    it('rejects when no object was uploaded', async () => {
      mediaRepo.findOne.mockResolvedValue(makeMedia({ status: 'pending' }));
      storageMock.headObject.mockResolvedValue(null);
      await expect(service.finalize('1111111111111', 'user-uuid-1')).rejects.toThrow();
      expect(mediaQueue.add).not.toHaveBeenCalled();
    });

    it('is idempotent when already processing', async () => {
      mediaRepo.findOne.mockResolvedValue(makeMedia({ status: 'processing' }));
      const result = await service.finalize('1111111111111', 'user-uuid-1');
      expect(result.status).toBe('processing');
      expect(storageMock.headObject).not.toHaveBeenCalled();
      expect(mediaQueue.add).not.toHaveBeenCalled();
    });

    it('throws NotFound when media is absent', async () => {
      mediaRepo.findOne.mockResolvedValue(null);
      await expect(service.finalize('nope', 'user-uuid-1')).rejects.toThrow(NotFoundException);
    });

    it('throws Forbidden for a non-owner', async () => {
      mediaRepo.findOne.mockResolvedValue(makeMedia({ ownerId: 'someone-else' }));
      await expect(service.finalize('1111111111111', 'user-uuid-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('validateAndLoadForPost', () => {
    it('returns [] for empty input', async () => {
      expect(await service.validateAndLoadForPost([], 'user-uuid-1')).toEqual([]);
      expect(mediaRepo.findBy).not.toHaveBeenCalled();
    });

    it('returns ordered media for valid ready+owned input', async () => {
      const m1 = makeMedia({ id: '111', status: 'ready', byteSize: 500 });
      const m2 = makeMedia({ id: '222', status: 'ready', byteSize: 500 });
      mediaRepo.findBy.mockResolvedValue([m2, m1]); // out of order
      const result = await service.validateAndLoadForPost(['111', '222'], 'user-uuid-1');
      expect(result.map((m) => m.id)).toEqual(['111', '222']);
    });

    it('rejects more than the per-post file count (2)', async () => {
      await expect(
        service.validateAndLoadForPost(['1', '2', '3'], 'user-uuid-1'),
      ).rejects.toThrow();
    });

    it('rejects when total bytes exceed the per-post limit (2 MB)', async () => {
      const m1 = makeMedia({ id: '111', status: 'ready', byteSize: ONE_MB + 1 });
      const m2 = makeMedia({ id: '222', status: 'ready', byteSize: ONE_MB });
      mediaRepo.findBy.mockResolvedValue([m1, m2]);
      await expect(service.validateAndLoadForPost(['111', '222'], 'user-uuid-1')).rejects.toThrow();
    });

    it('throws when a media id is missing', async () => {
      mediaRepo.findBy.mockResolvedValue([]);
      await expect(service.validateAndLoadForPost(['x'], 'user-uuid-1')).rejects.toThrow();
    });

    it('throws for non-owned media', async () => {
      mediaRepo.findBy.mockResolvedValue([
        makeMedia({ id: '111', status: 'ready', ownerId: 'other' }),
      ]);
      await expect(service.validateAndLoadForPost(['111'], 'user-uuid-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws for not-ready media', async () => {
      mediaRepo.findBy.mockResolvedValue([makeMedia({ id: '111', status: 'processing' })]);
      await expect(service.validateAndLoadForPost(['111'], 'user-uuid-1')).rejects.toThrow();
    });

    it('rejects mixing a GIF with an image', async () => {
      const image = makeMedia({ id: '111', status: 'ready', type: 'image', byteSize: 100 });
      const gif = makeMedia({
        id: '222',
        status: 'ready',
        type: 'gif',
        mime: 'image/gif',
        byteSize: 100,
      });
      mediaRepo.findBy.mockResolvedValue([image, gif]);
      await expect(service.validateAndLoadForPost(['111', '222'], 'user-uuid-1')).rejects.toThrow();
    });

    it('accepts 2 small ready images', async () => {
      const m1 = makeMedia({ id: '111', status: 'ready', byteSize: 100 });
      const m2 = makeMedia({ id: '222', status: 'ready', byteSize: 100 });
      mediaRepo.findBy.mockResolvedValue([m1, m2]);
      await expect(
        service.validateAndLoadForPost(['111', '222'], 'user-uuid-1'),
      ).resolves.toHaveLength(2);
    });
  });

  describe('updateAltText', () => {
    it('updates alt text for the owner', async () => {
      mediaRepo.findOne.mockResolvedValue(makeMedia({ status: 'ready' }));
      const result = await service.updateAltText('1111111111111', 'user-uuid-1', {
        altText: 'A cat',
      });
      expect(result.altText).toBe('A cat');
      expect(mediaRepo.update).toHaveBeenCalledWith('1111111111111', { altText: 'A cat' });
    });

    it('throws Forbidden for a non-owner', async () => {
      mediaRepo.findOne.mockResolvedValue(makeMedia({ ownerId: 'other' }));
      await expect(
        service.updateAltText('1111111111111', 'user-uuid-1', { altText: 'x' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
