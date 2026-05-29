import { describe, expect, it } from 'vitest';
import { cryptoRNG, makeSeededRNG } from './rng.js';

describe('cryptoRNG', () => {
  it('returns an integer within [min, max)', () => {
    for (let i = 0; i < 1000; i++) {
      const n = cryptoRNG(5, 10);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(5);
      expect(n).toBeLessThan(10);
    }
  });

  it('eventually returns every value in a small range', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(cryptoRNG(0, 3));
    expect(seen).toEqual(new Set([0, 1, 2]));
  });
});

describe('makeSeededRNG', () => {
  it('is deterministic for a given seed', () => {
    const a = makeSeededRNG(42);
    const b = makeSeededRNG(42);
    const seqA = Array.from({ length: 10 }, () => a(0, 100));
    const seqB = Array.from({ length: 10 }, () => b(0, 100));
    expect(seqA).toEqual(seqB);
  });

  it('stays within [min, max)', () => {
    const rng = makeSeededRNG(7);
    for (let i = 0; i < 500; i++) {
      const n = rng(2, 8);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThan(8);
    }
  });
});
