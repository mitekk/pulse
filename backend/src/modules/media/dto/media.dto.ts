import type { MediaStatus, MediaType, MediaVariants } from '../media.entity';

/**
 * MediaDto — canonical response shape for a single media item.
 * Matches the contract shape in api-contract.md exactly.
 */
export interface MediaDto {
  id: string;
  type: MediaType;
  status: MediaStatus;
  mime: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  altText: string | null;
  variants: MediaVariants;
  createdAt: string;
}
