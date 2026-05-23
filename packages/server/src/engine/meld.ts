import type { Card, Rank } from '@online-rummy/shared';
import { RANK_INDEX } from '@online-rummy/shared';

export type MeldOptions = {
  aceHigh: boolean;
  roundTheCorner: boolean;
  // 500 Rum (rules.md A.4.3): a run may use A-2-3 OR Q-K-A, but not both at once.
  // Tries both ace positions and accepts if either yields a valid run.
  aceEitherEnd?: boolean;
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
  if (opts.aceEitherEnd) {
    return isRunFixedAce(cards, false) || isRunFixedAce(cards, true);
  }
  return isRunFixedAce(cards, opts.aceHigh);
}

function isRunFixedAce(cards: Card[], aceHigh: boolean): boolean {
  const suit = cards[0]?.suit;
  if (!cards.every((c) => c.suit === suit)) return false;

  const indices = cards.map((c) => rankIndex(c.rank, aceHigh));
  indices.sort((a, b) => a - b);
  for (let i = 1; i < indices.length; i++) {
    if ((indices[i] as number) - (indices[i - 1] as number) !== 1) return false;
  }
  return true;
}

function rankIndex(rank: Rank, aceHigh: boolean): number {
  if (rank === 'A' && aceHigh) return 13;
  return RANK_INDEX[rank];
}

// Card point value for scoring unmelded cards. rules.md A.1.8
// aceValue: 1 (basic), 11 (basic ace-high variant), 15 (500 Rum).
export function cardPoints(card: Card, aceValue: 1 | 11 | 15 = 1): number {
  const r = card.rank;
  if (r === 'A') return aceValue;
  if (r === 'J' || r === 'Q' || r === 'K') return 10;
  return parseInt(r, 10);
}

// Direction the ace plays in a run. Returns null for runs without ace and for sets.
// rules.md A.4.2: A=1 when in A-2-3 sequence, otherwise 15.
export function runAceDirection(cards: Card[]): 'low' | 'high' | null {
  if (!cards.some((c) => c.rank === 'A')) return null;
  if (cards.some((c) => c.rank === '2')) return 'low';
  if (cards.some((c) => c.rank === 'K')) return 'high';
  return null;
}

// 500 Rum per-card meld scoring (rules.md A.4.2, A.4.7).
// Set: each card scored at base value, aces 15.
// Run: aces 1 if A-2-3 run, else 15.
export function score500MeldCard(card: Card, allCards: Card[]): number {
  const allSameRank = allCards.every((c) => c.rank === allCards[0]?.rank);
  if (allSameRank) return cardPoints(card, 15);
  const ace = runAceDirection(allCards);
  return cardPoints(card, ace === 'low' ? 1 : 15);
}
