import { Media, MediaVariants } from './media.entity';
import { MediaDto } from './dto/media.dto';
import { PostMediaDto } from '../posts/dto/post.dto';
import { StoragePort } from '../../infra/storage/storage.port';

/**
 * Variant values are storage KEYS in the DB; serialize them to public-read URLs
 * at read time (no host/CDN/expiry persisted). Keep this the single place that
 * turns keys into URLs so every read path (media poll, post create + hydrate)
 * stays consistent.
 */
export function serializeVariants(
  variants: MediaVariants | null | undefined,
  storage: StoragePort,
): MediaVariants {
  const out: MediaVariants = {};
  if (!variants) return out;
  for (const [name, key] of Object.entries(variants)) {
    if (key) out[name as keyof MediaVariants] = storage.getPublicUrl(key);
  }
  return out;
}

/** Post-attached media shape (variants serialized to URLs, status for placeholder). */
export function toPostMediaDto(media: Media, storage: StoragePort): PostMediaDto {
  return {
    id: media.id,
    type: media.type,
    status: media.status,
    variants: serializeVariants(media.variants, storage),
    altText: media.altText,
    width: media.width,
    height: media.height,
  };
}

export function mediaToDto(media: Media, storage: StoragePort): MediaDto {
  return {
    id: media.id,
    type: media.type,
    status: media.status,
    mime: media.mime,
    width: media.width,
    height: media.height,
    durationMs: media.durationMs,
    altText: media.altText,
    variants: serializeVariants(media.variants, storage),
    createdAt: media.createdAt.toISOString(),
  };
}
