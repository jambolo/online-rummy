// Shared formatter for ERR_INVALID_LAYOFF messages.
//
// Returns the human-readable string the engine throws when a card cannot legally
// extend a target meld. Format is intentionally specific (suit, rank range, end)
// so the client can surface meaningful feedback to the user without engine knowledge.

import type { Card, Meld, Rank } from '@online-rummy/shared';
import { RANKS, RANK_INDEX } from '@online-rummy/shared';

const SUIT_GLYPH: Record<string, string> = { C: '♣', D: '♦', H: '♥', S: '♠' };

function glyph(s: string): string {
  return SUIT_GLYPH[s] ?? s;
}

// Caller already attempted validateMeld([...existingCards, incoming]) and it failed.
// This function returns the descriptive ERR_INVALID_LAYOFF message; caller throws it.
export function formatLayoffError(targetMeld: Pick<Meld, 'kind'>, existingCards: Card[], incoming: Card): string {
  if (targetMeld.kind === 'set') {
    const setRank: Rank | '?' = existingCards[0]?.rank ?? '?';
    if (incoming.rank !== setRank) {
      return `ERR_INVALID_LAYOFF: Set contains ${setRank}s — ${incoming.rank} doesn't match`;
    }
    return 'ERR_INVALID_LAYOFF: Set is already full (4 cards)';
  }

  // run
  const runSuit = existingCards[0]?.suit ?? '?';
  if (incoming.suit !== runSuit) {
    return `ERR_INVALID_LAYOFF: Card suit (${glyph(incoming.suit)}) doesn't match run suit (${glyph(runSuit)})`;
  }
  const indices = existingCards.map((c) => RANK_INDEX[c.rank]);
  const lo = Math.min(...indices);
  const hi = Math.max(...indices);
  const loRank = RANKS[lo] ?? '?';
  const hiRank = RANKS[hi] ?? '?';
  return (
    `ERR_INVALID_LAYOFF: Run is ${glyph(runSuit)}${loRank}–${hiRank}; ` +
    `${incoming.rank} must go at ${loRank === 'A' ? 'the high end' : 'the low end'} or ` +
    `${hiRank === 'K' ? 'the low end' : 'the high end'}`
  );
}
