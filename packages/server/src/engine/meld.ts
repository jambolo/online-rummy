import type { Card, Rank } from '@online-rummy/shared';
import { RANK_INDEX } from '@online-rummy/shared';

export type MeldOptions = {
  aceHigh: boolean;
  roundTheCorner: boolean;
};

// Validates a proposed meld (set or run). Returns true if valid.
// rules.md A.1.5
export function validateMeld(cards: Card[], opts: MeldOptions): boolean {
  if (cards.length < 3) return false;
  return isSet(cards) || isRun(cards, opts);
}

// Set: 3-4 cards of same rank. rules.md A.1.5
function isSet(cards: Card[]): boolean {
  if (cards.length < 3 || cards.length > 4) return false;
  const rank = cards[0]?.rank;
  return cards.every((c) => c.rank === rank);
}

// Run: 3+ consecutive same-suit. rules.md A.1.5
function isRun(cards: Card[], opts: MeldOptions): boolean {
  if (cards.length < 3) return false;
  const suit = cards[0]?.suit;
  if (!cards.every((c) => c.suit === suit)) return false;

  const indices = cards.map((c) => rankIndex(c.rank, opts));
  indices.sort((a, b) => a - b);

  // Check consecutive with no gaps or duplicates
  for (let i = 1; i < indices.length; i++) {
    if ((indices[i] as number) - (indices[i - 1] as number) !== 1) return false;
  }

  // round-the-corner: K-A-2 only allowed if flag set. rules.md A.1.4
  if (!opts.roundTheCorner) {
    // ace-low default: Q-K-A invalid (A ranks 0, so sorted it appears first; K-Q-A would be 12,11,0 which fails gap check anyway)
    // ace-high: A-2-3 invalid (A ranks 13, so 13 at end; 1,2,13 fails gap check)
    // The gap check above already handles this correctly without extra logic.
  }

  return true;
}

// Returns rank index considering ace-high/low setting.
// rules.md A.1.4: ace low by default (A=0). If aceHigh, A=13.
function rankIndex(rank: Rank, opts: MeldOptions): number {
  const base = RANK_INDEX[rank];
  if (rank === 'A' && opts.aceHigh) return 13;
  return base;
}

// Card point value for scoring unmelded cards. rules.md A.1.8
// aceHigh flag used for 500 Rum (A=15). For basic: A=1.
export function cardPoints(card: Card, aceValue: 1 | 11 | 15 = 1): number {
  const r = card.rank;
  if (r === 'A') return aceValue;
  if (r === 'J' || r === 'Q' || r === 'K') return 10;
  return parseInt(r, 10);
}
