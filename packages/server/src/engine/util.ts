// Shared engine utilities used by all variants.
//
// Each function here was previously duplicated across basic.ts, rum500.ts, and gin.ts.

import { randomUUID } from 'node:crypto';
import type { Card, MeldKind, PlayerId } from '@online-rummy/shared';
import type { RNG } from '../rng.js';
import type { GamePlayer, GameState, VariantStateMap } from './types.js';

// Resolve the current player, enforcing turn ownership + not-forfeited status.
// Throws ERR_NOT_YOUR_TURN / ERR_PLAYER_NOT_FOUND / ERR_PLAYER_FORFEITED.
export function requireTurn(state: GameState, playerId: PlayerId): GamePlayer {
  if (state.turnPlayerId !== playerId) throw new Error('ERR_NOT_YOUR_TURN');
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error('ERR_PLAYER_NOT_FOUND');
  if (player.status === 'forfeited') throw new Error('ERR_PLAYER_FORFEITED');
  return player;
}

// Find a Card by id via the state's card registry. Throws ERR_UNKNOWN_CARD:<id> on miss.
export function lookupCard(state: GameState, id: string): Card {
  const card = state.cardRegistry.get(id);
  if (!card) throw new Error(`ERR_UNKNOWN_CARD:${id}`);
  return card;
}

// Advance turn to next active player. Resets phase=draw, drewFromDiscardId=null.
// Does NOT reset variant-specific pocket fields (e.g. 500 Rum mustMeldCardId);
// variant-specific advanceTurn wrappers handle those.
export function advanceTurn(state: GameState): void {
  const activePlayers = state.players.filter((p) => p.status === 'active');
  const idx = activePlayers.findIndex((p) => p.id === state.turnPlayerId);
  const next = activePlayers[(idx + 1) % activePlayers.length];
  if (!next) throw new Error('ERR_NO_ACTIVE_PLAYERS');

  state.turnPlayerId = next.id;
  state.phase = 'draw';
  state.drewFromDiscardId = null;
}

// Detect whether a card group is a set (all same rank) or a run (mixed ranks).
// Caller must already have validated the cards via variant.validateMeld.
export function detectMeldKind(cards: Card[]): MeldKind {
  const allSameRank = cards.every((c) => c.rank === cards[0]!.rank);
  return allSameRank ? 'set' : 'run';
}

// Build the shared GameState skeleton. Variants pass:
//   - their own deal output
//   - the phase the hand opens in
//   - the initial variantState pocket (BasicState = {}, Rum500State = {mustMeldCardId:null}, etc.)
//
// TypeScript narrows the returned GameState's union arm by the `variant` literal.
export function buildBaseState<V extends keyof VariantStateMap>(
  roomId: string,
  variant: V,
  players: Array<{ id: string; name: string }>,
  deal: { hands: Card[][]; stock: Card[]; discard: Card[] },
  rng: RNG,
  initialPhase: GameState['phase'],
  variantState: VariantStateMap[V],
  firstPlayerIndex?: number,
): GameState {
  const cardRegistry = new Map<string, Card>();
  const registerAll = (cards: Card[]) => cards.forEach((c) => cardRegistry.set(c.id, c));
  deal.hands.forEach(registerAll);
  registerAll(deal.stock);
  registerAll(deal.discard);

  const startIdx = firstPlayerIndex ?? rng(0, players.length);
  const firstPlayer = players[startIdx]!;

  // Cast to GameState — TS can't statically prove the variant+variantState arms match,
  // but caller (a variant module) passes the matching combination.
  return {
    roomId,
    variant,
    players: players.map((p, i) => ({
      id: p.id,
      name: p.name,
      hand: deal.hands[i] ?? [],
      melds: [],
      score: 0,
      status: 'active',
    })),
    turnPlayerId: firstPlayer.id,
    firstPlayerId: firstPlayer.id,
    phase: initialPhase,
    stock: deal.stock,
    discardPile: deal.discard,
    cardRegistry,
    drewFromDiscardId: null,
    scoreSheet: new Map(players.map((p) => [p.id, []])),
    meldedBy: new Map(),
    variantState,
  } as GameState;
}

// Generate a meld id. Centralized so future tests can mock or seed.
export function makeMeldId(): string {
  return randomUUID();
}
