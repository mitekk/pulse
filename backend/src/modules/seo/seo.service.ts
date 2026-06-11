import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PostsService } from '../posts/posts.service';
import { UsersService } from '../users/users.service';
import { Post } from '../posts/post.entity';
import { User } from '../users/user.entity';
import type { PostDto } from '../posts/dto/post.dto';
import type { ProfileDto } from '../users/dto/profile.dto';

const SITE_NAME = 'PULSE';
const DEFAULT_OG_IMAGE = '/og-default.png';
const SITEMAP_MAX_URLS = 2000;

interface MetaDocument {
  title: string;
  description: string;
  canonical: string;
  image: string;
  type: 'website' | 'article' | 'profile';
  card: 'summary' | 'summary_large_image';
  jsonLd?: Record<string, unknown>;
  bodyHtml: string;
  noindex?: boolean;
}

/**
 * SeoService — renders crawler-facing artifacts that the SPA cannot
 * provide to non-JS clients: server-rendered Open Graph / Twitter Card /
 * JSON-LD documents for public posts & profiles (dynamic rendering), plus
 * a DB-backed sitemap.xml and a host-aware robots.txt.
 */
@Injectable()
export class SeoService {
  private readonly logger = new Logger(SeoService.name);

  constructor(
    private readonly postsService: PostsService,
    private readonly usersService: UsersService,
    @InjectRepository(Post) private readonly postRepo: Repository<Post>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  // ── HTML escaping ──────────────────────────────────────────────────────────

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private truncate(text: string, max = 160): string {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean.length <= max) return clean;
    return clean.slice(0, max - 1).trimEnd() + '…';
  }

  /** Make a possibly-relative asset URL absolute against the request origin. */
  private absoluteUrl(baseUrl: string, maybeUrl: string | null | undefined): string {
    if (!maybeUrl) return `${baseUrl}${DEFAULT_OG_IMAGE}`;
    if (maybeUrl.startsWith('http://') || maybeUrl.startsWith('https://')) return maybeUrl;
    return `${baseUrl}${maybeUrl.startsWith('/') ? '' : '/'}${maybeUrl}`;
  }

  // ── Document renderer ───────────────────────────────────────────────────────

  private renderDocument(doc: MetaDocument): string {
    const t = this.escapeHtml(doc.title);
    const d = this.escapeHtml(doc.description);
    const robots = doc.noindex ? 'noindex, nofollow' : 'index, follow';
    const jsonLdScript = doc.jsonLd
      ? `<script type="application/ld+json">${JSON.stringify(doc.jsonLd).replace(/</g, '\\u003c')}</script>`
      : '';

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${t}</title>
<meta name="description" content="${d}" />
<meta name="robots" content="${robots}" />
<link rel="canonical" href="${this.escapeHtml(doc.canonical)}" />
<meta property="og:site_name" content="${SITE_NAME}" />
<meta property="og:type" content="${doc.type}" />
<meta property="og:title" content="${t}" />
<meta property="og:description" content="${d}" />
<meta property="og:url" content="${this.escapeHtml(doc.canonical)}" />
<meta property="og:image" content="${this.escapeHtml(doc.image)}" />
<meta name="twitter:card" content="${doc.card}" />
<meta name="twitter:title" content="${t}" />
<meta name="twitter:description" content="${d}" />
<meta name="twitter:image" content="${this.escapeHtml(doc.image)}" />
${jsonLdScript}
</head>
<body>
${doc.bodyHtml}
<p><a href="${this.escapeHtml(doc.canonical)}">View on ${SITE_NAME}</a></p>
</body>
</html>
`;
  }

  // ── Profile rendering ────────────────────────────────────────────────────────

  async renderProfile(handle: string, baseUrl: string): Promise<{ html: string; status: number }> {
    const clean = handle.startsWith('@') ? handle.slice(1) : handle;
    let profile: ProfileDto;
    try {
      const result = await this.usersService.getProfile(clean, null);
      profile = result.user;
    } catch {
      return { html: this.renderNotFound(baseUrl, `@${clean}`), status: 404 };
    }

    const canonical = `${baseUrl}/@${profile.handle}`;
    const title = `${profile.displayName} (@${profile.handle})`;
    const description = profile.bio
      ? this.truncate(profile.bio)
      : `The latest posts from ${profile.displayName} (@${profile.handle}) on ${SITE_NAME}.`;
    const image = this.absoluteUrl(baseUrl, profile.avatarUrl);

    const jsonLd: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'ProfilePage',
      dateCreated: profile.createdAt,
      mainEntity: {
        '@type': 'Person',
        name: profile.displayName,
        alternateName: `@${profile.handle}`,
        ...(profile.bio ? { description: profile.bio } : {}),
        image,
        url: canonical,
        interactionStatistic: [
          {
            '@type': 'InteractionCounter',
            interactionType: 'https://schema.org/FollowAction',
            userInteractionCount: profile.counts.followers,
          },
        ],
      },
    };

    const bodyHtml = `<main>
<h1>${this.escapeHtml(profile.displayName)} <span>@${this.escapeHtml(profile.handle)}</span></h1>
${profile.bio ? `<p>${this.escapeHtml(profile.bio)}</p>` : ''}
<p>${profile.counts.followers} Followers · ${profile.counts.following} Following · ${profile.counts.posts} Posts</p>
</main>`;

    return {
      html: this.renderDocument({
        title,
        description,
        canonical,
        image,
        type: 'profile',
        card: 'summary',
        jsonLd,
        bodyHtml,
        noindex: profile.isPrivate,
      }),
      status: 200,
    };
  }

  // ── Post rendering ────────────────────────────────────────────────────────────

  async renderPost(postId: string, baseUrl: string): Promise<{ html: string; status: number }> {
    let post: PostDto;
    try {
      post = await this.postsService.findOne(postId, null);
    } catch {
      return { html: this.renderNotFound(baseUrl, 'this post'), status: 404 };
    }
    if (post.deleted) {
      return { html: this.renderNotFound(baseUrl, 'this post'), status: 404 };
    }

    const canonical = `${baseUrl}/@${post.author.handle}/status/${post.id}`;
    const title = `${post.author.displayName} on ${SITE_NAME}`;
    const description = post.text
      ? this.truncate(post.text)
      : `A post by ${post.author.displayName} (@${post.author.handle}) on ${SITE_NAME}.`;

    const readyMedia = post.media.find((m) => m.status === 'ready');
    const mediaUrl =
      readyMedia?.variants.large ?? readyMedia?.variants.medium ?? readyMedia?.variants.poster;
    const image = this.absoluteUrl(baseUrl, mediaUrl ?? post.author.avatarUrl);
    const card: 'summary' | 'summary_large_image' = mediaUrl ? 'summary_large_image' : 'summary';

    const jsonLd: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'SocialMediaPosting',
      url: canonical,
      datePublished: post.createdAt,
      ...(post.text ? { articleBody: post.text, headline: this.truncate(post.text, 110) } : {}),
      author: {
        '@type': 'Person',
        name: post.author.displayName,
        alternateName: `@${post.author.handle}`,
        url: `${baseUrl}/@${post.author.handle}`,
      },
      ...(mediaUrl ? { image } : {}),
      interactionStatistic: [
        {
          '@type': 'InteractionCounter',
          interactionType: 'https://schema.org/LikeAction',
          userInteractionCount: post.counts.likes,
        },
        {
          '@type': 'InteractionCounter',
          interactionType: 'https://schema.org/ShareAction',
          userInteractionCount: post.counts.reposts,
        },
        {
          '@type': 'InteractionCounter',
          interactionType: 'https://schema.org/ReplyAction',
          userInteractionCount: post.counts.replies,
        },
      ],
    };

    const bodyHtml = `<main>
<article>
<h1>${this.escapeHtml(post.author.displayName)} <span>@${this.escapeHtml(post.author.handle)}</span></h1>
${post.text ? `<p>${this.escapeHtml(post.text)}</p>` : ''}
<p><time datetime="${this.escapeHtml(post.createdAt)}">${this.escapeHtml(post.createdAt)}</time></p>
<p>${post.counts.likes} Likes · ${post.counts.reposts} Reposts · ${post.counts.replies} Replies</p>
</article>
</main>`;

    return {
      html: this.renderDocument({
        title,
        description,
        canonical,
        image,
        type: 'article',
        card,
        jsonLd,
        bodyHtml,
      }),
      status: 200,
    };
  }

  private renderNotFound(baseUrl: string, what: string): string {
    return this.renderDocument({
      title: `Not found / ${SITE_NAME}`,
      description: `We couldn't find ${what} on ${SITE_NAME}.`,
      canonical: baseUrl,
      image: `${baseUrl}${DEFAULT_OG_IMAGE}`,
      type: 'website',
      card: 'summary',
      bodyHtml: `<main><h1>Not found</h1><p>We couldn't find ${this.escapeHtml(what)}.</p></main>`,
      noindex: true,
    });
  }

  // ── Dynamic-rendering dispatcher ───────────────────────────────────────────────

  /**
   * Given the original request path (from nginx `X-Original-URI`), render the
   * matching crawler document. Falls back to a generic site document.
   */
  async renderPath(
    originalPath: string,
    baseUrl: string,
  ): Promise<{ html: string; status: number }> {
    // Strip query string and trailing slash.
    const path = originalPath.split('?')[0].replace(/\/+$/, '') || '/';
    const segments = path.split('/').filter(Boolean);

    // /:handle/status/:postId  (handle may be url-encoded "@handle")
    const statusIdx = segments.indexOf('status');
    if (statusIdx === 1 && segments[2]) {
      return this.renderPost(decodeURIComponent(segments[2]), baseUrl);
    }
    // /:handle  (and tabs: /:handle/replies, /:handle/media, …)
    if (segments.length >= 1 && segments[0] !== 'status') {
      const handle = decodeURIComponent(segments[0]);
      // Only treat as a profile when it looks like a handle (skip app routes).
      if (/^@?[A-Za-z0-9_]{1,30}$/.test(handle)) {
        return this.renderProfile(handle, baseUrl);
      }
    }

    return {
      html: this.renderDocument({
        title: 'PULSE — Microblogging, in real time',
        description:
          'PULSE is a real-time microblogging platform. Follow people, share posts, and join the conversation as it happens.',
        canonical: baseUrl + path,
        image: `${baseUrl}${DEFAULT_OG_IMAGE}`,
        type: 'website',
        card: 'summary_large_image',
        bodyHtml: `<main><h1>${SITE_NAME}</h1><p>Microblogging, in real time.</p></main>`,
      }),
      status: 200,
    };
  }

  // ── sitemap.xml ─────────────────────────────────────────────────────────────

  async buildSitemap(baseUrl: string): Promise<string> {
    const [users, posts] = await Promise.all([
      this.userRepo.find({
        where: { isPrivate: false },
        order: { createdAt: 'DESC' },
        take: SITEMAP_MAX_URLS,
        select: { handle: true, updatedAt: true },
      }),
      this.postRepo
        .createQueryBuilder('p')
        .innerJoin('p.author', 'a')
        .select('p.id', 'id')
        .addSelect('p.created_at', 'createdAt')
        .addSelect('a.handle', 'handle')
        .where('p.deleted_at IS NULL')
        .andWhere('a.deleted_at IS NULL')
        .andWhere('a.is_private = false')
        .andWhere('p.reply_to_id IS NULL')
        .andWhere('p.repost_of_id IS NULL')
        .orderBy('p.created_at', 'DESC')
        .limit(SITEMAP_MAX_URLS)
        .getRawMany<{ id: string; createdAt: Date; handle: string }>(),
    ]);

    const urls: string[] = [`${baseUrl}/`];
    const lastmods: (string | null)[] = [null];

    for (const u of users) {
      urls.push(`${baseUrl}/@${u.handle}`);
      lastmods.push(u.updatedAt ? new Date(u.updatedAt).toISOString() : null);
    }
    for (const p of posts) {
      urls.push(`${baseUrl}/@${p.handle}/status/${p.id}`);
      lastmods.push(p.createdAt ? new Date(p.createdAt).toISOString() : null);
    }

    const entries = urls
      .map((loc, i) => {
        const lm = lastmods[i];
        return `  <url>\n    <loc>${this.escapeXml(loc)}</loc>${lm ? `\n    <lastmod>${lm}</lastmod>` : ''}\n  </url>`;
      })
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
  }

  // ── robots.txt ────────────────────────────────────────────────────────────────

  buildRobots(baseUrl: string): string {
    return [
      '# robots.txt for PULSE',
      'User-agent: *',
      'Allow: /',
      'Disallow: /api/',
      'Disallow: /compose',
      'Disallow: /messages',
      'Disallow: /notifications',
      'Disallow: /bookmarks',
      'Disallow: /settings',
      'Disallow: /search',
      'Disallow: /verify-email',
      '',
      `Sitemap: ${baseUrl}/sitemap.xml`,
      '',
    ].join('\n');
  }
}
