// Generic scoring primitives used by knock-style variants.
//
// `deadwood` sums unmelded card values for a player. `validateKnockMelds` walks
// a list of declared meld groups, enforcing no-overlap + in-hand membership +
// per-group validity. Used by Gin today; reusable for Knock Rummy (rules.md
// A.3, deferred).

import type { Card, MeldKind, PlayerId } from '@online-rummy/shared';
import { cardPoints } from '@online-rummy/shared';
import type { GamePlayer, GameState } from './types.js';
import { lookupCard } from './util.js';

// Sum of unmelded card values in the player's hand.
// rules.md A.2: A=1 (gin). rules.md A.3.2: A=1 (knock rummy). Pass aceValue for variant.
export function deadwood(player: GamePlayer, aceValue: 1 | 11 | 15 = 1): number {
  return player.hand.reduce((s, c) => s + cardPoints(c, aceValue), 0);
}

// Validate a list of declared meld groups against the player's hand.
//
// Throws on first failure:
//   ERR_CARD_IN_MULTIPLE_MELDS:<id>   — card appears in two groups
//   ERR_CARD_NOT_IN_HAND:<id>         — card not in player's hand
//   ERR_INVALID_MELD                  — group fails variant.validateMeld
//
// Returns the validated groups (with detected kind) + the union of melded card ids,
// so the caller can apply them to state and reject downstream actions on those cards.
export function validateKnockMelds(
  state: GameState,
  player: GamePlayer,
  meldGroups: string[][] | undefined,
  validate: (cards: Card[]) => boolean,
): { validated: { kind: MeldKind; cardIds: string[] }[]; meldedIds: Set<string> } {
  const meldedIds = new Set<string>();
  const validated: { kind: MeldKind; cardIds: string[] }[] = [];
  for (const group of meldGroups ?? []) {
    const cards: Card[] = [];
    for (const id of group) {
      if (meldedIds.has(id)) throw new Error(`ERR_CARD_IN_MULTIPLE_MELDS:${id}`);
      if (!player.hand.find((c) => c.id === id)) throw new Error(`ERR_CARD_NOT_IN_HAND:${id}`);
      cards.push(lookupCard(state, id));
    }
    if (!validate(cards)) throw new Error('ERR_INVALID_MELD');
    for (const id of group) meldedIds.add(id);
    const kind: MeldKind = cards.every((c) => c.rank === cards[0]!.rank) ? 'set' : 'run';
    validated.push({ kind, cardIds: [...group] });
  }
  return { validated, meldedIds };
}

// Convenience: PlayerId re-export so callers don't need to import types twice.
export type { PlayerId };
