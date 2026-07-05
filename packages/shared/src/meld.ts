// Meld validation + card scoring.
//
// Lives in @online-rummy/shared so both server (engine) and client (UI hint code)
// use the same rules. Previously duplicated as engine/meld.ts (server) plus
// hand-written mirrors in ActionBar/MeldZone/Table (client).

import type { Card, Rank } from './cards.js';
import { RANK_INDEX } from './cards.js';

export type MeldOptions = {
  aceHigh: boolean;
  roundTheCorner: boolean;
  // 500 Rummy (rules.md A.4.3): a run may use A-2-3 OR Q-K-A, but not both at once.
  // Tries both ace positions and accepts if either yields a valid run.
  aceEitherEnd?: boolean;
  // rules.md A.4.3 [PG-5] house rule: every card in a set must be a different suit.
  setsRequireDistinctSuits?: boolean;
};

// Validates a proposed meld (set or run). Returns true if valid.
// rules.md A.1.5
export function validateMeld(cards: Card[], opts: MeldOptions): boolean {
  if (cards.length < 3) return false;
  return isSet(cards, opts) || isRun(cards, opts);
}

// Set: 3-4 cards of same rank. rules.md A.1.5
function isSet(cards: Card[], opts: MeldOptions): boolean {
  if (cards.length < 3 || cards.length > 4) return false;
  const rank = cards[0]?.rank;
  if (!cards.every((c) => c.rank === rank)) return false;
  if (opts.setsRequireDistinctSuits === true && new Set(cards.map((c) => c.suit)).size !== cards.length) {
    return false; // rules.md A.4.3 [PG-5]
  }
  return true;
}

// Run: 3+ consecutive same-suit. rules.md A.1.5
function isRun(cards: Card[], opts: MeldOptions): boolean {
  if (cards.length < 3) return false;
  // rules.md A.1.4 round-the-corner house rule: ace wraps the deck; any circularly
  // consecutive same-suit sequence is a run (subsumes ace-either-end).
  if (opts.roundTheCorner) return isCircularRun(cards);
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

function isCircularRun(cards: Card[]): boolean {
  const suit = cards[0]?.suit;
  if (!cards.every((c) => c.suit === suit)) return false;
  const indices = cards.map((c) => RANK_INDEX[c.rank]).sort((a, b) => a - b);
  let breaks = 0;
  for (let i = 1; i < indices.length; i++) {
    const gap = (indices[i] as number) - (indices[i - 1] as number);
    if (gap === 0) return false; // duplicate rank never forms a run
    if (gap !== 1) breaks++;
  }
  if (breaks === 0) return true;
  if (breaks > 1) return false;
  // exactly one internal gap: valid only when the sequence wraps K -> A
  return (indices[0] as number) + 13 - (indices[indices.length - 1] as number) === 1;
}

export type CardPointsOptions = { low5Scoring?: boolean };

// Card point value for scoring unmelded cards. rules.md A.1.8
// aceValue: 1 (basic), 11 (basic ace-high variant), 15 (500 Rummy).
export function cardPoints(card: Card, aceValue: 1 | 11 | 15 = 1, opts: CardPointsOptions = {}): number {
  const r = card.rank;
  if (r === 'A') return aceValue;
  if (r === 'J' || r === 'Q' || r === 'K') return 10;
  // rules.md A.4.2 low-5 house rule: 2-9 score 5 (10 stays 10; aces handled above).
  if (opts.low5Scoring === true && r !== '10') return 5;
  return parseInt(r, 10);
}

// Direction the ace plays in a 500 Rummy run. Returns null for runs without ace
// and for sets. rules.md A.4.2: A=1 when in A-2-3 sequence, otherwise 15.
export function runAceDirection(cards: Card[]): 'low' | 'high' | null {
  if (!cards.some((c) => c.rank === 'A')) return null;
  if (cards.some((c) => c.rank === '2')) return 'low';
  if (cards.some((c) => c.rank === 'K')) return 'high';
  return null;
}

export type Score500Options = { acesAlways15?: boolean; low5Scoring?: boolean };

// 500 Rummy per-card meld scoring (rules.md A.4.2, A.4.7).
// Set: each card at base value, aces 15. Run: ace 1 if A-2-3, else 15.
// House rules (rules.md A.4.2): acesAlways15 overrides the A-2-3 ace to 15;
// low5Scoring scores 2-9 at 5 and an A-2-3 ace at 5. When both are enabled,
// acesAlways15 governs aces and low5Scoring still applies to 2-9 (decision D2).
export function score500MeldCard(card: Card, allCards: Card[], opts: Score500Options = {}): number {
  const allSameRank = allCards.every((c) => c.rank === allCards[0]?.rank);
  if (card.rank === 'A') {
    if (allSameRank) return 15;
    if (runAceDirection(allCards) !== 'low') return 15;
    if (opts.acesAlways15 === true) return 15;
    return opts.low5Scoring === true ? 5 : 1;
  }
  return cardPoints(card, 15, { low5Scoring: opts.low5Scoring === true });
}
