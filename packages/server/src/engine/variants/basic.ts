import { randomUUID } from 'node:crypto';
import type { Card, MeldKind, PlayerId } from '@online-rummy/shared';
import { RANK_INDEX, RANKS } from '@online-rummy/shared';
import type { RNG } from '../../rng.js';
import { buildShuffledDeck, dealN } from '../deck.js';
import { cardPoints, validateMeld as coreMeldCheck } from '../meld.js';
import type { GamePlayer, GameState, ScoreSheet, VariantEngine } from '../types.js';

// rules.md A.1 — Basic Rummy (Rum)
// House rule picks: plan.md "House rule picks (locked) > Basic Rummy"

// rules.md A.1.2: deal counts per player count
const DEAL_COUNTS: Record<number, number> = { 2: 10, 3: 7, 4: 7, 5: 6, 6: 6 };

export const basicVariant: VariantEngine = {
  id: 'basic',
  // rules.md A.1.1: 2-6 players (7P omitted from v1 scope per plan.md)
  minPlayers: 2,
  maxPlayers: 6,
  // rules.md A.1.4: ace low (house rule pick: OFF). Round-the-corner: OFF.
  aceHigh: false,
  roundTheCorner: false,

  deal(playerCount: number, rng: RNG) {
    const deck = buildShuffledDeck(rng, 1);
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
    // rules.md A.1.6 step 4 [PG-R]: record so canDiscard can forbid re-discarding it
    state.drewFromDiscardId = cardId;
  },

  canDiscard(state: GameState, _playerId: PlayerId, cardId: string): boolean {
    // rules.md A.1.6 step 4 [PG-R]: cannot discard same card drawn from discard this turn
    return state.drewFromDiscardId !== cardId;
  },

  scoreHand(state: GameState): Map<PlayerId, number> {
    // rules.md A.1.8: A=1, 2-10=pip, JQK=10. Winner earns sum of opponents' unmelded values.
    const unmelded = new Map<PlayerId, number>();
    for (const player of state.players) {
      if (player.status === 'forfeited') continue;
      unmelded.set(player.id, player.hand.reduce((s, c) => s + cardPoints(c, 1), 0));
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
      // rules.md A.1.7: going-rummy bonus — score × 2 (house rule pick: double not +10)
      const wentRummy = !(state.hasMeldedEver.get(winner.id) ?? false);
      result.set(winner.id, wentRummy ? earned * 2 : earned);
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
};

// ---- Game state factory ----

export function createBasicGame(
  roomId: string,
  players: Array<{ id: string; name: string }>,
  rng: RNG,
  // When omitted, first player is chosen randomly. Pass an explicit index for re-deals.
  firstPlayerIndex?: number,
): GameState {
  const { hands, stock, discard } = basicVariant.deal(players.length, rng);

  const cardRegistry = new Map<string, Card>();
  const registerAll = (cards: Card[]) => cards.forEach((c) => cardRegistry.set(c.id, c));
  hands.forEach(registerAll);
  registerAll(stock);
  registerAll(discard);

  const startIdx = firstPlayerIndex ?? rng(0, players.length);
  const firstPlayer = players[startIdx]!;

  return {
    roomId,
    variant: 'basic',
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
    meldedThisTurn: false,
    hasMeldedEver: new Map(players.map((p) => [p.id, false])),
    scoreSheet: new Map(players.map((p) => [p.id, []])),
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

// rules.md A.1.6 step 1
export function applyDraw(
  state: GameState,
  playerId: PlayerId,
  from: 'stock' | 'discard',
): void {
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

function detectMeldKind(cards: Card[]): MeldKind {
  const allSameRank = cards.every((c) => c.rank === cards[0]!.rank);
  return allSameRank ? 'set' : 'run';
}

// rules.md A.1.6 step 2 [PG-R]: at most 1 meld per turn
export function applyMeld(
  state: GameState,
  playerId: PlayerId,
  cardIds: string[],
): void {
  const player = requireTurn(state, playerId);
  if (state.phase !== 'meld' && state.phase !== 'discard') throw new Error('ERR_WRONG_PHASE');

  // rules.md A.1.6 step 2 [PG-R]: only 1 meld per turn
  if (state.meldedThisTurn) throw new Error('ERR_ALREADY_MELDED_THIS_TURN');

  const cards = cardIds.map((id) => {
    const c = lookupCard(state, id);
    if (!player.hand.find((h) => h.id === id)) throw new Error(`ERR_CARD_NOT_IN_HAND:${id}`);
    return c;
  });

  if (!basicVariant.validateMeld(cards)) throw new Error('ERR_INVALID_MELD');

  player.hand = player.hand.filter((c) => !cardIds.includes(c.id));
  const meld = { id: randomUUID(), kind: detectMeldKind(cards), cardIds: [...cardIds], ownerId: playerId };
  // Sort runs by rank so display order always matches card sequence.
  if (meld.kind === 'run') {
    meld.cardIds.sort((a, b) => RANK_INDEX[lookupCard(state, a).rank] - RANK_INDEX[lookupCard(state, b).rank]);
  }
  player.melds.push(meld);

  state.meldedThisTurn = true;
  state.hasMeldedEver.set(playerId, true);
  state.phase = 'discard'; // after melding, must discard
}

// rules.md A.1.6 step 3 [WP]: lay off onto own or others' melds; must have ≥1 own prior meld
export function applyLayoff(
  state: GameState,
  playerId: PlayerId,
  meldId: string,
  cardId: string,
): void {
  const player = requireTurn(state, playerId);
  if (state.phase !== 'meld' && state.phase !== 'discard') throw new Error('ERR_WRONG_PHASE');

  // rules.md A.1.6 step 3 [WP]: must have placed ≥1 own meld first
  if (!(state.hasMeldedEver.get(playerId) ?? false)) throw new Error('ERR_NO_OWN_MELD');

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
  if (!basicVariant.validateMeld([...existingCards, card])) {
    const suit = (s: string) => ({ C: '♣', D: '♦', H: '♥', S: '♠' })[s] ?? s;
    if (targetMeld.kind === 'set') {
      const setRank = existingCards[0]?.rank ?? '?';
      if (card.rank !== setRank) {
        throw new Error(`ERR_INVALID_LAYOFF: Set contains ${setRank}s — ${card.rank} doesn't match`);
      }
      throw new Error(`ERR_INVALID_LAYOFF: Set is already full (4 cards)`);
    } else {
      const runSuit = existingCards[0]?.suit ?? '?';
      if (card.suit !== runSuit) {
        throw new Error(
          `ERR_INVALID_LAYOFF: Card suit (${suit(card.suit)}) doesn't match run suit (${suit(runSuit)})`,
        );
      }
      const indices = existingCards.map((c) => RANK_INDEX[c.rank]);
      const lo = Math.min(...indices);
      const hi = Math.max(...indices);
      const loRank = RANKS[lo] ?? '?';
      const hiRank = RANKS[hi] ?? '?';
      throw new Error(
        `ERR_INVALID_LAYOFF: Run is ${suit(runSuit)}${loRank}–${hiRank}; ` +
        `${card.rank} must go at ${loRank === 'A' ? 'the high end' : 'the low end'} or ` +
        `${hiRank === 'K' ? 'the low end' : 'the high end'}`,
      );
    }
  }

  player.hand = player.hand.filter((c) => c.id !== cardId);
  targetMeld.cardIds.push(cardId);
  // Sort runs by rank so the display order matches card sequence.
  if (targetMeld.kind === 'run') {
    targetMeld.cardIds.sort((a, b) => {
      const ca = lookupCard(state, a);
      const cb = lookupCard(state, b);
      return RANK_INDEX[ca.rank] - RANK_INDEX[cb.rank];
    });
  }
  state.hasMeldedEver.set(playerId, true);
}

// rules.md A.1.6 step 4
export function applyDiscard(
  state: GameState,
  playerId: PlayerId,
  cardId: string,
): { handEnded: boolean } {
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

function advanceTurn(state: GameState): void {
  const activePlayers = state.players.filter((p) => p.status === 'active');
  const idx = activePlayers.findIndex((p) => p.id === state.turnPlayerId);
  const next = activePlayers[(idx + 1) % activePlayers.length];
  if (!next) throw new Error('ERR_NO_ACTIVE_PLAYERS');

  state.turnPlayerId = next.id;
  state.phase = 'draw';
  state.drewFromDiscardId = null;
  state.meldedThisTurn = false;
}
