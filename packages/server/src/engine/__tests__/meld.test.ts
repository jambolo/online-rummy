import { describe, expect, it } from 'vitest';
import type { Card } from '@online-rummy/shared';
import { cardPoints, validateMeld } from '@online-rummy/shared';

const ACE_LOW = { aceHigh: false, roundTheCorner: false };
const ACE_HIGH = { aceHigh: true, roundTheCorner: false };

function c(rank: Card['rank'], suit: Card['suit']): Card {
  return { id: `${rank}${suit}`, rank, suit };
}

describe('validateMeld — sets', () => {
  // rules.md A.1.5: set = 3 or 4 cards of same rank
  it('accepts 3-card set', () => {
    expect(validateMeld([c('7', 'C'), c('7', 'D'), c('7', 'H')], ACE_LOW)).toBe(true);
  });

  it('accepts 4-card set', () => {
    expect(validateMeld([c('K', 'C'), c('K', 'D'), c('K', 'H'), c('K', 'S')], ACE_LOW)).toBe(true);
  });

  it('rejects 2-card set', () => {
    expect(validateMeld([c('5', 'C'), c('5', 'D')], ACE_LOW)).toBe(false);
  });

  it('rejects 5+ card set', () => {
    expect(
      validateMeld([c('A', 'C'), c('A', 'D'), c('A', 'H'), c('A', 'S'), c('A', 'C')], ACE_LOW),
    ).toBe(false);
  });

  it('rejects mixed-rank', () => {
    expect(validateMeld([c('7', 'C'), c('8', 'D'), c('7', 'H')], ACE_LOW)).toBe(false);
  });
});

describe('validateMeld — runs', () => {
  // rules.md A.1.5: run = 3+ consecutive same suit
  it('accepts 3-card run', () => {
    expect(validateMeld([c('J', 'S'), c('Q', 'S'), c('K', 'S')], ACE_LOW)).toBe(true);
  });

  it('accepts 5-card run', () => {
    expect(
      validateMeld([c('3', 'H'), c('4', 'H'), c('5', 'H'), c('6', 'H'), c('7', 'H')], ACE_LOW),
    ).toBe(true);
  });

  it('accepts out-of-order cards (sorted internally)', () => {
    expect(validateMeld([c('5', 'D'), c('3', 'D'), c('4', 'D')], ACE_LOW)).toBe(true);
  });

  it('rejects mixed suits', () => {
    expect(validateMeld([c('3', 'C'), c('4', 'D'), c('5', 'C')], ACE_LOW)).toBe(false);
  });

  it('rejects gap in run', () => {
    expect(validateMeld([c('3', 'C'), c('4', 'C'), c('6', 'C')], ACE_LOW)).toBe(false);
  });

  // rules.md A.1.4: A-2-3 valid (ace low)
  it('accepts A-2-3 run (ace low)', () => {
    expect(validateMeld([c('A', 'H'), c('2', 'H'), c('3', 'H')], ACE_LOW)).toBe(true);
  });

  // rules.md A.1.4: Q-K-A invalid (ace low)
  it('rejects Q-K-A (ace low)', () => {
    expect(validateMeld([c('Q', 'H'), c('K', 'H'), c('A', 'H')], ACE_LOW)).toBe(false);
  });

  // Ace high: A-2-3 invalid, Q-K-A valid
  it('rejects A-2-3 (ace high)', () => {
    expect(validateMeld([c('A', 'D'), c('2', 'D'), c('3', 'D')], ACE_HIGH)).toBe(false);
  });

  it('accepts Q-K-A run (ace high)', () => {
    expect(validateMeld([c('Q', 'D'), c('K', 'D'), c('A', 'D')], ACE_HIGH)).toBe(true);
  });

  it('rejects 2-card run', () => {
    expect(validateMeld([c('5', 'C'), c('6', 'C')], ACE_LOW)).toBe(false);
  });
});

describe('cardPoints', () => {
  // rules.md A.1.8
  it('ace = 1 (default)', () => {
    expect(cardPoints(c('A', 'S'))).toBe(1);
  });

  it('face cards = 10', () => {
    expect(cardPoints(c('J', 'C'))).toBe(10);
    expect(cardPoints(c('Q', 'D'))).toBe(10);
    expect(cardPoints(c('K', 'H'))).toBe(10);
  });

  it('pip cards = face value', () => {
    expect(cardPoints(c('2', 'S'))).toBe(2);
    expect(cardPoints(c('10', 'H'))).toBe(10);
    expect(cardPoints(c('7', 'C'))).toBe(7);
  });

  it('ace = 15 when aceValue=15 (500 rummy)', () => {
    expect(cardPoints(c('A', 'S'), 15)).toBe(15);
  });
});
