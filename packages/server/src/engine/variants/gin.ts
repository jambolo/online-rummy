import { randomUUID } from 'node:crypto';
import type { Card, MeldKind, PlayerId } from '@online-rummy/shared';
import { RANK_INDEX } from '@online-rummy/shared';
import type { RNG } from '../../rng.js';
import { buildShuffledDeck, dealN } from '../deck.js';
import { cardPoints, validateMeld as coreMeldCheck } from '../meld.js';
import type { GamePlayer, GameState, ScoreSheet, VariantEngine } from '../types.js';

// rules.md A.2 — Gin Rummy
// House rule picks: plan.md "House rule picks (locked) > Gin Rummy"

// Unmelded card value (deadwood) for a player. rules.md A.2: A=1, face=10, pip=pip.
export function ginDeadwood(player: GamePlayer): number {
  return player.hand.reduce((s, c) => s + cardPoints(c, 1), 0);
}

export const ginVariant: VariantEngine = {
  id: 'gin',
  // rules.md A.2.1: 2 players only.
  minPlayers: 2,
  maxPlayers: 2,
  // rules.md A.2 house rule pick: ace low only.
  aceHigh: false,
  roundTheCorner: false,

  deal(playerCount: number, rng: RNG) {
    // rules.md A.2.2: 1 deck, 10 cards each.
    const deck = buildShuffledDeck(rng, 1);
    const hands: Card[][] = [];
    for (let i = 0; i < playerCount; i++) {
      hands.push(dealN(deck, 10));
    }
    const top = deck.shift();
    if (!top) throw new Error('ERR_DECK_EXHAUSTED');
    return { hands, stock: deck, discard: [top] };
  },

  validateMeld(cards: Card[]): boolean {
    // rules.md A.2: sets (3-4 same rank) + runs (3+ consecutive same suit), ace low.
    return coreMeldCheck(cards, { aceHigh: false, roundTheCorner: false });
  },

  canDrawFromDiscard(state: GameState, _playerId: PlayerId): boolean {
    return state.phase === 'draw' && state.discardPile.length > 0;
  },

  onDrawFromDiscard(state: GameState, _playerId: PlayerId, cardId: string): void {
    // rules.md A.2.3: cannot re-discard the drawn discard card same turn.
    state.drewFromDiscardId = cardId;
  },

  canDiscard(state: GameState, _playerId: PlayerId, cardId: string): boolean {
    return state.drewFromDiscardId !== cardId;
  },

  scoreHand(state: GameState): Map<PlayerId, number> {
    // rules.md A.2.4: scoring based on deadwood comparison after knock.
    const active = state.players.filter(p => p.status !== 'forfeited');
    const result = new Map<PlayerId, number>(state.players.map(p => [p.id, 0]));
    if (active.length < 2) return result;

    // Knocker identified by ginKnockerId (turnPlayerId may be defender after layoff phase).
    const knockerId = state.ginKnockerId ?? state.turnPlayerId;
    const knocker = active.find(p => p.id === knockerId) ?? active[0]!;
    const defender = active.find(p => p.id !== knocker.id) ?? active[1]!;

    const kDead = ginDeadwood(knocker);
    const dDead = ginDeadwood(defender);

    let winner: GamePlayer;
    let loser: GamePlayer;
    let handPts: number;

    if (kDead === 0) {
      // rules.md A.2.4 Gin: gin bonus (+20) + opponent's unmatched + box (+20).
      winner = knocker;
      loser = defender;
      handPts = dDead + 20 + 20;
    } else if (kDead < dDead) {
      // rules.md A.2.4 regular knock: difference + box (+20).
      winner = knocker;
      loser = defender;
      handPts = (dDead - kDead) + 20;
    } else {
      // rules.md A.2.4 undercut (defender deadwood ≤ knocker deadwood).
      // Defender wins: difference + undercut bonus (+10) + box (+20).
      winner = defender;
      loser = knocker;
      handPts = (kDead - dDead) + 10 + 20;
    }

    // rules.md A.2.5: game bonus +100 when winner's cumulative reaches ≥100.
    if (winner.score + handPts >= 100) {
      handPts += 100;
      // rules.md A.2.5 shutout: loser never scored → extra +100 ([BIC-G] not +200 [PG-G]).
      const loserSheet = state.scoreSheet.get(loser.id) ?? [];
      if (loser.score === 0 && loserSheet.every(s => s === 0)) {
        handPts += 100;
      }
    }

    result.set(winner.id, handPts);
    return result;
  },

  isGameOver(scoreSheet: ScoreSheet): boolean {
    // rules.md A.2.5: first player to reach cumulative ≥100 wins.
    for (const hands of scoreSheet.values()) {
      if (hands.reduce((s, v) => s + v, 0) >= 100) return true;
    }
    return false;
  },
};

// ---- Game state factory ----

export function createGinGame(
  roomId: string,
  players: Array<{ id: string; name: string }>,
  rng: RNG,
  firstPlayerIndex?: number,
): GameState {
  const { hands, stock, discard } = ginVariant.deal(players.length, rng);

  const cardRegistry = new Map<string, Card>();
  const registerAll = (cards: Card[]) => cards.forEach(c => cardRegistry.set(c.id, c));
  hands.forEach(registerAll);
  registerAll(stock);
  registerAll(discard);

  const startIdx = firstPlayerIndex ?? rng(0, players.length);
  const firstPlayer = players[startIdx]!;

  return {
    roomId,
    variant: 'gin',
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
    // rules.md A.2.2: hand opens with the upcard offered to the non-dealer (= first player)
    // first. They may take it or pass to the dealer. If both decline, the non-dealer
    // proceeds with a normal draw.
    phase: 'firstUpcardOffer',
    stock,
    discardPile: discard,
    cardRegistry,
    drewFromDiscardId: null,
    hasMeldedEver: new Map(players.map(p => [p.id, false])),
    scoreSheet: new Map(players.map(p => [p.id, []])),
    mustMeldCardId: null,
    meldedBy: new Map(),
    ginKnockerId: null,
    cancelledHand: false,
  };
}

// ---- Turn actions ----

function requireTurn(state: GameState, playerId: PlayerId): GamePlayer {
  if (state.turnPlayerId !== playerId) throw new Error('ERR_NOT_YOUR_TURN');
  const player = state.players.find(p => p.id === playerId);
  if (!player) throw new Error('ERR_PLAYER_NOT_FOUND');
  if (player.status === 'forfeited') throw new Error('ERR_PLAYER_FORFEITED');
  return player;
}

function lookupCard(state: GameState, id: string): Card {
  const card = state.cardRegistry.get(id);
  if (!card) throw new Error(`ERR_UNKNOWN_CARD:${id}`);
  return card;
}

// rules.md A.2.3 step 1: draw from stock or top of discard.
//
// rules.md A.2.2: during the initial firstUpcardOffer phase, only a `from='discard'`
// draw is accepted (taking the offered upcard). Drawing from stock during the offer is
// not allowed — a player who does not want the upcard must `passUpcard` instead.
export function applyDraw(
  state: GameState,
  playerId: PlayerId,
  from: 'stock' | 'discard',
): void {
  requireTurn(state, playerId);

  if (state.phase === 'firstUpcardOffer') {
    if (from !== 'discard') throw new Error('ERR_WRONG_PHASE:must accept upcard or pass during initial offer');
  } else if (state.phase !== 'draw') {
    throw new Error('ERR_WRONG_PHASE');
  }

  if (from === 'discard') {
    if (state.discardPile.length === 0) throw new Error('ERR_CANNOT_DRAW_DISCARD');
    const card = state.discardPile.pop()!;
    state.players.find(p => p.id === playerId)!.hand.push(card);
    ginVariant.onDrawFromDiscard(state, playerId, card.id);
  } else {
    if (state.stock.length === 0) throw new Error('ERR_STOCK_EMPTY');
    const card = state.stock.shift()!;
    state.players.find(p => p.id === playerId)!.hand.push(card);
  }

  // rules.md A.2.3: no mid-turn melding in Gin — go straight to discard/knock phase.
  state.phase = 'discard';
}

// rules.md A.2.2: decline the initial-upcard offer. First the non-dealer (firstPlayer)
// is offered; on pass the offer moves to the dealer (the other player). If the dealer
// also passes, the non-dealer begins normal play by drawing from stock.
export function applyPassUpcard(state: GameState, playerId: PlayerId): void {
  requireTurn(state, playerId);
  if (state.phase !== 'firstUpcardOffer') throw new Error('ERR_WRONG_PHASE');

  // First offer is to firstPlayer (non-dealer). If they pass, the offer moves to the
  // other active player (dealer). If they pass too, phase reverts to normal `draw` with
  // the non-dealer playing first.
  const active = state.players.filter(p => p.status === 'active');
  if (playerId === state.firstPlayerId) {
    const dealer = active.find(p => p.id !== state.firstPlayerId);
    if (!dealer) throw new Error('ERR_NO_DEALER');
    state.turnPlayerId = dealer.id;
    // phase stays 'firstUpcardOffer' — dealer now decides
  } else {
    // Dealer passed — restart normal play with the non-dealer drawing.
    state.turnPlayerId = state.firstPlayerId;
    state.phase = 'draw';
  }
}

function detectMeldKind(cards: Card[]): MeldKind {
  return cards.every(c => c.rank === cards[0]!.rank) ? 'set' : 'run';
}

// rules.md A.2: melds are declared at knock time, not during regular play.
export function applyMeld(
  _state: GameState,
  _playerId: PlayerId,
  _cardIds: string[],
): void {
  throw new Error('ERR_NOT_SUPPORTED:melds are declared at knock time in Gin Rummy');
}

// rules.md A.2: no layoff in Gin Rummy.
export function applyLayoff(
  _state: GameState,
  _playerId: PlayerId,
  _meldId: string,
  _cardId: string,
): void {
  throw new Error('ERR_NOT_SUPPORTED:layoff not allowed in Gin Rummy');
}

// rules.md A.2.3 step 2: discard and advance turn.
//
// rules.md A.2.3 stock-depletion: if the stock has been reduced to 2 cards (or fewer)
// and the player discards without knocking, the hand is cancelled — no score, same
// dealer re-deals. Returns `{ handEnded: true, cancelled: true }` so the WS layer can
// emit a handCancelled event instead of running scoring.
export function applyDiscard(
  state: GameState,
  playerId: PlayerId,
  cardId: string,
): { handEnded: boolean; cancelled?: boolean } {
  const player = requireTurn(state, playerId);
  if (state.phase !== 'discard') throw new Error('ERR_WRONG_PHASE');

  if (!ginVariant.canDiscard(state, playerId, cardId)) {
    throw new Error('ERR_CANNOT_DISCARD_DRAWN_CARD');
  }

  const card = lookupCard(state, cardId);
  if (!player.hand.find(c => c.id === cardId)) throw new Error(`ERR_CARD_NOT_IN_HAND:${cardId}`);

  player.hand = player.hand.filter(c => c.id !== cardId);
  state.discardPile.push(card);

  // rules.md A.2.3 stock-depletion cancel — trigger as soon as stock ≤ 2 after the
  // discard (the player who took the third-to-last stock card has now discarded without
  // knocking).
  if (state.stock.length <= 2) {
    state.phase = 'ended';
    state.cancelledHand = true;
    state.drewFromDiscardId = null;
    return { handEnded: true, cancelled: true };
  }

  advanceTurn(state);
  return { handEnded: false };
}

// rules.md A.2.3: knock ends the hand. Player declares meld groups; remaining cards are deadwood.
// rules.md A.2.4: knocker discards one card face-down before deadwood is counted.
// Gin = 0 deadwood after the face-down discard. Server validates each declared group.
export function applyKnock(
  state: GameState,
  playerId: PlayerId,
  melds?: string[][],
  discardId?: string,
): void {
  const player = requireTurn(state, playerId);
  if (state.phase !== 'discard') throw new Error('ERR_WRONG_PHASE');

  // Validate declared meld groups first so meld errors surface before discard errors.
  const meldedIds = new Set<string>();
  const validatedMelds: { kind: MeldKind; cardIds: string[] }[] = [];

  for (const group of (melds ?? [])) {
    const cards: Card[] = [];
    for (const id of group) {
      if (meldedIds.has(id)) throw new Error(`ERR_CARD_IN_MULTIPLE_MELDS:${id}`);
      if (!player.hand.find(c => c.id === id)) throw new Error(`ERR_CARD_NOT_IN_HAND:${id}`);
      cards.push(lookupCard(state, id));
    }
    if (!ginVariant.validateMeld(cards)) throw new Error('ERR_INVALID_MELD');
    for (const id of group) meldedIds.add(id);
    validatedMelds.push({ kind: detectMeldKind(cards), cardIds: [...group] });
  }

  // rules.md A.2.4: face-down discard is required to signal the knock.
  if (discardId === undefined) throw new Error('ERR_KNOCK_REQUIRES_DISCARD');
  if (meldedIds.has(discardId)) throw new Error('ERR_CANNOT_DISCARD_MELDED_CARD');
  if (!player.hand.find(c => c.id === discardId)) throw new Error(`ERR_CARD_NOT_IN_HAND:${discardId}`);
  if (!ginVariant.canDiscard(state, playerId, discardId)) throw new Error('ERR_CANNOT_DISCARD_DRAWN_CARD');

  // Discard the knock card face-down.
  const knockDiscardCard = lookupCard(state, discardId);
  player.hand = player.hand.filter(c => c.id !== discardId);
  state.discardPile.push(knockDiscardCard);
  state.drewFromDiscardId = null;

  // Deadwood = unmelded cards remaining after the face-down discard. rules.md A.2.4: must be ≤10.
  const deadwoodCards = player.hand.filter(c => !meldedIds.has(c.id));
  const dw = deadwoodCards.reduce((s, c) => s + cardPoints(c, 1), 0);
  if (dw > 10) throw new Error(`ERR_CANNOT_KNOCK:deadwood is ${dw}, must be ≤10 to knock`);

  // Apply validated melds to state — move cards from hand to melds.
  for (const { kind, cardIds } of validatedMelds) {
    const meldObj = { id: randomUUID(), kind, cardIds, ownerId: playerId };
    if (kind === 'run') {
      meldObj.cardIds.sort((a, b) => RANK_INDEX[lookupCard(state, a).rank] - RANK_INDEX[lookupCard(state, b).rank]);
    }
    player.melds.push(meldObj);
    for (const id of cardIds) state.meldedBy.set(id, playerId);
  }
  player.hand = deadwoodCards; // only unmelded cards remain

  state.ginKnockerId = playerId;

  if (dw === 0) {
    // Gin (rules.md A.2.4): defender cannot lay off — end hand immediately.
    state.phase = 'ended';
  } else {
    // Knock: give defender a chance to lay off on knocker's melds (rules.md A.2.3).
    state.phase = 'layoff';
    const activePlayers = state.players.filter(p => p.status === 'active');
    const defenderPlayer = activePlayers.find(p => p.id !== playerId);
    if (defenderPlayer) state.turnPlayerId = defenderPlayer.id;
  }
}

// rules.md A.2.4: after a knock, the defender (1) separates their own melds from deadwood,
// then (2) may lay off unmatched cards onto the knocker's melds.
export function applyGinLayoff(
  state: GameState,
  playerId: PlayerId,
  layoffs: Array<{ cardId: string; meldId: string }>,
  ownMelds?: string[][],
): void {
  if (state.phase !== 'layoff') throw new Error('ERR_WRONG_PHASE');
  if (state.turnPlayerId !== playerId) throw new Error('ERR_NOT_YOUR_TURN');

  const defender = state.players.find(p => p.id === playerId);
  if (!defender) throw new Error('ERR_PLAYER_NOT_FOUND');
  const knocker = state.players.find(p => p.id === state.ginKnockerId);
  if (!knocker) throw new Error('ERR_PLAYER_NOT_FOUND');

  // --- Step 1: validate and apply the defender's own meld declarations ---
  // (rules.md A.2.4 step 3: "separates their own melds from deadwood")
  const ownMeldedIds = new Set<string>();
  const validatedOwnMelds: { kind: MeldKind; cardIds: string[] }[] = [];

  for (const group of (ownMelds ?? [])) {
    const cards: Card[] = [];
    for (const id of group) {
      if (ownMeldedIds.has(id)) throw new Error(`ERR_CARD_IN_MULTIPLE_MELDS:${id}`);
      if (!defender.hand.find(c => c.id === id)) throw new Error(`ERR_CARD_NOT_IN_HAND:${id}`);
      cards.push(lookupCard(state, id));
    }
    if (!ginVariant.validateMeld(cards)) throw new Error('ERR_INVALID_MELD');
    for (const id of group) ownMeldedIds.add(id);
    validatedOwnMelds.push({ kind: detectMeldKind(cards), cardIds: [...group] });
  }

  for (const { kind, cardIds } of validatedOwnMelds) {
    const meldObj = { id: randomUUID(), kind, cardIds, ownerId: playerId };
    if (kind === 'run') {
      meldObj.cardIds.sort((a, b) => RANK_INDEX[lookupCard(state, a).rank] - RANK_INDEX[lookupCard(state, b).rank]);
    }
    defender.melds.push(meldObj);
    for (const id of cardIds) {
      defender.hand = defender.hand.filter(c => c.id !== id);
      state.meldedBy.set(id, playerId);
    }
  }

  // --- Step 2: validate and apply layoffs onto knocker's melds ---
  const usedCardIds = new Set<string>();
  for (const { cardId, meldId } of layoffs) {
    if (usedCardIds.has(cardId)) throw new Error(`ERR_CARD_IN_MULTIPLE_MELDS:${cardId}`);
    if (ownMeldedIds.has(cardId)) throw new Error(`ERR_CARD_IN_MULTIPLE_MELDS:${cardId}`);
    if (!defender.hand.find(c => c.id === cardId)) throw new Error(`ERR_CARD_NOT_IN_HAND:${cardId}`);
    const meld = knocker.melds.find(m => m.id === meldId);
    if (!meld) throw new Error(`ERR_MELD_NOT_FOUND:${meldId}`);
    const meldCards = meld.cardIds.map(id => lookupCard(state, id));
    const newCard = lookupCard(state, cardId);
    if (!ginVariant.validateMeld([...meldCards, newCard])) throw new Error('ERR_INVALID_LAYOFF');
    usedCardIds.add(cardId);
  }

  for (const { cardId, meldId } of layoffs) {
    const meld = knocker.melds.find(m => m.id === meldId)!;
    meld.cardIds.push(cardId);
    if (meld.kind === 'run') {
      meld.cardIds.sort((a, b) => RANK_INDEX[lookupCard(state, a).rank] - RANK_INDEX[lookupCard(state, b).rank]);
    }
    defender.hand = defender.hand.filter(c => c.id !== cardId);
    state.meldedBy.set(cardId, playerId);
  }

  state.phase = 'ended';
}

function advanceTurn(state: GameState): void {
  const activePlayers = state.players.filter(p => p.status === 'active');
  const idx = activePlayers.findIndex(p => p.id === state.turnPlayerId);
  const next = activePlayers[(idx + 1) % activePlayers.length];
  if (!next) throw new Error('ERR_NO_ACTIVE_PLAYERS');

  state.turnPlayerId = next.id;
  state.phase = 'draw';
  state.drewFromDiscardId = null;
}
