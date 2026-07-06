import type { Card, HouseRules, MeldKind, MeldOptions, PlayerId, Score500Options } from '@online-rummy/shared';
import { RANK_INDEX } from '@online-rummy/shared';
import type { RNG } from '../../rng.js';
import { buildShuffledDeck, dealN } from '../deck.js';
import { cardPoints, validateMeld as coreMeldCheck, runAceDirection, score500MeldCard } from '@online-rummy/shared';
import type { GameState, Rum500State, ScoreSheet, VariantEngine, WonHandData } from '../types.js';
import { advanceTurn as baseAdvanceTurn, buildBaseState, detectMeldKind, lookupCard, makeMeldId, requireTurn } from '../util.js';
import { formatLayoffError } from '../layoff-error.js';

// Narrowing helper: every function here is only ever called on a 500 Rummy state.
// Throws on misuse to keep TS happy + catch dispatch bugs early.
function r500(state: GameState): Rum500State {
  if (state.variant !== 'rum500') throw new Error('ERR_VARIANT_MISMATCH:rum500');
  return state.variantState;
}

// rules.md A.4.3: configured meld options for this game. aceEitherEnd is canonical
// 500 Rummy; setsRequireDistinctSuits is the [PG-5] house rule.
function meldOpts500(state: GameState): MeldOptions {
  return {
    aceHigh: false,
    roundTheCorner: false,
    aceEitherEnd: true,
    setsRequireDistinctSuits: state.houseRules.setsRequireDistinctSuits === true,
  };
}

// rules.md A.4.2: configured meld-scoring options (acesAlways15 [RP], low5Scoring).
function score500Opts(state: GameState): Score500Options {
  return {
    acesAlways15: state.houseRules.acesAlways15 === true,
    low5Scoring: state.houseRules.low5Scoring === true,
  };
}

// 500-Rum-specific scoring helpers (runAceDirection, score500MeldCard) now live in
// @online-rummy/shared so the client can compute interim meld scores with identical
// rules. Re-exported here to preserve existing server-side import paths.
export { runAceDirection, score500MeldCard };

// rules.md A.4 — 500 Rummy (a.k.a. Pinochle Rummy)
// House rule picks: plan.md "House rule picks (locked) > 500 Rummy"

// rules.md A.4.1: 2P deals 13; 3+P deals 7.
function dealCount(playerCount: number): number {
  if (playerCount < 2) throw new Error(`ERR_INVALID_PLAYER_COUNT:${playerCount}`);
  return playerCount === 2 ? 13 : 7;
}

// rules.md A.4.1: 1 deck ≤4P, 2 decks ≥5P (no jokers per locked picks).
function deckCount(playerCount: number): number {
  return playerCount <= 4 ? 1 : 2;
}

// rules.md A.4.1: 2P deals 13 (10 under the deal10For2P house rule [PR]); 3+P deals 7.
function dealRum500(playerCount: number, rng: RNG, houseRules: HouseRules): { hands: Card[][]; stock: Card[]; discard: Card[] } {
  const decks = deckCount(playerCount);
  const deck = buildShuffledDeck(rng, decks);
  const base = dealCount(playerCount);
  const count = playerCount === 2 && houseRules.deal10For2P === true ? 10 : base;

  const hands: Card[][] = [];
  for (let i = 0; i < playerCount; i++) {
    hands.push(dealN(deck, count));
  }
  const top = deck.shift();
  if (!top) throw new Error('ERR_DECK_EXHAUSTED');
  return { hands, stock: deck, discard: [top] };
}

export const rum500Variant: VariantEngine = {
  id: 'rum500',
  // rules.md A.4.1: 2-8 players.
  minPlayers: 2,
  maxPlayers: 8,
  // rules.md A.4.3: aces may play high OR low (not both) — see aceEitherEnd in validateMeld.
  aceHigh: true,
  roundTheCorner: false,

  deal(playerCount: number, rng: RNG) {
    // Interface member stays canonical (no houseRules param) — createRum500Game calls
    // dealRum500 directly so the deal10For2P house rule can be honored.
    return dealRum500(playerCount, rng, {});
  },

  validateMeld(cards: Card[]): boolean {
    // rules.md A.4.3: set (3-4 same rank, same-suit OK per locked pick) or run (3+ same suit
    // sequential). No round-the-corner. Aces play at either end (A-2-3 OR Q-K-A).
    return coreMeldCheck(cards, {
      aceHigh: false,
      roundTheCorner: false,
      aceEitherEnd: true,
    });
  },

  canDrawFromDiscard(state: GameState, _playerId: PlayerId, cardId?: string): boolean {
    if (state.phase !== 'draw' || state.discardPile.length === 0) return false;
    if (cardId === undefined) return true;
    return state.discardPile.some((c) => c.id === cardId);
  },

  onDrawFromDiscard(state: GameState, _playerId: PlayerId, cardId: string): void {
    // rules.md A.4.4: simple top-card draw — cannot re-discard same turn.
    state.drewFromDiscardId = cardId;
  },

  canDiscard(state: GameState, _playerId: PlayerId, cardId: string): boolean {
    // rules.md A.4.4: pile dive obligation unmet → no discard allowed.
    if (r500(state).mustMeldCardId !== null) return false;
    // rules.md A.4.4: simple top-discard draw → cannot re-discard that card same turn.
    return state.drewFromDiscardId !== cardId;
  },

  scoreHand(state: GameState): Map<PlayerId, number> {
    // rules.md A.4.7: net = melded value − cards remaining in hand.
    // Ace value per card in meld depends on context (rules.md A.4.2).
    const result = new Map<PlayerId, number>();
    for (const p of state.players) result.set(p.id, 0);

    // Tally meld credit per player (whoever placed the card).
    for (const p of state.players) {
      if (p.status === 'forfeited') continue;
      for (const meld of p.melds) {
        const meldCards = meld.cardIds.map((id) => state.cardRegistry.get(id)).filter((c): c is Card => c !== undefined);
        for (const c of meldCards) {
          const placer = state.meldedBy.get(c.id) ?? p.id;
          result.set(placer, (result.get(placer) ?? 0) + score500MeldCard(c, meldCards, score500Opts(state)));
        }
      }
    }

    // Subtract hand value (aces in hand = 15 — rules.md A.4.2, [RP] locked pick simplification).
    // rules.md A.4.2: hand aces stay 15; low5Scoring scores 2-9 in hand at 5.
    for (const p of state.players) {
      if (p.status === 'forfeited') continue;
      const handVal = p.hand.reduce((s, c) => s + cardPoints(c, 15, { low5Scoring: state.houseRules.low5Scoring === true }), 0);
      result.set(p.id, (result.get(p.id) ?? 0) - handVal);
    }

    return result;
  },

  isGameOver(scoreSheet: ScoreSheet): boolean {
    // rules.md A.4.7: cumulative ≥ 500. Highest at crossover wins (resolved by ws layer).
    for (const hands of scoreSheet.values()) {
      if (hands.reduce((s, v) => s + v, 0) >= 500) return true;
    }
    return false;
  },

  // ---- Lifecycle / actions (Phase 3 promotion) ----

  createGame: (roomId, players, rng, firstPlayerIndex, houseRules) =>
    createRum500Game(roomId, players, rng, firstPlayerIndex, houseRules),

  applyDraw: (state, playerId, from) => applyDraw(state, playerId, from),
  applyMeld: (state, playerId, cardIds) => {
    applyMeld(state, playerId, cardIds);
    return { handEnded: false };
  },
  applyLayoff: (state, playerId, meldId, cardId) => {
    applyLayoff(state, playerId, meldId, cardId);
    return { handEnded: false };
  },
  applyDiscard: (state, playerId, cardId) => applyDiscard(state, playerId, cardId),
  applyDrawFromPile: (state, playerId, cardId) => applyDrawFromPile(state, playerId, cardId),

  // Re-deal: clockwise rotation from previous first player. Same as basic.
  nextFirstPlayerIndex(oldState, newPlayers) {
    if (oldState === null) return 0;
    const prevIdx = newPlayers.findIndex((p) => p.id === oldState.firstPlayerId);
    if (prevIdx === -1) return 0;
    return (prevIdx + 1) % newPlayers.length;
  },

  // Winner = the active player who emptied their hand.
  winnerForHand(state, _scores) {
    return state.players.find((p) => p.hand.length === 0 && p.status === 'active')?.id ?? null;
  },

  // Hand-end payload: per-card meld credit uses score500MeldCard (ace=1 in A-2-3, else 15).
  // handDeadwood uses ace=15 (rules.md A.4.2 locked simplification).
  handEndPayload(state, _scores): WonHandData {
    const finalHands: Record<PlayerId, Card[]> = {};
    const meldCredits: Record<PlayerId, { card: Card; pts: number }[]> = {};
    const handDeadwood: Record<PlayerId, number> = {};
    for (const p of state.players) {
      finalHands[p.id] = p.hand;
      meldCredits[p.id] = [];
      // rules.md A.4.2: hand aces stay 15; low5Scoring scores 2-9 in hand at 5.
      handDeadwood[p.id] = p.hand.reduce(
        (s, c) => s + cardPoints(c, 15, { low5Scoring: state.houseRules.low5Scoring === true }),
        0,
      );
    }
    for (const p of state.players) {
      for (const m of p.melds) {
        const meldCards = m.cardIds.map((id) => state.cardRegistry.get(id)).filter((c): c is Card => c !== undefined);
        for (const card of meldCards) {
          const placer = state.meldedBy.get(card.id) ?? p.id;
          (meldCredits[placer] ??= []).push({ card, pts: score500MeldCard(card, meldCards, score500Opts(state)) });
        }
      }
    }
    return { finalHands, meldCredits, handDeadwood };
  },
};

// ---- Game state factory ----

export function createRum500Game(
  roomId: string,
  players: Array<{ id: string; name: string }>,
  rng: RNG,
  firstPlayerIndex?: number,
  houseRules?: HouseRules,
): GameState & { variant: 'rum500' } {
  const deal = dealRum500(players.length, rng, houseRules ?? {});
  return buildBaseState(
    roomId,
    'rum500',
    players,
    deal,
    rng,
    'draw',
    { mustMeldCardId: null },
    firstPlayerIndex,
    houseRules,
  ) as GameState & {
    variant: 'rum500';
  };
}

// ---- Turn actions ----

// rules.md A.4.3: aces play at either end (A-2-3 OR Q-K-A). For display, sort runs so
// the ace sits at the correct end of its sequence — RANK_INDEX alone (A=0) misorders
// Q-K-A as A-J-Q-K.
function sortRunCardIds(state: GameState, cardIds: string[]): void {
  const cards = cardIds.map((id) => lookupCard(state, id));
  const aceHigh = runAceDirection(cards) === 'high';
  const idxOf = (c: Card) => (c.rank === 'A' && aceHigh ? 13 : RANK_INDEX[c.rank]);
  cardIds.sort((a, b) => idxOf(lookupCard(state, a)) - idxOf(lookupCard(state, b)));
}

// rules.md A.4.4: drawing from stock or single top-discard card.
// For pile dive (draw from below the top), use applyDrawFromPile.
export function applyDraw(state: GameState, playerId: PlayerId, from: 'stock' | 'discard'): void {
  requireTurn(state, playerId);
  if (state.phase !== 'draw') throw new Error('ERR_WRONG_PHASE');
  if (from === 'discard') {
    const top = state.discardPile[state.discardPile.length - 1];
    if (!top) throw new Error('ERR_DISCARD_EMPTY');
    const player = state.players.find((p) => p.id === playerId)!;
    const unified = state.houseRules.unifiedObligation === true;
    // rules.md A.4.4 unifiedObligation house rule: a top-card draw is must-use, so
    // refuse it when unsatisfiable (mirrors the pile-dive preflight — otherwise the
    // obligation would soft-lock the hand).
    if (unified && !canUseSelectedInMeldOrLayoff(state, [...player.hand, top], top)) {
      throw new Error('ERR_NO_LEGAL_DIVE');
    }
    state.discardPile.pop();
    player.hand.push(top);
    // rules.md A.4.4: drawn top card cannot be re-discarded same turn.
    state.drewFromDiscardId = top.id;
    // rules.md A.4.4 unifiedObligation: must-use also applies (both fields simultaneously).
    if (unified) r500(state).mustMeldCardId = top.id;
  } else {
    if (state.stock.length === 0) throw new Error('ERR_STOCK_EMPTY');
    const card = state.stock.shift()!;
    state.players.find((p) => p.id === playerId)!.hand.push(card);
  }
  state.phase = 'meld';
}

// rules.md A.4.4: pile dive — take selected card + everything above it, must use selected card.
// If the selected card IS the top card, this degrades to a plain top-card draw — no must-use
// obligation UNLESS the unifiedObligation house rule is enabled, in which case a top-card pick
// is must-use too (see mustUse below). "Pile dive" itself is always must-use regardless of flag.
export function applyDrawFromPile(state: GameState, playerId: PlayerId, cardId: string): { taken: Card[] } {
  requireTurn(state, playerId);
  if (state.phase !== 'draw') throw new Error('ERR_WRONG_PHASE');
  const idx = state.discardPile.findIndex((c) => c.id === cardId);
  if (idx === -1) throw new Error(`ERR_CARD_NOT_IN_PILE:${cardId}`);

  const isTopOnly = idx === state.discardPile.length - 1;
  const player = state.players.find((p) => p.id === playerId)!;
  const selected = lookupCard(state, cardId);

  // rules.md A.4.4: a true pile dive is always must-use; under the unifiedObligation
  // house rule a top-card pick is too. Preflight any must-use draw so the obligation
  // is never unsatisfiable.
  const mustUse = !isTopOnly || state.houseRules.unifiedObligation === true;
  if (mustUse) {
    const wouldTake = state.discardPile.slice(idx);
    if (!canUseSelectedInMeldOrLayoff(state, [...player.hand, ...wouldTake], selected)) {
      throw new Error('ERR_NO_LEGAL_DIVE');
    }
  }

  const taken = state.discardPile.splice(idx);
  player.hand.push(...taken);
  if (isTopOnly) {
    // rules.md A.4.4 simple top-card draw: cannot re-discard same turn.
    state.drewFromDiscardId = cardId;
  }
  if (mustUse) {
    r500(state).mustMeldCardId = cardId;
  }
  state.phase = 'meld';
  return { taken };
}

// Pile-dive preflight (rules.md A.4.4): selected card must have at least one legal
// placement — either as part of a fresh meld with the resulting hand, or as a layoff
// onto any existing meld in play. Used by applyDrawFromPile and exposed for the client
// modal to gray out unusable cards.
export function canUseSelectedInMeldOrLayoff(state: GameState, available: Card[], selected: Card): boolean {
  const others = available.filter((c) => c.id !== selected.id);
  for (const p of state.players) {
    for (const m of p.melds) {
      const meldCards = m.cardIds.map((id) => state.cardRegistry.get(id)).filter((c): c is Card => c !== undefined);
      // Direct layoff onto this meld (set 4th card, or run end-extension).
      if (coreMeldCheck([...meldCards, selected], meldOpts500(state))) return true;
      // Chained run layoff (rules.md A.4.6): bridge from this run to the selected card
      // using other available same-suit cards as intermediate layoffs. Sets never bridge.
      if (m.kind === 'run' && canBridgeRunToSelected(meldCards, others, selected)) return true;
    }
  }
  const sameRank = others.filter((c) => c.rank === selected.rank);
  if (state.houseRules.setsRequireDistinctSuits === true) {
    // rules.md A.4.3 [PG-5]: preflight mirrors the distinct-suit set rule so a
    // must-use obligation is never unsatisfiable.
    const suits = new Set(sameRank.filter((c) => c.suit !== selected.suit).map((c) => c.suit));
    if (suits.size >= 2) return true;
  } else if (sameRank.length >= 2) {
    return true;
  }
  return canFormRunWith(others, selected);
}

// Chained run layoff reachability (rules.md A.4.6). Layoffs are monotonic — each valid
// extension grows the run's rank interval by one at an end and never blocks another — so a
// greedy fixpoint reaches the maximal interval coverable by the bridge pool, order-independent.
// O(pool²) per run; no combinatorial search. Each run is tested with its own full copy of the
// pool (cross-meld chaining is impossible: bridge cards are independently available).
function canBridgeRunToSelected(meldCards: Card[], bridgePool: Card[], selected: Card): boolean {
  const run = [...meldCards];
  const pool = bridgePool.filter((c) => c.suit === selected.suit && c.id !== selected.id);
  for (;;) {
    if (rum500Variant.validateMeld([...run, selected])) return true;
    const i = pool.findIndex((c) => rum500Variant.validateMeld([...run, c]));
    if (i === -1) return false;
    run.push(pool[i]!);
    pool.splice(i, 1);
  }
}

function canFormRunWith(others: Card[], selected: Card): boolean {
  const sameSuit = others.filter((c) => c.suit === selected.suit);
  // 500 Rummy ace-either-end: try ace=low and ace=high independently.
  for (const aceHigh of [false, true]) {
    const idxOf = (c: Card) => (c.rank === 'A' ? (aceHigh ? 13 : 0) : RANK_INDEX[c.rank]);
    const target = idxOf(selected);
    const have = new Set(sameSuit.map(idxOf));
    have.add(target);
    for (let start = target - 2; start <= target; start++) {
      if (start < 0 || start + 2 > 13) continue;
      if (have.has(start) && have.has(start + 1) && have.has(start + 2)) return true;
    }
  }
  return false;
}

// rules.md A.4.3: set or run; multiple melds per turn allowed (rules silent → permit).
export function applyMeld(state: GameState, playerId: PlayerId, cardIds: string[]): void {
  const player = requireTurn(state, playerId);
  if (state.phase !== 'meld' && state.phase !== 'discard') {
    throw new Error('ERR_WRONG_PHASE');
  }

  const cards = cardIds.map((id) => {
    const c = lookupCard(state, id);
    if (!player.hand.find((h) => h.id === id)) throw new Error(`ERR_CARD_NOT_IN_HAND:${id}`);
    return c;
  });

  if (!coreMeldCheck(cards, meldOpts500(state))) throw new Error('ERR_INVALID_MELD');

  // rules.md A.4.8: 500 Rummy player cannot play their last card — must retain one to
  // discard. (House rule "Last card may be played" would lift this; not scaffolded.)
  if (cardIds.length >= player.hand.length) throw new Error('ERR_CANNOT_PLAY_LAST_CARD');

  player.hand = player.hand.filter((c) => !cardIds.includes(c.id));
  const meld = {
    id: makeMeldId(),
    kind: detectMeldKind(cards),
    cardIds: [...cardIds],
    ownerId: playerId,
  };
  if (meld.kind === 'run') {
    sortRunCardIds(state, meld.cardIds);
  }
  player.melds.push(meld);
  for (const id of cardIds) state.meldedBy.set(id, playerId);

  // Clear must-meld obligation if satisfied by this meld.
  const vs = r500(state);
  if (vs.mustMeldCardId !== null && cardIds.includes(vs.mustMeldCardId)) {
    vs.mustMeldCardId = null;
  }

  // Multiple melds + layoffs allowed per turn — stay in meld phase until player discards.
  state.phase = 'meld';
}

// rules.md A.4.6: laying off onto any player's meld; cards credit the layoff player.
export function applyLayoff(state: GameState, playerId: PlayerId, meldId: string, cardId: string): void {
  const player = requireTurn(state, playerId);
  if (state.phase !== 'meld' && state.phase !== 'discard') {
    throw new Error('ERR_WRONG_PHASE');
  }

  const card = lookupCard(state, cardId);
  if (!player.hand.find((c) => c.id === cardId)) {
    throw new Error(`ERR_CARD_NOT_IN_HAND:${cardId}`);
  }

  // rules.md A.4.8: 500 Rummy player cannot play their last card — must retain one to
  // discard. (House rule "Last card may be played" would lift this; not scaffolded.)
  if (player.hand.length <= 1) throw new Error('ERR_CANNOT_PLAY_LAST_CARD');

  let targetMeld: { id: string; kind: MeldKind; cardIds: string[]; ownerId: string } | undefined;
  for (const p of state.players) {
    targetMeld = p.melds.find((m) => m.id === meldId);
    if (targetMeld) break;
  }
  if (!targetMeld) throw new Error('ERR_MELD_NOT_FOUND');

  const existingCards = targetMeld.cardIds.map((id) => lookupCard(state, id));
  if (!coreMeldCheck([...existingCards, card], meldOpts500(state))) {
    throw new Error(formatLayoffError(targetMeld, existingCards, card));
  }

  player.hand = player.hand.filter((c) => c.id !== cardId);
  targetMeld.cardIds.push(cardId);
  state.meldedBy.set(cardId, playerId);
  if (targetMeld.kind === 'run') {
    sortRunCardIds(state, targetMeld.cardIds);
  }
  if (r500(state).mustMeldCardId !== null && cardId === r500(state).mustMeldCardId) {
    r500(state).mustMeldCardId = null;
  }
}

export function applyDiscard(state: GameState, playerId: PlayerId, cardId: string): { handEnded: boolean } {
  const player = requireTurn(state, playerId);
  if (state.phase !== 'discard' && state.phase !== 'meld') {
    throw new Error('ERR_WRONG_PHASE');
  }
  if (r500(state).mustMeldCardId !== null) {
    throw new Error('ERR_MUST_USE_PILE_CARD');
  }
  if (state.drewFromDiscardId === cardId) {
    throw new Error('ERR_CANNOT_DISCARD_DRAWN_CARD');
  }

  const card = lookupCard(state, cardId);
  if (!player.hand.find((c) => c.id === cardId)) {
    throw new Error(`ERR_CARD_NOT_IN_HAND:${cardId}`);
  }

  player.hand = player.hand.filter((c) => c.id !== cardId);
  state.discardPile.push(card);

  if (player.hand.length === 0) {
    state.phase = 'ended';
    return { handEnded: true };
  }

  advanceTurn(state);
  return { handEnded: false };
}

// 500 Rummy clears its variant-specific pile-dive obligation on turn end.
function advanceTurn(state: GameState): void {
  baseAdvanceTurn(state);
  r500(state).mustMeldCardId = null;
}
