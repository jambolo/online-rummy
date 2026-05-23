import { randomUUID } from 'node:crypto';
import type { Card, MeldKind, PlayerId } from '@online-rummy/shared';
import { RANK_INDEX } from '@online-rummy/shared';
import type { RNG } from '../../rng.js';
import { buildShuffledDeck, dealN } from '../deck.js';
import {
  cardPoints,
  validateMeld as coreMeldCheck,
  runAceDirection,
  score500MeldCard,
} from '../meld.js';
import type { GamePlayer, GameState, ScoreSheet, VariantEngine } from '../types.js';

// rules.md A.4 — 500 Rum (a.k.a. Pinochle Rummy)
// House rule picks: plan.md "House rule picks (locked) > 500 Rum"

// rules.md A.4.1: 2P deals 13; 3+P deals 7.
function dealCount(playerCount: number): number {
  if (playerCount < 2) throw new Error(`ERR_INVALID_PLAYER_COUNT:${playerCount}`);
  return playerCount === 2 ? 13 : 7;
}

// rules.md A.4.1: 1 deck ≤4P, 2 decks ≥5P (no jokers per locked picks).
function deckCount(playerCount: number): number {
  return playerCount <= 4 ? 1 : 2;
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
    const decks = deckCount(playerCount);
    const deck = buildShuffledDeck(rng, decks);
    const count = dealCount(playerCount);

    const hands: Card[][] = [];
    for (let i = 0; i < playerCount; i++) {
      hands.push(dealN(deck, count));
    }
    const top = deck.shift();
    if (!top) throw new Error('ERR_DECK_EXHAUSTED');
    return { hands, stock: deck, discard: [top] };
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
    if (state.mustMeldCardId !== null) return false;
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
        const meldCards = meld.cardIds
          .map((id) => state.cardRegistry.get(id))
          .filter((c): c is Card => c !== undefined);
        for (const c of meldCards) {
          const placer = state.meldedBy.get(c.id) ?? p.id;
          result.set(placer, (result.get(placer) ?? 0) + score500MeldCard(c, meldCards));
        }
      }
    }

    // Subtract hand value (aces in hand = 15 — rules.md A.4.2, [RP] locked pick simplification).
    for (const p of state.players) {
      if (p.status === 'forfeited') continue;
      const handVal = p.hand.reduce((s, c) => s + cardPoints(c, 15), 0);
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
};

// ---- Game state factory ----

export function createRum500Game(
  roomId: string,
  players: Array<{ id: string; name: string }>,
  rng: RNG,
  firstPlayerIndex?: number,
): GameState {
  const { hands, stock, discard } = rum500Variant.deal(players.length, rng);

  const cardRegistry = new Map<string, Card>();
  const registerAll = (cards: Card[]) => cards.forEach((c) => cardRegistry.set(c.id, c));
  hands.forEach(registerAll);
  registerAll(stock);
  registerAll(discard);

  const startIdx = firstPlayerIndex ?? rng(0, players.length);
  const firstPlayer = players[startIdx]!;

  return {
    roomId,
    variant: 'rum500',
    players: players.map((p, i) => ({
      id: p.id,
      name: p.name,
      hand: hands[i] ?? [],
      melds: [],
      score: 0,
      status: 'active',
    })),
    turnPlayerId: firstPlayer.id,
    firstPlayerId: firstPlayer.id,
    phase: 'draw',
    stock,
    discardPile: discard,
    cardRegistry,
    drewFromDiscardId: null,
    hasMeldedEver: new Map(players.map((p) => [p.id, false])),
    scoreSheet: new Map(players.map((p) => [p.id, []])),
    mustMeldCardId: null,
    meldedBy: new Map(),
  };
}

// ---- Turn actions ----

function requireTurn(state: GameState, playerId: PlayerId): GamePlayer {
  if (state.turnPlayerId !== playerId) throw new Error('ERR_NOT_YOUR_TURN');
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error('ERR_PLAYER_NOT_FOUND');
  if (player.status === 'forfeited') throw new Error('ERR_PLAYER_FORFEITED');
  return player;
}

function lookupCard(state: GameState, id: string): Card {
  const card = state.cardRegistry.get(id);
  if (!card) throw new Error(`ERR_UNKNOWN_CARD:${id}`);
  return card;
}

function detectMeldKind(cards: Card[]): MeldKind {
  const allSameRank = cards.every((c) => c.rank === cards[0]!.rank);
  return allSameRank ? 'set' : 'run';
}

// rules.md A.4.3: aces play at either end (A-2-3 OR Q-K-A). For display, sort runs so
// the ace sits at the correct end of its sequence — RANK_INDEX alone (A=0) misorders
// Q-K-A as A-J-Q-K.
function sortRunCardIds(state: GameState, cardIds: string[]): void {
  const cards = cardIds.map((id) => lookupCard(state, id));
  const aceHigh = runAceDirection(cards) === 'high';
  const idxOf = (c: Card) =>
    c.rank === 'A' && aceHigh ? 13 : RANK_INDEX[c.rank];
  cardIds.sort((a, b) => idxOf(lookupCard(state, a)) - idxOf(lookupCard(state, b)));
}

// rules.md A.4.4: drawing from stock or single top-discard card.
// For pile dive (draw from below the top), use applyDrawFromPile.
export function applyDraw(
  state: GameState,
  playerId: PlayerId,
  from: 'stock' | 'discard',
): void {
  requireTurn(state, playerId);
  if (state.phase !== 'draw') throw new Error('ERR_WRONG_PHASE');
  if (from === 'discard') {
    // Single top-card draw: no must-meld obligation; drawn card cannot be re-discarded same turn.
    const top = state.discardPile[state.discardPile.length - 1];
    if (!top) throw new Error('ERR_DISCARD_EMPTY');
    state.discardPile.pop();
    state.players.find((p) => p.id === playerId)!.hand.push(top);
    state.drewFromDiscardId = top.id;
  } else {
    if (state.stock.length === 0) throw new Error('ERR_STOCK_EMPTY');
    const card = state.stock.shift()!;
    state.players.find((p) => p.id === playerId)!.hand.push(card);
  }
  state.phase = 'meld';
}

// rules.md A.4.4: pile dive — take selected card + everything above it, must use selected card.
// If the selected card IS the top card, this degrades to a plain top-card draw (no must-use)
// per rules.md A.4.4: "pile dive" is defined as picking a card below the top.
export function applyDrawFromPile(
  state: GameState,
  playerId: PlayerId,
  cardId: string,
): { taken: Card[] } {
  requireTurn(state, playerId);
  if (state.phase !== 'draw') throw new Error('ERR_WRONG_PHASE');
  const idx = state.discardPile.findIndex((c) => c.id === cardId);
  if (idx === -1) throw new Error(`ERR_CARD_NOT_IN_PILE:${cardId}`);

  const isTopOnly = idx === state.discardPile.length - 1;
  const player = state.players.find((p) => p.id === playerId)!;
  const selected = lookupCard(state, cardId);

  if (!isTopOnly) {
    // True pile dive — preflight so player cannot get stuck unable to meld/layoff the
    // must-use card (rules.md A.4.4 obligation would otherwise be unsatisfiable).
    const wouldTake = state.discardPile.slice(idx);
    if (!canUseSelectedInMeldOrLayoff(state, [...player.hand, ...wouldTake], selected)) {
      throw new Error('ERR_NO_LEGAL_DIVE');
    }
  }

  const taken = state.discardPile.splice(idx);
  player.hand.push(...taken);
  if (isTopOnly) {
    // rules.md A.4.4 simple top-card draw: cannot re-discard same turn, no must-use.
    state.drewFromDiscardId = cardId;
  } else {
    state.mustMeldCardId = cardId;
  }
  state.phase = 'meld';
  return { taken };
}

// Pile-dive preflight (rules.md A.4.4): selected card must have at least one legal
// placement — either as part of a fresh meld with the resulting hand, or as a layoff
// onto any existing meld in play. Used by applyDrawFromPile and exposed for the client
// modal to gray out unusable cards.
export function canUseSelectedInMeldOrLayoff(
  state: GameState,
  available: Card[],
  selected: Card,
): boolean {
  for (const p of state.players) {
    for (const m of p.melds) {
      const meldCards = m.cardIds
        .map((id) => state.cardRegistry.get(id))
        .filter((c): c is Card => c !== undefined);
      if (rum500Variant.validateMeld([...meldCards, selected])) return true;
    }
  }
  const others = available.filter((c) => c.id !== selected.id);
  if (others.filter((c) => c.rank === selected.rank).length >= 2) return true;
  return canFormRunWith(others, selected);
}

function canFormRunWith(others: Card[], selected: Card): boolean {
  const sameSuit = others.filter((c) => c.suit === selected.suit);
  // 500 Rum ace-either-end: try ace=low and ace=high independently.
  for (const aceHigh of [false, true]) {
    const idxOf = (c: Card) =>
      c.rank === 'A' ? (aceHigh ? 13 : 0) : RANK_INDEX[c.rank];
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
export function applyMeld(
  state: GameState,
  playerId: PlayerId,
  cardIds: string[],
): void {
  const player = requireTurn(state, playerId);
  if (state.phase !== 'meld' && state.phase !== 'discard') {
    throw new Error('ERR_WRONG_PHASE');
  }

  const cards = cardIds.map((id) => {
    const c = lookupCard(state, id);
    if (!player.hand.find((h) => h.id === id)) throw new Error(`ERR_CARD_NOT_IN_HAND:${id}`);
    return c;
  });

  if (!rum500Variant.validateMeld(cards)) throw new Error('ERR_INVALID_MELD');

  player.hand = player.hand.filter((c) => !cardIds.includes(c.id));
  const meld = {
    id: randomUUID(),
    kind: detectMeldKind(cards),
    cardIds: [...cardIds],
    ownerId: playerId,
  };
  if (meld.kind === 'run') {
    sortRunCardIds(state, meld.cardIds);
  }
  player.melds.push(meld);
  for (const id of cardIds) state.meldedBy.set(id, playerId);

  state.hasMeldedEver.set(playerId, true);
  // Clear must-meld obligation if satisfied by this meld.
  if (state.mustMeldCardId !== null && cardIds.includes(state.mustMeldCardId)) {
    state.mustMeldCardId = null;
  }
  // Multiple melds + layoffs allowed per turn — stay in meld phase until player discards.
  state.phase = 'meld';
}

// rules.md A.4.6: laying off onto any player's meld; cards credit the layoff player.
export function applyLayoff(
  state: GameState,
  playerId: PlayerId,
  meldId: string,
  cardId: string,
): void {
  const player = requireTurn(state, playerId);
  if (state.phase !== 'meld' && state.phase !== 'discard') {
    throw new Error('ERR_WRONG_PHASE');
  }

  const card = lookupCard(state, cardId);
  if (!player.hand.find((c) => c.id === cardId)) {
    throw new Error(`ERR_CARD_NOT_IN_HAND:${cardId}`);
  }

  let targetMeld:
    | { id: string; kind: MeldKind; cardIds: string[]; ownerId: string }
    | undefined;
  for (const p of state.players) {
    targetMeld = p.melds.find((m) => m.id === meldId);
    if (targetMeld) break;
  }
  if (!targetMeld) throw new Error('ERR_MELD_NOT_FOUND');

  const existingCards = targetMeld.cardIds.map((id) => lookupCard(state, id));
  if (!rum500Variant.validateMeld([...existingCards, card])) {
    throw new Error('ERR_INVALID_LAYOFF');
  }

  player.hand = player.hand.filter((c) => c.id !== cardId);
  targetMeld.cardIds.push(cardId);
  state.meldedBy.set(cardId, playerId);
  if (targetMeld.kind === 'run') {
    sortRunCardIds(state, targetMeld.cardIds);
  }
  state.hasMeldedEver.set(playerId, true);
  if (state.mustMeldCardId !== null && cardId === state.mustMeldCardId) {
    state.mustMeldCardId = null;
  }
}

export function applyDiscard(
  state: GameState,
  playerId: PlayerId,
  cardId: string,
): { handEnded: boolean } {
  const player = requireTurn(state, playerId);
  if (state.phase !== 'discard' && state.phase !== 'meld') {
    throw new Error('ERR_WRONG_PHASE');
  }
  if (state.mustMeldCardId !== null) {
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

function advanceTurn(state: GameState): void {
  const activePlayers = state.players.filter((p) => p.status === 'active');
  const idx = activePlayers.findIndex((p) => p.id === state.turnPlayerId);
  const next = activePlayers[(idx + 1) % activePlayers.length];
  if (!next) throw new Error('ERR_NO_ACTIVE_PLAYERS');

  state.turnPlayerId = next.id;
  state.phase = 'draw';
  state.drewFromDiscardId = null;
  state.mustMeldCardId = null;
}
