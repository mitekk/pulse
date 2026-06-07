// ============================================================
// RichText — renders PostDto.text using backend entities offsets.
// Source of truth is the entities array — never re-parses raw text.
//
// @mention  → /:handle (accent color)
// #hashtag  → /search?q=%23tag&type=top (accent color)
// URL       → external link (shortened displayUrl, rel=noopener noreferrer)
// ============================================================

import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { PostEntities } from '@/types/api'

interface RichTextProps {
  text: string
  entities: PostEntities
  /** If true, wraps text in a block-level element */
  block?: boolean
}

type Segment =
  | { kind: 'text'; value: string }
  | { kind: 'mention'; handle: string; start: number; end: number }
  | { kind: 'hashtag'; tag: string; start: number; end: number }
  | { kind: 'url'; url: string; displayUrl: string; start: number; end: number }

function buildSegments(text: string, entities: PostEntities): Segment[] {
  // Collect all entity ranges with their type info
  type EntityRange = {
    start: number
    end: number
    segment: Exclude<Segment, { kind: 'text' }>
  }

  const ranges: EntityRange[] = [
    ...entities.mentions.map((m) => ({
      start: m.start,
      end: m.end,
      segment: { kind: 'mention' as const, handle: m.handle, start: m.start, end: m.end },
    })),
    ...entities.hashtags.map((h) => ({
      start: h.start,
      end: h.end,
      segment: { kind: 'hashtag' as const, tag: h.tag, start: h.start, end: h.end },
    })),
    ...entities.urls.map((u) => ({
      start: u.start,
      end: u.end,
      segment: {
        kind: 'url' as const,
        url: u.url,
        displayUrl: u.displayUrl,
        start: u.start,
        end: u.end,
      },
    })),
  ]

  // Sort by start offset; if ties, longer range first
  ranges.sort((a, b) => a.start - b.start || b.end - a.end)

  const segments: Segment[] = []
  // Use codePoint-aware slicing; backend offsets are codepoint-based
  const chars = [...text] // spread splits by codepoint
  let cursor = 0

  for (const range of ranges) {
    if (range.start < cursor) continue // skip overlapping (shouldn't happen with valid entities)
    if (range.start > cursor) {
      // Plain text before this entity
      segments.push({ kind: 'text', value: chars.slice(cursor, range.start).join('') })
    }
    segments.push(range.segment)
    cursor = range.end
  }

  if (cursor < chars.length) {
    segments.push({ kind: 'text', value: chars.slice(cursor).join('') })
  }

  return segments
}

const accentStyle = {
  color: 'var(--color-accent)',
  fontWeight: 'var(--font-weight-medium)' as const,
  textDecoration: 'none',
}

export function RichText({ text, entities, block = true }: RichTextProps) {
  const segments = useMemo(() => buildSegments(text, entities), [text, entities])

  const content = segments.map((seg, i) => {
    switch (seg.kind) {
      case 'text':
        return <span key={i}>{seg.value}</span>

      case 'mention':
        return (
          <Link
            key={i}
            to={`/@${seg.handle}`}
            data-testid={`mention-${seg.handle}`}
            style={accentStyle}
          >
            @{seg.handle}
          </Link>
        )

      case 'hashtag':
        return (
          <Link
            key={i}
            to={`/search?q=${encodeURIComponent('#' + seg.tag)}&type=top`}
            data-testid={`hashtag-${seg.tag}`}
            style={accentStyle}
          >
            #{seg.tag}
          </Link>
        )

      case 'url':
        return (
          <a
            key={i}
            href={seg.url}
            target="_blank"
            rel="noopener noreferrer"
            data-testid={`url-link-${i}`}
            style={accentStyle}
          >
            {seg.displayUrl}
          </a>
        )
    }
  })

  if (block) {
    return (
      <p
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-base)',
          lineHeight: 'var(--leading-relaxed)',
          color: 'var(--color-text)',
          wordBreak: 'break-word',
          overflowWrap: 'break-word',
          whiteSpace: 'pre-wrap',
          margin: 0,
        }}
      >
        {content}
      </p>
    )
  }

  return <span>{content}</span>
}
