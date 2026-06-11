import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SeoService } from '../../../src/modules/seo/seo.service';
import type { PostsService } from '../../../src/modules/posts/posts.service';
import type { UsersService } from '../../../src/modules/users/users.service';
import type { PostDto } from '../../../src/modules/posts/dto/post.dto';
import type { ProfileDto } from '../../../src/modules/users/dto/profile.dto';

const BASE = 'https://pulse.example';

function makePost(overrides: Partial<PostDto> = {}): PostDto {
  return {
    id: '123',
    author: {
      id: 'u1',
      handle: 'ada',
      displayName: 'Ada Lovelace',
      avatarUrl: '/media/ada.jpg',
      isVerified: true,
      isPrivate: false,
    },
    text: 'Hello world from the analytical engine',
    createdAt: '2026-01-01T00:00:00.000Z',
    entities: { mentions: [], hashtags: [], urls: [] } as unknown as PostDto['entities'],
    media: [],
    counts: { replies: 2, reposts: 3, likes: 10, bookmarks: 1 },
    viewer: { liked: false, reposted: false, bookmarked: false },
    replyToId: null,
    replyPolicy: 'everyone',
    quoteOf: null,
    repostOf: null,
    repostedBy: null,
    deleted: false,
    ...overrides,
  };
}

function makeProfile(overrides: Partial<ProfileDto> = {}): ProfileDto {
  return {
    id: 'u1',
    handle: 'ada',
    displayName: 'Ada Lovelace',
    bio: 'First programmer',
    location: 'London',
    website: null,
    avatarUrl: '/media/ada.jpg',
    bannerUrl: null,
    isVerified: true,
    isPrivate: false,
    counts: { followers: 100, following: 50, posts: 42 },
    viewer: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as ProfileDto;
}

describe('SeoService', () => {
  let postsService: { findOne: ReturnType<typeof vi.fn> };
  let usersService: { getProfile: ReturnType<typeof vi.fn> };
  let postRepo: { createQueryBuilder: ReturnType<typeof vi.fn> };
  let userRepo: { find: ReturnType<typeof vi.fn> };
  let service: SeoService;

  beforeEach(() => {
    postsService = { findOne: vi.fn() };
    usersService = { getProfile: vi.fn() };
    postRepo = { createQueryBuilder: vi.fn() };
    userRepo = { find: vi.fn() };
    service = new SeoService(
      postsService as unknown as PostsService,
      usersService as unknown as UsersService,
      postRepo as never,
      userRepo as never,
    );
  });

  describe('renderPost', () => {
    it('renders OG, Twitter Card, canonical, and JSON-LD for a public post', async () => {
      postsService.findOne.mockResolvedValue(makePost());
      const { html, status } = await service.renderPost('123', BASE);

      expect(status).toBe(200);
      expect(html).toContain('<meta property="og:type" content="article" />');
      expect(html).toContain('og:title');
      expect(html).toContain('Hello world from the analytical engine');
      expect(html).toContain(`<link rel="canonical" href="${BASE}/@ada/status/123" />`);
      expect(html).toContain('"@type":"SocialMediaPosting"');
      expect(html).toContain('"interactionType":"https://schema.org/LikeAction"');
      expect(html).toContain('content="index, follow"');
    });

    it('uses summary_large_image and media URL when the post has ready media', async () => {
      postsService.findOne.mockResolvedValue(
        makePost({
          media: [
            {
              id: 'm1',
              type: 'image',
              status: 'ready',
              variants: { large: '/media/large.jpg' },
              altText: null,
              width: 1200,
              height: 630,
            },
          ],
        }),
      );
      const { html } = await service.renderPost('123', BASE);
      expect(html).toContain('content="summary_large_image"');
      expect(html).toContain(`${BASE}/media/large.jpg`);
    });

    it('returns 404 + noindex for a deleted post', async () => {
      postsService.findOne.mockResolvedValue(makePost({ deleted: true }));
      const { html, status } = await service.renderPost('123', BASE);
      expect(status).toBe(404);
      expect(html).toContain('noindex');
    });

    it('returns 404 when the post is not found', async () => {
      postsService.findOne.mockRejectedValue(new Error('not found'));
      const { status } = await service.renderPost('999', BASE);
      expect(status).toBe(404);
    });

    it('escapes HTML in post text to prevent injection', async () => {
      postsService.findOne.mockResolvedValue(makePost({ text: '<script>alert(1)</script>' }));
      const { html } = await service.renderPost('123', BASE);
      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });

  describe('renderProfile', () => {
    it('renders profile meta + ProfilePage JSON-LD', async () => {
      usersService.getProfile.mockResolvedValue({ user: makeProfile() });
      const { html, status } = await service.renderProfile('@ada', BASE);
      expect(status).toBe(200);
      expect(html).toContain('Ada Lovelace (@ada)');
      expect(html).toContain('First programmer');
      expect(html).toContain('"@type":"ProfilePage"');
      expect(html).toContain(`<link rel="canonical" href="${BASE}/@ada" />`);
    });

    it('sets noindex for a private profile', async () => {
      usersService.getProfile.mockResolvedValue({ user: makeProfile({ isPrivate: true }) });
      const { html } = await service.renderProfile('ada', BASE);
      expect(html).toContain('noindex');
    });

    it('returns 404 when the profile does not exist', async () => {
      usersService.getProfile.mockRejectedValue(new Error('not found'));
      const { status } = await service.renderProfile('ghost', BASE);
      expect(status).toBe(404);
    });
  });

  describe('renderPath', () => {
    it('dispatches /@handle/status/:id to the post renderer', async () => {
      postsService.findOne.mockResolvedValue(makePost());
      await service.renderPath('/@ada/status/123', BASE);
      expect(postsService.findOne).toHaveBeenCalledWith('123', null);
    });

    it('dispatches /@handle to the profile renderer', async () => {
      usersService.getProfile.mockResolvedValue({ user: makeProfile() });
      await service.renderPath('/@ada', BASE);
      expect(usersService.getProfile).toHaveBeenCalledWith('ada', null);
    });

    it('dispatches a profile tab (/@handle/replies) to the profile renderer', async () => {
      usersService.getProfile.mockResolvedValue({ user: makeProfile() });
      await service.renderPath('/@ada/replies', BASE);
      expect(usersService.getProfile).toHaveBeenCalledWith('ada', null);
    });

    it('falls back to a generic site document for the root path', async () => {
      const { html, status } = await service.renderPath('/', BASE);
      expect(status).toBe(200);
      expect(html).toContain('PULSE — Microblogging');
      expect(postsService.findOne).not.toHaveBeenCalled();
      expect(usersService.getProfile).not.toHaveBeenCalled();
    });
  });

  describe('buildSitemap', () => {
    it('emits a valid urlset with profile and post URLs', async () => {
      userRepo.find.mockResolvedValue([
        { handle: 'ada', updatedAt: new Date('2026-01-02T00:00:00Z') },
      ]);
      const qb = {
        innerJoin: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        addSelect: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        getRawMany: vi
          .fn()
          .mockResolvedValue([
            { id: '123', createdAt: new Date('2026-01-01T00:00:00Z'), handle: 'ada' },
          ]),
      };
      postRepo.createQueryBuilder.mockReturnValue(qb);

      const xml = await service.buildSitemap(BASE);
      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<urlset');
      expect(xml).toContain(`<loc>${BASE}/@ada</loc>`);
      expect(xml).toContain(`<loc>${BASE}/@ada/status/123</loc>`);
      expect(xml).toContain('<lastmod>');
    });
  });

  describe('buildRobots', () => {
    it('allows crawling, disallows private routes, and points to the sitemap', () => {
      const robots = service.buildRobots(BASE);
      expect(robots).toContain('User-agent: *');
      expect(robots).toContain('Allow: /');
      expect(robots).toContain('Disallow: /messages');
      expect(robots).toContain('Disallow: /settings');
      expect(robots).toContain(`Sitemap: ${BASE}/sitemap.xml`);
    });
  });
});
