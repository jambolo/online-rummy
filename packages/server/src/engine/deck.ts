import { randomUUID } from 'node:crypto';
import type { Card, Rank, Suit } from '@online-rummy/shared';
import { RANKS } from '@online-rummy/shared';
import type { RNG } from '../rng.js';

const SUITS: Suit[] = ['C', 'D', 'H', 'S'];

export function buildDeck(deckCount = 1): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < deckCount; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ id: randomUUID(), suit, rank });
      }
    }
  }
  return cards;
}

// Fisher-Yates in-place shuffle via provided RNG (server-only)
export function shuffle<T>(arr: T[], rng: RNG): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng(0, i + 1);
    const tmp = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = tmp;
  }
  return arr;
}

export function buildShuffledDeck(rng: RNG, deckCount = 1): Card[] {
  return shuffle(buildDeck(deckCount), rng);
}

// Deal n cards off the front of the deck, mutating it
export function dealN(deck: Card[], n: number): Card[] {
  return deck.splice(0, n);
}
