import type { Card, HouseRules, MeldKind, MeldOptions, PlayerId } from '@online-rummy/shared';
import { RANK_INDEX } from '@online-rummy/shared';
import type { RNG } from '../../rng.js';
import { buildShuffledDeck, dealN } from '../deck.js';
import { cardPoints, validateMeld as coreMeldCheck } from '@online-rummy/shared';
import type { BasicState, GameState, ScoreSheet, VariantEngine, WonHandData } from '../types.js';
import {
  advanceTurn as baseAdvanceTurn,
  buildBaseState,
  detectMeldKind,
  lookupCard,
  makeMeldId,
  requireTurn,
} from '../util.js';
import { formatLayoffError } from '../layoff-error.js';

// rules.md A.1 — Basic Rummy (Rum)
// House rule picks: plan.md "House rule picks (locked) > Basic Rummy"

// rules.md A.1.2: deal counts per player count
const DEAL_COUNTS: Record<number, number> = { 2: 10, 3: 7, 4: 7, 5: 6, 6: 6, 7: 10 };

// rules.md A.1.4: canonical Basic Rummy is ace-low. The aceEitherEnd and
// roundTheCorner house rules widen run validation. roundTheCorner implies
// aceEitherEnd (decision D4) — implemented here; state.houseRules itself is
// never normalized and keeps exactly what the host toggled.
function meldOptsBasic(state: GameState): MeldOptions {
  const rtc = state.houseRules.roundTheCorner === true;
  const aee = rtc || state.houseRules.aceEitherEnd === true;
  return { aceHigh: false, roundTheCorner: rtc, aceEitherEnd: aee };
}

// Narrowing helper: every function here is only ever called on a Basic Rummy state.
function bs(state: GameState): BasicState {
  if (state.variant !== 'basic') throw new Error('ERR_VARIANT_MISMATCH:basic');
  return state.variantState;
}

// Basic clears its per-turn meld tracking on turn end (rules.md A.1.6 step 2 [PG-R]).
function advanceTurn(state: GameState): void {
  baseAdvanceTurn(state);
  bs(state).meldedThisTurn = false;
}

export const basicVariant: VariantEngine = {
  id: 'basic',
  // rules.md A.1.1: 2-7 players (7P requires 2 combined decks per rules.md A.1.1)
  minPlayers: 2,
  maxPlayers: 7,
  // rules.md A.1.4: ace low by default. Ace-either-end and round-the-corner are
  // host-configurable house rules, both currently OFF.
  aceHigh: false,
  roundTheCorner: false,

  deal(playerCount: number, rng: RNG) {
    // rules.md A.1.1: 1 × 52 for 2-6 players, 2 × 52 combined for 7 players.
    const deck = buildShuffledDeck(rng, playerCount === 7 ? 2 : 1);
    const count = DEAL_COUNTS[playerCount];
    if (count === undefined) throw new Error(`ERR_INVALID_PLAYER_COUNT:${playerCount}`);

    const hands: Card[][] = [];
    for (let i = 0; i < playerCount; i++) {
      hands.push(dealN(deck, count));
    }
    // rules.md A.1.2: top card flipped = discard pile start
    const top = deck.shift();
    if (!top) throw new Error('ERR_DECK_EXHAUSTED');
    return { hands, stock: deck, discard: [top] };
  },

  validateMeld(cards: Card[]): boolean {
    // rules.md A.1.5: sets (3-4 same rank) + runs (3+ consecutive same suit), ace low
    return coreMeldCheck(cards, { aceHigh: false, roundTheCorner: false });
  },

  canDrawFromDiscard(state: GameState, _playerId: PlayerId): boolean {
    return state.phase === 'draw' && state.discardPile.length > 0;
  },

  onDrawFromDiscard(state: GameState, _playerId: PlayerId, cardId: string): void {
    // rules.md A.1.6 step 4: record so canDiscard can forbid re-discarding it
    state.drewFromDiscardId = cardId;
  },

  canDiscard(state: GameState, _playerId: PlayerId, cardId: string): boolean {
    // rules.md A.1.6 step 4: cannot discard same card drawn from discard this turn
    return state.drewFromDiscardId !== cardId;
  },

  scoreHand(state: GameState): Map<PlayerId, number> {
    // rules.md A.1.8: A=1, 2-10=pip, JQK=10. Winner earns sum of opponents' unmelded values.
    // rules.md A.1.8 (P1/D1): unmelded ace scores 15 when the aceEitherEnd or
    // roundTheCorner house rule is enabled.
    const aceVal = state.houseRules.aceEitherEnd === true || state.houseRules.roundTheCorner === true ? 15 : 1;
    const unmelded = new Map<PlayerId, number>();
    for (const player of state.players) {
      if (player.status === 'forfeited') continue;
      unmelded.set(
        player.id,
        player.hand.reduce((s, c) => s + cardPoints(c, aceVal), 0),
      );
    }

    const winner = state.players.find((p) => p.hand.length === 0 && p.status === 'active');
    const result = new Map<PlayerId, number>();

    for (const player of state.players) {
      result.set(player.id, 0);
    }

    if (winner) {
      let earned = 0;
      for (const [pid, val] of unmelded) {
        if (pid !== winner.id) earned += val;
      }
      // rules.md A.1.7: going rummy = winner placed no card all hand (no meld, no layoff).
      // meldedBy tracks placer for every card on the table. No entry for winner ⇒ went rummy.
      const wentRummy = ![...state.meldedBy.values()].includes(winner.id);
      // rules.md A.1.7 [PG-R]: goingRummyFlat10 house rule — flat +10 to the winner's
      // normal score instead of doubling each opponent's contribution.
      const rummyScore = state.houseRules.goingRummyFlat10 === true ? earned + 10 : earned * 2;
      result.set(winner.id, wentRummy ? rummyScore : earned);
    }

    return result;
  },

  isGameOver(scoreSheet: ScoreSheet): boolean {
    // rules.md A.1.8 [RRB]: cumulative target = 100 (house rule pick)
    for (const hands of scoreSheet.values()) {
      if (hands.reduce((s, v) => s + v, 0) >= 100) return true;
    }
    return false;
  },

  // ---- Lifecycle / actions (Phase 3 promotion) ----

  createGame: (roomId, players, rng, firstPlayerIndex, houseRules) =>
    createBasicGame(roomId, players, rng, firstPlayerIndex, houseRules),

  applyDraw: (state, playerId, from) => applyDraw(state, playerId, from),
  applyMeld: (state, playerId, cardIds) => ({ handEnded: applyMeld(state, playerId, cardIds) }),
  applyLayoff: (state, playerId, meldId, cardId) => ({ handEnded: applyLayoff(state, playerId, meldId, cardId) }),
  applyDiscard: (state, playerId, cardId) => applyDiscard(state, playerId, cardId),

  // Re-deal: rotate one seat clockwise from the previous hand's first player.
  // Falls back to 0 on first deal or if previous first player has been dropped.
  nextFirstPlayerIndex(oldState, newPlayers) {
    if (oldState === null) return 0;
    const prevIdx = newPlayers.findIndex((p) => p.id === oldState.firstPlayerId);
    if (prevIdx === -1) return 0;
    return (prevIdx + 1) % newPlayers.length;
  },

  // Winner = the active player who emptied their hand. Null mid-hand or after forfeit.
  winnerForHand(state, _scores) {
    return state.players.find((p) => p.hand.length === 0 && p.status === 'active')?.id ?? null;
  },

  // Hand-end payload: per-player final hand, per-card meld credits (basic ace=1),
  // and per-player deadwood (sum of unmelded card values).
  handEndPayload(state, _scores): WonHandData {
    // rules.md A.1.8 (P1/D1): unmelded ace scores 15 when the aceEitherEnd or
    // roundTheCorner house rule is enabled.
    const aceVal = state.houseRules.aceEitherEnd === true || state.houseRules.roundTheCorner === true ? 15 : 1;
    const finalHands: Record<PlayerId, Card[]> = {};
    const meldCredits: Record<PlayerId, { card: Card; pts: number }[]> = {};
    const handDeadwood: Record<PlayerId, number> = {};
    for (const p of state.players) {
      finalHands[p.id] = p.hand;
      meldCredits[p.id] = [];
      handDeadwood[p.id] = p.hand.reduce((s, c) => s + cardPoints(c, aceVal), 0);
    }
    for (const p of state.players) {
      for (const m of p.melds) {
        const meldCards = m.cardIds.map((id) => state.cardRegistry.get(id)).filter((c): c is Card => c !== undefined);
        for (const card of meldCards) {
          const placer = state.meldedBy.get(card.id) ?? p.id;
          (meldCredits[placer] ??= []).push({ card, pts: cardPoints(card, 1) });
        }
      }
    }
    return { finalHands, meldCredits, handDeadwood };
  },
};

// ---- Game state factory ----

export function createBasicGame(
  roomId: string,
  players: Array<{ id: string; name: string }>,
  rng: RNG,
  // When omitted, first player is chosen randomly. Pass an explicit index for re-deals.
  firstPlayerIndex?: number,
  houseRules?: HouseRules,
): GameState & { variant: 'basic' } {
  const deal = basicVariant.deal(players.length, rng);
  return buildBaseState(
    roomId,
    'basic',
    players,
    deal,
    rng,
    'draw',
    { meldedThisTurn: false },
    firstPlayerIndex,
    houseRules,
  ) as GameState & {
    variant: 'basic';
  };
}

// ---- Turn actions ----

// rules.md A.1.6 step 1
export function applyDraw(state: GameState, playerId: PlayerId, from: 'stock' | 'discard'): void {
  requireTurn(state, playerId);
  if (state.phase !== 'draw') throw new Error('ERR_WRONG_PHASE');

  if (from === 'discard') {
    if (!basicVariant.canDrawFromDiscard(state, playerId)) throw new Error('ERR_CANNOT_DRAW_DISCARD');
    const card = state.discardPile.pop()!;
    state.players.find((p) => p.id === playerId)!.hand.push(card);
    basicVariant.onDrawFromDiscard(state, playerId, card.id);
  } else {
    if (state.stock.length === 0) throw new Error('ERR_STOCK_EMPTY');
    const card = state.stock.shift()!;
    state.players.find((p) => p.id === playerId)!.hand.push(card);
  }

  state.phase = 'meld';
}

// rules.md A.1.6 step 2
export function applyMeld(state: GameState, playerId: PlayerId, cardIds: string[]): boolean {
  const player = requireTurn(state, playerId);
  if (state.phase !== 'meld' && state.phase !== 'discard') throw new Error('ERR_WRONG_PHASE');

  // rules.md A.1.6 step 2 [PG-R]: maxOneMeldPerTurn house rule — at most one meld per turn.
  if (state.houseRules.maxOneMeldPerTurn === true && bs(state).meldedThisTurn) {
    throw new Error('ERR_MAX_ONE_MELD');
  }

  const cards = cardIds.map((id) => {
    const c = lookupCard(state, id);
    if (!player.hand.find((h) => h.id === id)) throw new Error(`ERR_CARD_NOT_IN_HAND:${id}`);
    return c;
  });

  if (!coreMeldCheck(cards, meldOptsBasic(state))) throw new Error('ERR_INVALID_MELD');

  player.hand = player.hand.filter((c) => !cardIds.includes(c.id));
  const meld = { id: makeMeldId(), kind: detectMeldKind(cards), cardIds: [...cardIds], ownerId: playerId };
  // Sort runs by rank so display order always matches card sequence.
  if (meld.kind === 'run') {
    meld.cardIds.sort((a, b) => RANK_INDEX[lookupCard(state, a).rank] - RANK_INDEX[lookupCard(state, b).rank]);
  }
  player.melds.push(meld);
  for (const id of cardIds) state.meldedBy.set(id, playerId);
  bs(state).meldedThisTurn = true;

  // rules.md A.1.7: player goes out immediately if hand is now empty.
  if (player.hand.length === 0) {
    state.phase = 'ended';
    return true;
  }

  state.phase = 'meld';
  return false;
}

// rules.md A.1.6 step 3
export function applyLayoff(state: GameState, playerId: PlayerId, meldId: string, cardId: string): boolean {
  const player = requireTurn(state, playerId);
  if (state.phase !== 'meld' && state.phase !== 'discard') throw new Error('ERR_WRONG_PHASE');

  // rules.md A.1.6 step 3 [WP]: layoffRequiresPriorMeld house rule — a player may lay
  // off only after having placed at least one meld of their own.
  if (state.houseRules.layoffRequiresPriorMeld === true && player.melds.length === 0) {
    throw new Error('ERR_LAYOFF_REQUIRES_MELD');
  }

  const card = lookupCard(state, cardId);
  if (!player.hand.find((c) => c.id === cardId)) throw new Error(`ERR_CARD_NOT_IN_HAND:${cardId}`);

  // Find target meld
  let targetMeld: { id: string; kind: MeldKind; cardIds: string[]; ownerId: string } | undefined;
  for (const p of state.players) {
    targetMeld = p.melds.find((m) => m.id === meldId);
    if (targetMeld) break;
  }
  if (!targetMeld) throw new Error('ERR_MELD_NOT_FOUND');

  // Validate extended meld — build a descriptive message when invalid
  const existingCards = targetMeld.cardIds.map((id) => lookupCard(state, id));
  if (!coreMeldCheck([...existingCards, card], meldOptsBasic(state))) {
    throw new Error(formatLayoffError(targetMeld, existingCards, card));
  }

  player.hand = player.hand.filter((c) => c.id !== cardId);
  targetMeld.cardIds.push(cardId);
  state.meldedBy.set(cardId, playerId);
  // Sort runs by rank so the display order matches card sequence.
  if (targetMeld.kind === 'run') {
    targetMeld.cardIds.sort((a, b) => {
      const ca = lookupCard(state, a);
      const cb = lookupCard(state, b);
      return RANK_INDEX[ca.rank] - RANK_INDEX[cb.rank];
    });
  }

  // rules.md A.1.7: player goes out immediately if hand is now empty.
  if (player.hand.length === 0) {
    state.phase = 'ended';
    return true;
  }

  return false;
}

// rules.md A.1.6 step 4
export function applyDiscard(state: GameState, playerId: PlayerId, cardId: string): { handEnded: boolean } {
  const player = requireTurn(state, playerId);
  if (state.phase !== 'discard' && state.phase !== 'meld') throw new Error('ERR_WRONG_PHASE');

  if (!basicVariant.canDiscard(state, playerId, cardId)) {
    throw new Error('ERR_CANNOT_DISCARD_DRAWN_CARD');
  }

  const card = lookupCard(state, cardId);
  if (!player.hand.find((c) => c.id === cardId)) throw new Error(`ERR_CARD_NOT_IN_HAND:${cardId}`);

  player.hand = player.hand.filter((c) => c.id !== cardId);
  state.discardPile.push(card);

  if (player.hand.length === 0) {
    state.phase = 'ended';
    return { handEnded: true };
  }

  advanceTurn(state);
  return { handEnded: false };
}
