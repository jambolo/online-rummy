import { describe, expect, it } from 'vitest';
import { validateC2S } from './validate.js';

const ok = (m: unknown): boolean => validateC2S(m).ok;

describe('validateC2S', () => {
  it('accepts every well-formed message type', () => {
    const good: unknown[] = [
      { t: 'create', variant: 'basic', name: 'A' },
      { t: 'create', variant: 'basic', name: 'A', houseRules: { aceEitherEnd: true } },
      { t: 'setHouseRules', houseRules: {} },
      { t: 'join', roomCode: 'ABCDE', name: 'A' },
      { t: 'join', roomCode: 'ABCDE', name: 'A', sessionId: 'x.y' },
      { t: 'start' },
      { t: 'passUpcard' },
      { t: 'keepalive' },
      { t: 'leave' },
      { t: 'draw', from: 'stock' },
      { t: 'draw', from: 'discard' },
      { t: 'drawFromPile', cardId: 'c1' },
      { t: 'meld', cardIds: ['a', 'b', 'c'] },
      { t: 'layoff', meldId: 'm', cardId: 'c' },
      { t: 'discard', cardId: 'c' },
      { t: 'knock', discardId: 'c' },
      { t: 'knock', melds: [['a', 'b', 'c']], discardId: 'c' },
      { t: 'knock' }, // engine answers ERR_KNOCK_REQUIRES_DISCARD
      { t: 'ginLayoff', layoffs: [] },
      { t: 'ginLayoff', ownMelds: [['a', 'b', 'c']], layoffs: [{ cardId: 'c', meldId: 'm' }] },
      { t: 'chat', text: 'hi' },
    ];
    for (const m of good) expect(ok(m), JSON.stringify(m)).toBe(true);
  });

  it('rejects non-objects and unknown or inherited type tags', () => {
    for (const m of [null, 42, 'str', [], {}, { t: 7 }, { t: 'nope' }, { t: 'toString' }, { t: '__proto__' }]) {
      expect(ok(m), JSON.stringify(m)).toBe(false);
    }
  });

  it('rejects missing or wrong-typed fields', () => {
    const bad: unknown[] = [
      { t: 'create', variant: 'basic' },
      { t: 'create', variant: 'basic', name: 42 },
      { t: 'create', variant: 7, name: 'A' },
      { t: 'create', variant: 'basic', name: 'A', houseRules: null },
      { t: 'create', variant: 'basic', name: 'A', houseRules: [] },
      { t: 'setHouseRules' },
      { t: 'setHouseRules', houseRules: 'x' },
      { t: 'join', name: 'A' },
      { t: 'join', roomCode: 'ABCDE' },
      { t: 'join', roomCode: 'ABCDE', name: 'A', sessionId: 1 },
      { t: 'draw' },
      { t: 'draw', from: 'pile' },
      { t: 'drawFromPile' },
      { t: 'meld' },
      { t: 'meld', cardIds: 'abc' },
      { t: 'meld', cardIds: [1, 2, 3] },
      { t: 'layoff', meldId: 'm' },
      { t: 'discard', cardId: null },
      { t: 'knock', melds: ['a', 'b'], discardId: 'c' },
      { t: 'knock', melds: [['a', 1]], discardId: 'c' },
      { t: 'knock', discardId: 5 },
      { t: 'ginLayoff' },
      { t: 'ginLayoff', layoffs: [{ cardId: 'c' }] },
      { t: 'ginLayoff', layoffs: [], ownMelds: 'x' },
      { t: 'chat' },
      { t: 'chat', text: ['hi'] },
    ];
    for (const m of bad) expect(ok(m), JSON.stringify(m)).toBe(false);
  });

  it('names the offending field', () => {
    expect(validateC2S({ t: 'create', variant: 'basic' })).toEqual({ ok: false, reason: 'Invalid field: name' });
  });
});
