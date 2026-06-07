import { describe, it, expect } from 'vitest';
import { CursorUtil, IdCursor, ScoreIdCursor } from '../../src/common/utils/cursor.util';

describe('CursorUtil', () => {
  describe('encode + decode round-trip', () => {
    it('round-trips an ID cursor', () => {
      const original: IdCursor = { type: 'id', id: '1750000000000000001' };
      const encoded = CursorUtil.encode(original);
      const decoded = CursorUtil.decode(encoded);
      expect(decoded).toEqual(original);
    });

    it('round-trips a score+id cursor', () => {
      const original: ScoreIdCursor = {
        type: 'score_id',
        score: '1750000000000000001',
        id: '1750000000000000002',
      };
      const encoded = CursorUtil.encode(original);
      const decoded = CursorUtil.decode(encoded);
      expect(decoded).toEqual(original);
    });

    it('round-trips via encodeId convenience method', () => {
      const id = '9999999999999';
      const encoded = CursorUtil.encodeId(id);
      const decoded = CursorUtil.decode(encoded);
      expect(decoded).toEqual({ type: 'id', id });
    });

    it('round-trips via encodeScoreId convenience method', () => {
      const score = '1750000000000000001';
      const id = '1750000000000000002';
      const encoded = CursorUtil.encodeScoreId(score, id);
      const decoded = CursorUtil.decode(encoded);
      expect(decoded).toEqual({ type: 'score_id', score, id });
    });
  });

  describe('encoded cursor is opaque', () => {
    it('produces a base64url string (no + or /)', () => {
      const encoded = CursorUtil.encodeId('123456789');
      // After the v1: prefix, should be base64url-safe
      const b64Part = encoded.slice('v1:'.length);
      expect(b64Part).toMatch(/^[A-Za-z0-9_-]+=*$/);
    });

    it('starts with version prefix', () => {
      const encoded = CursorUtil.encodeId('1');
      expect(encoded.startsWith('v1:')).toBe(true);
    });

    it('different IDs produce different cursors', () => {
      const c1 = CursorUtil.encodeId('1');
      const c2 = CursorUtil.encodeId('2');
      expect(c1).not.toBe(c2);
    });
  });

  describe('tamper rejection', () => {
    it('throws on completely invalid string', () => {
      expect(() => CursorUtil.decode('garbage')).toThrow('Invalid cursor');
    });

    it('throws on wrong version prefix', () => {
      expect(() => CursorUtil.decode('v2:abc123')).toThrow('Invalid cursor: unknown version');
    });

    it('throws on valid base64 but invalid JSON', () => {
      const badBase64 = 'v1:' + Buffer.from('not-json', 'utf8').toString('base64url');
      expect(() => CursorUtil.decode(badBase64)).toThrow('Invalid cursor: JSON parse failed');
    });

    it('throws on valid JSON but wrong payload shape (missing type)', () => {
      const badPayload = Buffer.from(JSON.stringify({ id: '123' }), 'utf8').toString('base64url');
      expect(() => CursorUtil.decode('v1:' + badPayload)).toThrow(
        'Invalid cursor: unexpected payload shape',
      );
    });

    it('throws on valid JSON but unknown type', () => {
      const badPayload = Buffer.from(
        JSON.stringify({ type: 'unknown', id: '123' }),
        'utf8',
      ).toString('base64url');
      expect(() => CursorUtil.decode('v1:' + badPayload)).toThrow(
        'Invalid cursor: unexpected payload shape',
      );
    });

    it('throws on id cursor with empty id', () => {
      const badPayload = Buffer.from(JSON.stringify({ type: 'id', id: '' }), 'utf8').toString(
        'base64url',
      );
      expect(() => CursorUtil.decode('v1:' + badPayload)).toThrow(
        'Invalid cursor: unexpected payload shape',
      );
    });

    it('throws on score_id cursor with missing score', () => {
      const badPayload = Buffer.from(
        JSON.stringify({ type: 'score_id', id: '123' }),
        'utf8',
      ).toString('base64url');
      expect(() => CursorUtil.decode('v1:' + badPayload)).toThrow(
        'Invalid cursor: unexpected payload shape',
      );
    });

    it('throws on truncated cursor', () => {
      const valid = CursorUtil.encodeId('123');
      expect(() => CursorUtil.decode(valid.slice(0, 5))).toThrow('Invalid cursor');
    });
  });

  describe('edge cases', () => {
    it('handles large Snowflake ID strings without precision loss', () => {
      const largeId = '1750000999999999999';
      const decoded = CursorUtil.decode(CursorUtil.encodeId(largeId)) as IdCursor;
      expect(decoded.id).toBe(largeId);
    });

    it('handles UUID strings as IDs', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const decoded = CursorUtil.decode(CursorUtil.encodeId(uuid)) as IdCursor;
      expect(decoded.id).toBe(uuid);
    });
  });
});
