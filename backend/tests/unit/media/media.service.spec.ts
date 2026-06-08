import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  MediaService,
  MAX_IMAGE_SIZE,
  MAX_VIDEO_SIZE,
  MAX_GIF_SIZE,
} from '../../../src/modules/media/media.service';
import { Media } from '../../../src/modules/media/media.entity';
import { STORAGE_PORT } from '../../../src/infra/storage/storage.port';

// ── Factories ─────────────────────────────────────────────────────────────────

function makeMedia(overrides: Partial<Media> = {}): Media {
  return {
    id: '1111111111111',
    ownerId: 'user-uuid-1',
    type: 'image',
    status: 'pending',
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

// ── Test suite ────────────────────────────────────────────────────────────────

describe('MediaService', () => {
  let service: MediaService;

  const mediaRepo = {
    create: vi.fn(),
    save: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    findByIds: vi.fn(),
  };

  const storageMock = {
    getPresignedUploadUrl: vi
      .fn()
      .mockResolvedValue({ uploadUrl: 'https://minio/presigned', key: 'k', expiresIn: 900 }),
    getPresignedDownloadUrl: vi.fn(),
    delete: vi.fn(),
    exists: vi.fn(),
  };

  const mediaQueue = {
    add: vi.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: getRepositoryToken(Media), useValue: mediaRepo },
        { provide: STORAGE_PORT, useValue: storageMock },
        { provide: getQueueToken('media'), useValue: mediaQueue },
      ],
    }).compile();

    service = moduleRef.get(MediaService);
  });

  // ── createUploadUrl ────────────────────────────────────────────────────────

  describe('createUploadUrl', () => {
    it('creates pending media row and returns presigned URL for valid image', async () => {
      mediaRepo.create.mockReturnValue(makeMedia());
      mediaRepo.save.mockResolvedValue(makeMedia());

      const result = await service.createUploadUrl('user-uuid-1', {
        type: 'image',
        mime: 'image/jpeg',
        size: 1024 * 100,
      });

      expect(result.mediaId).toBeTruthy();
      expect(result.uploadUrl).toBe('https://minio/presigned');
      expect(mediaRepo.save).toHaveBeenCalledOnce();
      expect(storageMock.getPresignedUploadUrl).toHaveBeenCalledOnce();
    });

    it('rejects invalid MIME type for image', async () => {
      await expect(
        service.createUploadUrl('user-uuid-1', {
          type: 'image',
          mime: 'video/mp4',
          size: 1000,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects invalid MIME type for gif', async () => {
      await expect(
        service.createUploadUrl('user-uuid-1', {
          type: 'gif',
          mime: 'image/jpeg',
          size: 1000,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects image exceeding 5MB limit', async () => {
      await expect(
        service.createUploadUrl('user-uuid-1', {
          type: 'image',
          mime: 'image/jpeg',
          size: MAX_IMAGE_SIZE + 1,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts image exactly at 5MB limit', async () => {
      mediaRepo.create.mockReturnValue(makeMedia());
      mediaRepo.save.mockResolvedValue(makeMedia());

      await expect(
        service.createUploadUrl('user-uuid-1', {
          type: 'image',
          mime: 'image/jpeg',
          size: MAX_IMAGE_SIZE,
        }),
      ).resolves.toBeDefined();
    });

    it('rejects video exceeding 100MB limit', async () => {
      await expect(
        service.createUploadUrl('user-uuid-1', {
          type: 'video',
          mime: 'video/mp4',
          size: MAX_VIDEO_SIZE + 1,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects gif exceeding 15MB limit', async () => {
      await expect(
        service.createUploadUrl('user-uuid-1', {
          type: 'gif',
          mime: 'image/gif',
          size: MAX_GIF_SIZE + 1,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts gif within 15MB limit', async () => {
      mediaRepo.create.mockReturnValue(makeMedia({ type: 'gif', mime: 'image/gif' }));
      mediaRepo.save.mockResolvedValue(makeMedia({ type: 'gif', mime: 'image/gif' }));

      await expect(
        service.createUploadUrl('user-uuid-1', {
          type: 'gif',
          mime: 'image/gif',
          size: 1024 * 1024,
        }),
      ).resolves.toBeDefined();
    });
  });

  // ── finalize ───────────────────────────────────────────────────────────────

  describe('finalize', () => {
    it('transitions pending media to processing and enqueues job', async () => {
      const media = makeMedia({ status: 'pending' });
      mediaRepo.findOne.mockResolvedValue(media);
      mediaRepo.update.mockResolvedValue({});

      const result = await service.finalize('1111111111111', 'user-uuid-1');

      expect(result.status).toBe('processing');
      expect(mediaRepo.update).toHaveBeenCalledWith('1111111111111', { status: 'processing' });
      expect(mediaQueue.add).toHaveBeenCalledWith(
        'media.process',
        expect.objectContaining({ mediaId: '1111111111111' }),
        expect.objectContaining({ jobId: 'media-process-1111111111111' }),
      );
    });

    it('returns current dto idempotently when already processing', async () => {
      const media = makeMedia({ status: 'processing' });
      mediaRepo.findOne.mockResolvedValue(media);

      const result = await service.finalize('1111111111111', 'user-uuid-1');

      expect(result.status).toBe('processing');
      expect(mediaRepo.update).not.toHaveBeenCalled();
      expect(mediaQueue.add).not.toHaveBeenCalled();
    });

    it('returns current dto idempotently when already ready', async () => {
      const media = makeMedia({
        status: 'ready',
        variants: { thumb: 'http://t', small: 'http://s' },
      });
      mediaRepo.findOne.mockResolvedValue(media);

      const result = await service.finalize('1111111111111', 'user-uuid-1');

      expect(result.status).toBe('ready');
      expect(mediaQueue.add).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when media does not exist', async () => {
      mediaRepo.findOne.mockResolvedValue(null);

      await expect(service.finalize('nonexistent', 'user-uuid-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when requester does not own media', async () => {
      const media = makeMedia({ ownerId: 'other-user' });
      mediaRepo.findOne.mockResolvedValue(media);

      await expect(service.finalize('1111111111111', 'user-uuid-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('re-enqueues job for failed media (retry path)', async () => {
      const media = makeMedia({ status: 'failed' });
      mediaRepo.findOne.mockResolvedValue(media);
      mediaRepo.update.mockResolvedValue({});

      const result = await service.finalize('1111111111111', 'user-uuid-1');

      expect(result.status).toBe('processing');
      expect(mediaQueue.add).toHaveBeenCalledOnce();
    });
  });

  // ── validateAndLoadForPost ────────────────────────────────────────────────

  describe('validateAndLoadForPost', () => {
    it('returns empty array for empty mediaIds', async () => {
      const result = await service.validateAndLoadForPost([], 'user-uuid-1');
      expect(result).toEqual([]);
      expect(mediaRepo.findByIds).not.toHaveBeenCalled();
    });

    it('returns ordered medias for valid ready owned media', async () => {
      const m1 = makeMedia({ id: '111', status: 'ready', ownerId: 'user-uuid-1' });
      const m2 = makeMedia({ id: '222', status: 'ready', ownerId: 'user-uuid-1' });
      mediaRepo.findByIds.mockResolvedValue([m1, m2]);

      const result = await service.validateAndLoadForPost(['111', '222'], 'user-uuid-1');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('111');
      expect(result[1].id).toBe('222');
    });

    it('throws NotFoundException when a media id does not exist', async () => {
      mediaRepo.findByIds.mockResolvedValue([]); // no records found

      await expect(service.validateAndLoadForPost(['nonexistent'], 'user-uuid-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws ForbiddenException when media is owned by someone else', async () => {
      const m = makeMedia({ id: '111', status: 'ready', ownerId: 'other-user' });
      mediaRepo.findByIds.mockResolvedValue([m]);

      await expect(service.validateAndLoadForPost(['111'], 'user-uuid-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws BadRequestException when media is not ready', async () => {
      const m = makeMedia({ id: '111', status: 'pending', ownerId: 'user-uuid-1' });
      mediaRepo.findByIds.mockResolvedValue([m]);

      await expect(service.validateAndLoadForPost(['111'], 'user-uuid-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects more than 4 images', async () => {
      const medias = Array.from({ length: 5 }, (_, i) =>
        makeMedia({ id: String(100 + i), status: 'ready', ownerId: 'user-uuid-1', type: 'image' }),
      );
      mediaRepo.findByIds.mockResolvedValue(medias);

      await expect(
        service.validateAndLoadForPost(
          medias.map((m) => m.id),
          'user-uuid-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects mixing image with video', async () => {
      const image = makeMedia({
        id: '111',
        status: 'ready',
        ownerId: 'user-uuid-1',
        type: 'image',
      });
      const video = makeMedia({
        id: '222',
        status: 'ready',
        ownerId: 'user-uuid-1',
        type: 'video',
      });
      mediaRepo.findByIds.mockResolvedValue([image, video]);

      await expect(service.validateAndLoadForPost(['111', '222'], 'user-uuid-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects mixing image with gif', async () => {
      const image = makeMedia({
        id: '111',
        status: 'ready',
        ownerId: 'user-uuid-1',
        type: 'image',
      });
      const gif = makeMedia({
        id: '222',
        status: 'ready',
        ownerId: 'user-uuid-1',
        type: 'gif',
        mime: 'image/gif',
      });
      mediaRepo.findByIds.mockResolvedValue([image, gif]);

      await expect(service.validateAndLoadForPost(['111', '222'], 'user-uuid-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects more than 1 video', async () => {
      const v1 = makeMedia({
        id: '111',
        status: 'ready',
        ownerId: 'user-uuid-1',
        type: 'video',
        mime: 'video/mp4',
      });
      const v2 = makeMedia({
        id: '222',
        status: 'ready',
        ownerId: 'user-uuid-1',
        type: 'video',
        mime: 'video/mp4',
      });
      mediaRepo.findByIds.mockResolvedValue([v1, v2]);

      await expect(service.validateAndLoadForPost(['111', '222'], 'user-uuid-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('accepts up to 4 images', async () => {
      const medias = Array.from({ length: 4 }, (_, i) =>
        makeMedia({ id: String(100 + i), status: 'ready', ownerId: 'user-uuid-1', type: 'image' }),
      );
      mediaRepo.findByIds.mockResolvedValue(medias);

      await expect(
        service.validateAndLoadForPost(
          medias.map((m) => m.id),
          'user-uuid-1',
        ),
      ).resolves.toHaveLength(4);
    });

    it('accepts exactly 1 video', async () => {
      const video = makeMedia({
        id: '111',
        status: 'ready',
        ownerId: 'user-uuid-1',
        type: 'video',
        mime: 'video/mp4',
      });
      mediaRepo.findByIds.mockResolvedValue([video]);

      await expect(service.validateAndLoadForPost(['111'], 'user-uuid-1')).resolves.toHaveLength(1);
    });
  });

  // ── updateAltText ─────────────────────────────────────────────────────────

  describe('updateAltText', () => {
    it('updates alt text when owner makes request', async () => {
      const media = makeMedia({ status: 'ready' });
      mediaRepo.findOne.mockResolvedValue(media);
      mediaRepo.update.mockResolvedValue({});

      const result = await service.updateAltText('1111111111111', 'user-uuid-1', {
        altText: 'A cute cat photo',
      });

      expect(result.altText).toBe('A cute cat photo');
      expect(mediaRepo.update).toHaveBeenCalledWith('1111111111111', {
        altText: 'A cute cat photo',
      });
    });

    it('throws ForbiddenException when non-owner tries to update alt text', async () => {
      const media = makeMedia({ ownerId: 'other-user' });
      mediaRepo.findOne.mockResolvedValue(media);

      await expect(
        service.updateAltText('1111111111111', 'user-uuid-1', { altText: 'hacked' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when media does not exist', async () => {
      mediaRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateAltText('nonexistent', 'user-uuid-1', { altText: 'test' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('no-ops when altText is undefined in DTO', async () => {
      const media = makeMedia({ altText: 'existing', status: 'ready' });
      mediaRepo.findOne.mockResolvedValue(media);

      const result = await service.updateAltText('1111111111111', 'user-uuid-1', {});

      expect(result.altText).toBe('existing');
      expect(mediaRepo.update).not.toHaveBeenCalled();
    });
  });
});
