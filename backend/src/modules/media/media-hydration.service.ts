import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Media } from './media.entity';
import { PostMedia } from './post-media.entity';
import { STORAGE_PORT, StoragePort } from '../../infra/storage/storage.port';
import { toPostMediaDto } from './media-url.util';
import type { PostDto, PostMediaDto } from '../posts/dto/post.dto';

/**
 * Hydrates attached media into post DTOs on READ. Post read paths build DTOs
 * with `media: []`; call `apply(posts)` once per page to batch-load post_media
 * + media and fill each `post.media` (variant keys → public URLs, with status).
 */
@Injectable()
export class MediaHydrationService {
  constructor(
    @InjectRepository(PostMedia) private readonly postMediaRepo: Repository<PostMedia>,
    @InjectRepository(Media) private readonly mediaRepo: Repository<Media>,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  /** post_id → ordered PostMediaDto[] for the given posts. */
  async forPostIds(postIds: string[]): Promise<Map<string, PostMediaDto[]>> {
    const result = new Map<string, PostMediaDto[]>();
    if (postIds.length === 0) return result;

    const links = await this.postMediaRepo.find({
      where: { postId: In(postIds) },
      order: { position: 'ASC' },
    });
    if (links.length === 0) return result;

    const mediaIds = [...new Set(links.map((l) => l.mediaId))];
    const medias = await this.mediaRepo.find({ where: { id: In(mediaIds) } });
    const byId = new Map(medias.map((m) => [m.id, m]));

    for (const link of links) {
      const media = byId.get(link.mediaId);
      if (!media) continue;
      const list = result.get(link.postId) ?? [];
      list.push(toPostMediaDto(media, this.storage));
      result.set(link.postId, list);
    }
    return result;
  }

  /** Fill `post.media` in place for a page of posts. No-op for empty input. */
  async apply(posts: PostDto[]): Promise<void> {
    if (posts.length === 0) return;
    const map = await this.forPostIds(posts.map((p) => p.id));
    for (const post of posts) post.media = map.get(post.id) ?? [];
  }
}
