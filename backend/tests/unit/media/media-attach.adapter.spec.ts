/**
 * MediaAttachAdapter unit tests.
 *
 * Verifies that the adapter:
 *   - delegates to MediaService.validateAndLoadForPost with the same arguments
 *   - maps each Media field to the expected AttachedMediaItem shape in order
 *
 * No DB, no NestJS bootstrap — plain constructor instantiation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MediaAttachAdapter } from '../../../src/modules/media/media-attach.adapter';
import type { Media } from '../../../src/modules/media/media.entity';
import type { AttachedMediaItem } from '../../../src/modules/posts/media-attach.port';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeMedia(overrides: Partial<Media> = {}): Media {
  return {
    id: '111111111111001',
    ownerId: 'owner-uuid-1',
    type: 'image',
    status: 'ready',
    storageKey: 'uploads/owner-uuid-1/111111111111001.jpeg',
    mime: 'image/jpeg',
    width: 1920,
    height: 1080,
    durationMs: null,
    altText: 'A test image',
    variants: {
      thumb: 'https://cdn.example.com/thumb.jpg',
      small: 'https://cdn.example.com/small.jpg',
    },
    createdAt: new Date('2026-06-07T00:00:00Z'),
    owner: {} as never,
    ...overrides,
  } as Media;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MediaAttachAdapter', () => {
  let mockMediaService: { validateAndLoadForPost: ReturnType<typeof vi.fn> };
  let adapter: MediaAttachAdapter;

  beforeEach(() => {
    mockMediaService = { validateAndLoadForPost: vi.fn() };
    // MediaAttachAdapter only depends on MediaService — construct directly
    adapter = new MediaAttachAdapter(mockMediaService as never);
  });

  describe('validateAndLoad', () => {
    it('delegates to validateAndLoadForPost with the same mediaIds and authorId', async () => {
      mockMediaService.validateAndLoadForPost.mockResolvedValue([]);

      await adapter.validateAndLoad(['id-1', 'id-2'], 'author-uuid');

      expect(mockMediaService.validateAndLoadForPost).toHaveBeenCalledOnce();
      expect(mockMediaService.validateAndLoadForPost).toHaveBeenCalledWith(
        ['id-1', 'id-2'],
        'author-uuid',
      );
    });

    it('maps each Media field to AttachedMediaItem correctly', async () => {
      const media = makeMedia();
      mockMediaService.validateAndLoadForPost.mockResolvedValue([media]);

      const result: AttachedMediaItem[] = await adapter.validateAndLoad([media.id], media.ownerId);

      expect(result).toHaveLength(1);
      const item = result[0];
      expect(item.id).toBe(media.id);
      expect(item.type).toBe(media.type);
      expect(item.mime).toBe(media.mime);
      expect(item.width).toBe(media.width);
      expect(item.height).toBe(media.height);
      expect(item.durationMs).toBe(media.durationMs);
      expect(item.altText).toBe(media.altText);
      expect(item.variants).toEqual(media.variants);
    });

    it('preserves the order of mediaIds in the returned array', async () => {
      const first = makeMedia({ id: '111111111111001', mime: 'image/jpeg' });
      const second = makeMedia({
        id: '111111111111002',
        type: 'image',
        mime: 'image/png',
        width: 640,
        height: 480,
      });
      const third = makeMedia({
        id: '111111111111003',
        type: 'image',
        mime: 'image/webp',
        width: 320,
        height: 240,
        altText: null,
      });

      mockMediaService.validateAndLoadForPost.mockResolvedValue([first, second, third]);

      const result = await adapter.validateAndLoad([first.id, second.id, third.id], 'owner-uuid-1');

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe(first.id);
      expect(result[1].id).toBe(second.id);
      expect(result[2].id).toBe(third.id);

      // Verify the third item's fields map cleanly
      expect(result[2].mime).toBe('image/webp');
      expect(result[2].altText).toBeNull();
    });

    it('returns an empty array when the service returns no media', async () => {
      mockMediaService.validateAndLoadForPost.mockResolvedValue([]);

      const result = await adapter.validateAndLoad([], 'owner-uuid-1');

      expect(result).toEqual([]);
    });

    it('maps video media with durationMs populated', async () => {
      const videoMedia = makeMedia({
        id: '222222222222001',
        type: 'video',
        mime: 'video/mp4',
        width: 1280,
        height: 720,
        durationMs: 30000,
        variants: {
          mp4: 'https://cdn.example.com/video.mp4',
          poster: 'https://cdn.example.com/poster.jpg',
        },
      });

      mockMediaService.validateAndLoadForPost.mockResolvedValue([videoMedia]);

      const result = await adapter.validateAndLoad([videoMedia.id], videoMedia.ownerId);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('video');
      expect(result[0].durationMs).toBe(30000);
      expect(result[0].variants).toEqual(videoMedia.variants);
    });

    it('propagates errors thrown by validateAndLoadForPost', async () => {
      const { ForbiddenException } = await import('@nestjs/common');
      mockMediaService.validateAndLoadForPost.mockRejectedValue(
        new ForbiddenException({ error: { code: 'MEDIA_NOT_OWNED', message: 'Not yours' } }),
      );

      await expect(adapter.validateAndLoad(['stolen-id'], 'other-owner')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
