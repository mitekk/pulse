/**
 * Pagination helpers shared across controllers.
 *
 * Centralizes limit normalization so every list endpoint behaves consistently:
 * a missing, zero, negative, or non-numeric `limit` falls back to the default,
 * and anything above the max is clamped. This prevents the `limit=0` →
 * `{ items: [], hasMore: true }` inconsistency (services fetch `limit + 1`, so a
 * 0 limit fetched 1 row and reported more pages while returning none).
 */
export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export function normalizeLimit(
  raw: string | number | undefined | null,
  options: { def?: number; max?: number } = {},
): number {
  const def = options.def ?? DEFAULT_PAGE_LIMIT;
  const max = options.max ?? MAX_PAGE_LIMIT;
  const n = typeof raw === 'number' ? raw : parseInt(raw ?? '', 10);
  if (!Number.isFinite(n) || n < 1) return def;
  return Math.min(Math.floor(n), max);
}
