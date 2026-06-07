/**
 * SearchQueryParser — parse raw search query into structured intent.
 *
 * Supported patterns:
 *   #tag       → redirect to hashtag timeline (tag field populated)
 *   @handle    → redirect to user lookup (handle field populated)
 *   bare terms → full-text search (ftsQuery field populated)
 *
 * [NICE] `from:handle` operator — strips from query and sets fromHandle.
 */

export type QueryIntent =
  | { type: 'hashtag'; tag: string }
  | { type: 'user'; handle: string }
  | { type: 'fts'; ftsQuery: string; fromHandle?: string };

const HASHTAG_RE = /^#([a-z0-9_]{1,100})$/i;
const HANDLE_RE = /^@([a-z0-9_]{1,50})$/i;
const FROM_RE = /\bfrom:([a-z0-9_]{1,50})\b/gi;

/**
 * Parse a raw search query string into a typed intent.
 */
export function parseSearchQuery(raw: string): QueryIntent {
  const q = raw.trim();

  // Single-token hashtag intent: `#tag`
  const hashMatch = HASHTAG_RE.exec(q);
  if (hashMatch) {
    return { type: 'hashtag', tag: hashMatch[1].toLowerCase() };
  }

  // Single-token handle intent: `@handle`
  const handleMatch = HANDLE_RE.exec(q);
  if (handleMatch) {
    return { type: 'user', handle: handleMatch[1].toLowerCase() };
  }

  // [NICE] from:handle operator — extract and strip
  let fromHandle: string | undefined;
  const fromMatch = FROM_RE.exec(q);
  if (fromMatch) {
    fromHandle = fromMatch[1].toLowerCase();
  }
  const ftsQuery = q.replace(FROM_RE, '').trim();

  return { type: 'fts', ftsQuery: ftsQuery || q, fromHandle };
}

/**
 * Build a Postgres `plainto_tsquery` compatible input from a raw query string.
 * Strips special chars that could cause parse errors.
 */
export function buildTsQuery(raw: string): string {
  // Remove chars that break tsquery: ! & | ( ) : ' < >
  return raw.replace(/[!&|():'"<>]/g, ' ').trim();
}
