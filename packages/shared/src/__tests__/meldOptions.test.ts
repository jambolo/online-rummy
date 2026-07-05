import { describe, it, expect } from 'vitest';
import type { Card } from '../cards.js';
import { validateMeld, cardPoints, score500MeldCard } from '../meld.js';

const c = (rank: Card['rank'], suit: Card['suit'], id?: string): Card => ({ id: id ?? `${rank}${suit}`, rank, suit });

describe('validateMeld runs (house rule options)', () => {
  it('canonical opts {aceHigh:false, roundTheCorner:false}', () => {
    const opts = { aceHigh: false, roundTheCorner: false };
    expect(validateMeld([c('A', 'H'), c('2', 'H'), c('3', 'H')], opts)).toBe(true);
    expect(validateMeld([c('Q', 'H'), c('K', 'H'), c('A', 'H')], opts)).toBe(false);
    expect(validateMeld([c('K', 'H'), c('A', 'H'), c('2', 'H')], opts)).toBe(false);
  });

  it('{aceHigh:false, roundTheCorner:false, aceEitherEnd:true}', () => {
    const opts = { aceHigh: false, roundTheCorner: false, aceEitherEnd: true };
    expect(validateMeld([c('Q', 'H'), c('K', 'H'), c('A', 'H')], opts)).toBe(true);
    expect(validateMeld([c('K', 'H'), c('A', 'H'), c('2', 'H')], opts)).toBe(false);
  });

  it('{aceHigh:false, roundTheCorner:true}', () => {
    const opts = { aceHigh: false, roundTheCorner: true };
    expect(validateMeld([c('K', 'H'), c('A', 'H'), c('2', 'H')], opts)).toBe(true);
    expect(validateMeld([c('Q', 'H'), c('K', 'H'), c('A', 'H')], opts)).toBe(true);
    expect(validateMeld([c('A', 'H'), c('2', 'H'), c('3', 'H')], opts)).toBe(true);
    expect(validateMeld([c('Q', 'H'), c('K', 'H'), c('A', 'H'), c('2', 'H'), c('3', 'H')], opts)).toBe(true);
    expect(validateMeld([c('4', 'H'), c('5', 'H'), c('7', 'H')], opts)).toBe(false);
    expect(validateMeld([c('K', 'H', 'K1'), c('K', 'H', 'K2'), c('A', 'H')], opts)).toBe(false);
  });
});

describe('validateMeld sets (house rule options)', () => {
  const opts = { aceHigh: false, roundTheCorner: false };

  it('7H7D7S valid with and without setsRequireDistinctSuits', () => {
    const cards = [c('7', 'H'), c('7', 'D'), c('7', 'S')];
    expect(validateMeld(cards, opts)).toBe(true);
    expect(validateMeld(cards, { ...opts, setsRequireDistinctSuits: true })).toBe(true);
  });

  it('7H7H7D (distinct ids) valid without the option, invalid with it', () => {
    const cards = [c('7', 'H', '7H-1'), c('7', 'H', '7H-2'), c('7', 'D')];
    expect(validateMeld(cards, opts)).toBe(true);
    expect(validateMeld(cards, { ...opts, setsRequireDistinctSuits: true })).toBe(false);
  });

  it('4-card 7H7D7S7C valid with the option', () => {
    const cards = [c('7', 'H'), c('7', 'D'), c('7', 'S'), c('7', 'C')];
    expect(validateMeld(cards, { ...opts, setsRequireDistinctSuits: true })).toBe(true);
  });
});

describe('cardPoints (low5Scoring)', () => {
  it('defaults to face value', () => {
    expect(cardPoints(c('7', 'H'))).toBe(7);
  });

  it('scores 2-9 at 5 with low5Scoring, leaves 10/J unaffected, respects aceValue', () => {
    expect(cardPoints(c('2', 'H'), 1, { low5Scoring: true })).toBe(5);
    expect(cardPoints(c('9', 'H'), 1, { low5Scoring: true })).toBe(5);
    expect(cardPoints(c('7', 'H'), 1, { low5Scoring: true })).toBe(5);
    expect(cardPoints(c('10', 'H'), 1, { low5Scoring: true })).toBe(10);
    expect(cardPoints(c('J', 'H'), 1, { low5Scoring: true })).toBe(10);
    expect(cardPoints(c('A', 'H'), 15, { low5Scoring: true })).toBe(15);
  });
});

describe('score500MeldCard (house rule options)', () => {
  it('canonical (no opts)', () => {
    const run123 = [c('A', 'H'), c('2', 'H'), c('3', 'H')];
    expect(score500MeldCard(c('A', 'H'), run123)).toBe(1);

    const runQKA = [c('Q', 'H'), c('K', 'H'), c('A', 'H')];
    expect(score500MeldCard(c('A', 'H'), runQKA)).toBe(15);

    const threeAces = [c('A', 'H'), c('A', 'D'), c('A', 'S')];
    expect(score500MeldCard(c('A', 'H'), threeAces)).toBe(15);

    const run8910 = [c('8', 'D'), c('9', 'D'), c('10', 'D')];
    expect(score500MeldCard(c('9', 'D'), run8910)).toBe(9);
  });

  it('{acesAlways15:true}', () => {
    const run123 = [c('A', 'H'), c('2', 'H'), c('3', 'H')];
    const opts = { acesAlways15: true };
    expect(score500MeldCard(c('A', 'H'), run123, opts)).toBe(15);
    expect(score500MeldCard(c('2', 'H'), run123, opts)).toBe(2);
  });

  it('{low5Scoring:true}', () => {
    const run123 = [c('A', 'H'), c('2', 'H'), c('3', 'H')];
    const run8910 = [c('8', 'D'), c('9', 'D'), c('10', 'D')];
    const setOf7s = [c('7', 'H'), c('7', 'D'), c('7', 'S')];
    const runJQK = [c('J', 'C'), c('Q', 'C'), c('K', 'C')];
    const opts = { low5Scoring: true };

    expect(score500MeldCard(c('A', 'H'), run123, opts)).toBe(5);
    expect(score500MeldCard(c('2', 'H'), run123, opts)).toBe(5);
    expect(score500MeldCard(c('9', 'D'), run8910, opts)).toBe(5);
    expect(score500MeldCard(c('10', 'D'), run8910, opts)).toBe(10);
    for (const card of setOf7s) {
      expect(score500MeldCard(card, setOf7s, opts)).toBe(5);
    }
    expect(score500MeldCard(c('J', 'C'), runJQK, opts)).toBe(10);
  });

  it('{acesAlways15:true, low5Scoring:true} — acesAlways15 governs aces (decision D2)', () => {
    const run123 = [c('A', 'H'), c('2', 'H'), c('3', 'H')];
    const opts = { acesAlways15: true, low5Scoring: true };
    expect(score500MeldCard(c('A', 'H'), run123, opts)).toBe(15);
    expect(score500MeldCard(c('2', 'H'), run123, opts)).toBe(5);
  });
});
