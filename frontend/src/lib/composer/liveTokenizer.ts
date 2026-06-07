// ============================================================
// Live tokenizer — parses raw composer text into segments
// for live syntax-highlighting while typing.
// This is COMPOSER-ONLY; never used for persistence.
//
// Segments:
//   text      — plain text
//   mention   — @handle
//   hashtag   — #tag
//   url       — http/https URL
// ============================================================

export type SegmentKind = 'text' | 'mention' | 'hashtag' | 'url'

export interface TextSegment {
  kind: SegmentKind
  value: string
}

// Match order matters: URLs first (greedy), then mentions, then hashtags.
const TOKEN_RE =
  /https?:\/\/[^\s]+|@([A-Za-z0-9_]{1,50})|#([A-Za-z0-9_À-ž]{1,100})/g

export function tokenize(text: string): TextSegment[] {
  const segments: TextSegment[] = []
  let lastIndex = 0

  for (const match of text.matchAll(TOKEN_RE)) {
    const start = match.index!
    // Push any plain text before this match
    if (start > lastIndex) {
      segments.push({ kind: 'text', value: text.slice(lastIndex, start) })
    }

    const raw = match[0]
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      segments.push({ kind: 'url', value: raw })
    } else if (raw.startsWith('@')) {
      segments.push({ kind: 'mention', value: raw })
    } else if (raw.startsWith('#')) {
      segments.push({ kind: 'hashtag', value: raw })
    }

    lastIndex = start + raw.length
  }

  // Trailing plain text
  if (lastIndex < text.length) {
    segments.push({ kind: 'text', value: text.slice(lastIndex) })
  }

  return segments
}
