import { describe, it, expect } from 'vitest';
import { parseSearchQuery, buildTsQuery } from '../../../src/modules/search/search-query-parser';

describe('parseSearchQuery', () => {
  it('detects hashtag intent for #tag input', () => {
    const result = parseSearchQuery('#typescript');
    expect(result.type).toBe('hashtag');
    if (result.type === 'hashtag') {
      expect(result.tag).toBe('typescript');
    }
  });

  it('lowercases hashtag', () => {
    const result = parseSearchQuery('#TypeScript');
    expect(result.type).toBe('hashtag');
    if (result.type === 'hashtag') {
      expect(result.tag).toBe('typescript');
    }
  });

  it('detects user intent for @handle input', () => {
    const result = parseSearchQuery('@alice');
    expect(result.type).toBe('user');
    if (result.type === 'user') {
      expect(result.handle).toBe('alice');
    }
  });

  it('lowercases handle', () => {
    const result = parseSearchQuery('@Alice_123');
    expect(result.type).toBe('user');
    if (result.type === 'user') {
      expect(result.handle).toBe('alice_123');
    }
  });

  it('returns fts intent for plain text', () => {
    const result = parseSearchQuery('hello world');
    expect(result.type).toBe('fts');
    if (result.type === 'fts') {
      expect(result.ftsQuery).toBe('hello world');
      expect(result.fromHandle).toBeUndefined();
    }
  });

  it('extracts from:handle operator and leaves remaining query', () => {
    const result = parseSearchQuery('cool posts from:alice');
    expect(result.type).toBe('fts');
    if (result.type === 'fts') {
      expect(result.fromHandle).toBe('alice');
      expect(result.ftsQuery).toContain('cool posts');
    }
  });

  it('handles empty string as fts', () => {
    const result = parseSearchQuery('');
    expect(result.type).toBe('fts');
  });

  it('handles mixed #tag in sentence as fts (not hashtag intent)', () => {
    // Only pure "#tag" is hashtag intent; "#tag in sentence" is FTS
    const result = parseSearchQuery('#tag in sentence');
    expect(result.type).toBe('fts');
  });

  it('handles mixed @handle in sentence as fts', () => {
    const result = parseSearchQuery('@alice tweeted');
    expect(result.type).toBe('fts');
  });
});

describe('buildTsQuery', () => {
  it('strips tsquery special chars', () => {
    const result = buildTsQuery("hello & world | 'test'");
    expect(result).not.toContain('&');
    expect(result).not.toContain('|');
    expect(result).not.toContain("'");
    expect(result).toContain('hello');
    expect(result).toContain('world');
  });

  it('trims result', () => {
    const result = buildTsQuery('  hello  ');
    expect(result).toBe('hello');
  });

  it('passes plain terms unchanged', () => {
    const result = buildTsQuery('typescript nestjs');
    expect(result).toBe('typescript nestjs');
  });
});
