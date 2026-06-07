// ============================================================
// charCounter tests
// ============================================================

import { describe, it, expect } from 'vitest'
import { countChars, CHAR_LIMIT, URL_LENGTH } from './charCounter'

describe('countChars', () => {
  it('counts plain ASCII text in codepoints', () => {
    const result = countChars('Hello world')
    expect(result.count).toBe(11)
    expect(result.remaining).toBe(CHAR_LIMIT - 11)
    expect(result.isOverLimit).toBe(false)
    expect(result.isNearLimit).toBe(false)
  })

  it('counts emoji as codepoints (not UTF-16 units)', () => {
    // Emoji like 🔥 is 2 UTF-16 units but 1 codepoint
    const result = countChars('🔥🔥🔥')
    expect(result.count).toBe(3)
  })

  it('counts each URL as exactly 23 characters regardless of length', () => {
    const shortUrl = 'https://t.co/abc'   // 16 chars
    const result = countChars(shortUrl)
    expect(result.count).toBe(URL_LENGTH)
  })

  it('counts a long URL as 23 characters', () => {
    const longUrl = 'https://www.example.com/very/long/path?with=query&params=andmore'
    const result = countChars(longUrl)
    expect(result.count).toBe(URL_LENGTH)
  })

  it('counts text + URL correctly', () => {
    const text = 'Check this out https://example.com'
    // "Check this out " = 15 chars + URL = 23 → 38
    const result = countChars(text)
    expect(result.count).toBe(15 + URL_LENGTH)
  })

  it('counts multiple URLs each as 23', () => {
    const text = 'https://a.com and https://b.com'
    // URL(23) + ' and ' (5) + URL(23) = 51
    const result = countChars(text)
    expect(result.count).toBe(23 + 5 + 23)
  })

  it('reports isOverLimit when count exceeds 280', () => {
    const overLimitText = 'a'.repeat(281)
    const result = countChars(overLimitText)
    expect(result.isOverLimit).toBe(true)
    expect(result.remaining).toBe(-1)
  })

  it('reports isNearLimit when 1-20 chars remain', () => {
    const text = 'a'.repeat(261) // 280 - 261 = 19 remaining
    const result = countChars(text)
    expect(result.isNearLimit).toBe(true)
    expect(result.isOverLimit).toBe(false)
  })

  it('is NOT near limit when exactly 21 chars remain', () => {
    const text = 'a'.repeat(259)
    const result = countChars(text)
    expect(result.isNearLimit).toBe(false)
    expect(result.remaining).toBe(21)
  })

  it('returns correct result for empty string', () => {
    const result = countChars('')
    expect(result.count).toBe(0)
    expect(result.remaining).toBe(CHAR_LIMIT)
    expect(result.isOverLimit).toBe(false)
    expect(result.isNearLimit).toBe(false)
  })

  it('counts text at exactly the limit as not over', () => {
    const text = 'a'.repeat(CHAR_LIMIT)
    const result = countChars(text)
    expect(result.isOverLimit).toBe(false)
    expect(result.remaining).toBe(0)
    expect(result.isNearLimit).toBe(true)  // 0 remaining ≤ 20
  })
})
