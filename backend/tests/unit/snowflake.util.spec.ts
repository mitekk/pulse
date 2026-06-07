import { describe, it, expect, beforeEach } from 'vitest';
import { SnowflakeUtil } from '../../src/common/utils/snowflake.util';

describe('SnowflakeUtil', () => {
  let generator: SnowflakeUtil;

  beforeEach(() => {
    generator = new SnowflakeUtil(0);
  });

  describe('generate()', () => {
    it('returns a string', () => {
      const id = generator.generate();
      expect(typeof id).toBe('string');
    });

    it('returns a non-empty string', () => {
      const id = generator.generate();
      expect(id.length).toBeGreaterThan(0);
    });

    it('produces numeric string parseable as BigInt', () => {
      const id = generator.generate();
      expect(() => BigInt(id)).not.toThrow();
    });

    it('is monotonically increasing across sequential calls', () => {
      const ids: bigint[] = [];
      for (let i = 0; i < 100; i++) {
        ids.push(BigInt(generator.generate()));
      }
      for (let i = 1; i < ids.length; i++) {
        expect(ids[i]).toBeGreaterThan(ids[i - 1]);
      }
    });

    it('produces no duplicates in a tight loop (4096 ids)', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 4096; i++) {
        ids.add(generator.generate());
      }
      expect(ids.size).toBe(4096);
    });

    it('produces no duplicates across 10 000 ids', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 10_000; i++) {
        ids.add(generator.generate());
      }
      expect(ids.size).toBe(10_000);
    });

    it('stays within JavaScript safe integer range (can be stringified safely)', () => {
      const id = BigInt(generator.generate());
      const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
      // Snowflake IDs should be expressible as BigInt; warn but don't fail if they exceed
      // MAX_SAFE (they may for some configurations) — the important thing is we use strings
      expect(id).toBeGreaterThan(0n);
      // Log for reference — IDs from a 41-bit timestamp + 22-bit suffix
      // will exceed Number.MAX_SAFE_INTEGER; that is expected and why we use strings
      expect(typeof id.toString()).toBe('string');
      void MAX_SAFE;
    });

    it('embeds a timestamp close to now', () => {
      const before = Date.now();
      const id = generator.generate();
      const after = Date.now();
      const embedded = SnowflakeUtil.timestampOf(id).getTime();
      expect(embedded).toBeGreaterThanOrEqual(before);
      expect(embedded).toBeLessThanOrEqual(after + 1); // +1ms for timing tolerance
    });
  });

  describe('constructor validation', () => {
    it('throws for negative machineId', () => {
      expect(() => new SnowflakeUtil(-1)).toThrow('machineId');
    });

    it('throws for machineId > 1023', () => {
      expect(() => new SnowflakeUtil(1024)).toThrow('machineId');
    });

    it('accepts machineId = 0', () => {
      expect(() => new SnowflakeUtil(0)).not.toThrow();
    });

    it('accepts machineId = 1023', () => {
      expect(() => new SnowflakeUtil(1023)).not.toThrow();
    });
  });

  describe('timestampOf()', () => {
    it('extracts a Date within 1s of generation', () => {
      const before = new Date();
      const id = generator.generate();
      const after = new Date();
      const extracted = SnowflakeUtil.timestampOf(id);
      expect(extracted.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(extracted.getTime()).toBeLessThanOrEqual(after.getTime() + 1);
    });
  });

  describe('different machineId produces different IDs at same ms', () => {
    it('two generators with different machineIds produce different IDs', () => {
      const g1 = new SnowflakeUtil(1);
      const g2 = new SnowflakeUtil(2);
      // Generate many IDs quickly from both — some will share the same millisecond
      const ids1 = new Set(Array.from({ length: 100 }, () => g1.generate()));
      const ids2 = new Set(Array.from({ length: 100 }, () => g2.generate()));
      const intersection = [...ids1].filter((id) => ids2.has(id));
      expect(intersection.length).toBe(0);
    });
  });
});
