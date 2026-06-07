// ============================================================
// Character counter — mirrors backend policy:
//   - Count in Unicode codepoints (not UTF-16 code units)
//   - Each URL (any http:// or https:// link) counts as 23 chars
//     regardless of actual length
//   - Limit: 280
// ============================================================

const CHAR_LIMIT = 280
const URL_LENGTH = 23

// URL regex — matches http:// and https:// URLs in text
// We match greedily to the end of the URL
const URL_PATTERN = /https?:\/\/[^\s]+/g

export interface CountResult {
  /** Characters consumed (codepoints, with URLs normalized to 23) */
  count: number
  /** Characters remaining (negative = over limit) */
  remaining: number
  /** Whether over the limit */
  isOverLimit: boolean
  /** Whether near the limit (≤20 remaining and not over) */
  isNearLimit: boolean
}

/**
 * Count a text's length using the same policy as the backend.
 * URLs are replaced with a 23-char placeholder before counting.
 */
export function countChars(text: string): CountResult {
  // Replace each URL with a placeholder of exactly URL_LENGTH chars
  const normalized = text.replace(URL_PATTERN, (_match) =>
    'x'.repeat(URL_LENGTH),
  )

  // Count codepoints (spread handles surrogate pairs / emoji correctly)
  const count = [...normalized].length

  const remaining = CHAR_LIMIT - count
  return {
    count,
    remaining,
    isOverLimit: remaining < 0,
    isNearLimit: remaining >= 0 && remaining <= 20,
  }
}

export { CHAR_LIMIT, URL_LENGTH }
