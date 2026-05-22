import { describe, expect, it } from 'vitest';
import { buildDeck, buildShuffledDeck, dealN, shuffle } from '../deck.js';
import { makeSeededRNG } from '../../rng.js';

describe('buildDeck', () => {
  it('builds 52 cards for 1 deck', () => {
    const deck = buildDeck(1);
    expect(deck).toHaveLength(52);
  });

  it('builds 104 cards for 2 decks', () => {
    expect(buildDeck(2)).toHaveLength(104);
  });

  it('assigns unique IDs', () => {
    const deck = buildDeck(1);
    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(52);
  });

  it('contains all 52 rank+suit combos', () => {
    const deck = buildDeck(1);
    const combos = new Set(deck.map((c) => `${c.rank}${c.suit}`));
    expect(combos.size).toBe(52);
  });
});

describe('shuffle', () => {
  it('returns same length', () => {
    const rng = makeSeededRNG(42);
    const deck = buildDeck();
    shuffle(deck, rng);
    expect(deck).toHaveLength(52);
  });

  it('contains same cards after shuffle (different order)', () => {
    const rng = makeSeededRNG(42);
    const deck = buildDeck();
    const before = deck.map((c) => c.id).sort();
    shuffle(deck, rng);
    const after = deck.map((c) => c.id).sort();
    expect(after).toEqual(before);
  });

  it('produces deterministic order with same seed', () => {
    const deck1 = buildDeck();
    const deck2 = buildDeck();
    // Reset IDs to same values for determinism test
    // Use identical decks (same cards but with same seed the shuffle order matches)
    shuffle(deck1, makeSeededRNG(99));
    shuffle(deck2, makeSeededRNG(99));
    // IDs differ (randomUUID each time), so compare rank+suit order
    const toCombo = (c: { rank: string; suit: string }) => `${c.rank}${c.suit}`;
    expect(deck1.map(toCombo)).toEqual(deck2.map(toCombo));
  });
});

describe('dealN', () => {
  it('removes n cards from front', () => {
    const deck = buildDeck();
    const hand = dealN(deck, 10);
    expect(hand).toHaveLength(10);
    expect(deck).toHaveLength(42);
  });

  it('returns cards in original order', () => {
    const rng = makeSeededRNG(1);
    const deck = buildShuffledDeck(rng);
    const first = deck[0]!.id;
    const hand = dealN(deck, 1);
    expect(hand[0]?.id).toBe(first);
  });
});

describe('buildShuffledDeck', () => {
  it('produces a deck of 52 unique cards', () => {
    const rng = makeSeededRNG(7);
    const deck = buildShuffledDeck(rng);
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((c) => c.id)).size).toBe(52);
  });
});
