// ============================================================
// liveTokenizer tests
// ============================================================

import { describe, it, expect } from 'vitest'
import { tokenize } from './liveTokenizer'

describe('tokenize', () => {
  it('returns a single text segment for plain text', () => {
    const result = tokenize('Hello world')
    expect(result).toEqual([{ kind: 'text', value: 'Hello world' }])
  })

  it('detects @mention', () => {
    const result = tokenize('Hey @alice!')
    expect(result).toEqual([
      { kind: 'text', value: 'Hey ' },
      { kind: 'mention', value: '@alice' },
      { kind: 'text', value: '!' },
    ])
  })

  it('detects #hashtag', () => {
    const result = tokenize('Love #rust')
    expect(result).toEqual([
      { kind: 'text', value: 'Love ' },
      { kind: 'hashtag', value: '#rust' },
    ])
  })

  it('detects https URL', () => {
    const result = tokenize('Visit https://example.com now')
    expect(result).toEqual([
      { kind: 'text', value: 'Visit ' },
      { kind: 'url', value: 'https://example.com' },
      { kind: 'text', value: ' now' },
    ])
  })

  it('handles multiple entities', () => {
    const result = tokenize('@bob check #news https://t.co/abc')
    expect(result.map((s) => s.kind)).toEqual(['mention', 'text', 'hashtag', 'text', 'url'])
  })

  it('returns empty array for empty string', () => {
    expect(tokenize('')).toEqual([])
  })
})
