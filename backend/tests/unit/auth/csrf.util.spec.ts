import { describe, it, expect } from 'vitest';
import { CsrfUtil } from '../../../src/modules/auth/csrf.util';

describe('CsrfUtil', () => {
  describe('generate', () => {
    it('returns a 64-char hex string (32 bytes)', () => {
      const token = CsrfUtil.generate();
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('generates unique tokens each call', () => {
      const a = CsrfUtil.generate();
      const b = CsrfUtil.generate();
      expect(a).not.toBe(b);
    });
  });

  describe('validate', () => {
    it('returns true when cookie and header values match', () => {
      const token = CsrfUtil.generate();
      expect(CsrfUtil.validate(token, token)).toBe(true);
    });

    it('returns false when values differ', () => {
      const a = CsrfUtil.generate();
      const b = CsrfUtil.generate();
      expect(CsrfUtil.validate(a, b)).toBe(false);
    });

    it('returns false when cookie is undefined', () => {
      expect(CsrfUtil.validate(undefined, 'token')).toBe(false);
    });

    it('returns false when header is undefined', () => {
      expect(CsrfUtil.validate('token', undefined)).toBe(false);
    });

    it('returns false when both are undefined', () => {
      expect(CsrfUtil.validate(undefined, undefined)).toBe(false);
    });

    it('returns false when lengths differ (no buffer overflow)', () => {
      expect(CsrfUtil.validate('short', 'much-longer-value-here')).toBe(false);
    });

    it('returns false for empty strings', () => {
      expect(CsrfUtil.validate('', '')).toBe(false);
    });
  });
});
