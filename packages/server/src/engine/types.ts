import type { Card, Meld, Phase, PlayerId, Variant as VariantId } from '@online-rummy/shared';
import type { RNG } from '../rng.js';

export type ScoreSheet = Map<PlayerId, number[]>; // per-hand scores indexed by hand number

export type GamePlayer = {
  id: PlayerId;
  name: string;
  hand: Card[];
  melds: Meld[];
  score: number;
  status: 'active' | 'forfeited';
};

// ---- Per-variant state pockets ----
//
// Phase 5: each variant carries its own state blob on GameState.variantState. The
// shared GameState type stays minimal; per-variant fields stop leaking into other
// variants. Adding a new variant = define its state type + add to VariantStateMap.

export type BasicState = Record<string, never>;

export type Rum500State = {
  // 500 Rummy (rules.md A.4.4): pile-dive must-use restriction. Set by applyDrawFromPile;
  // cleared when card is melded or laid off. applyDiscard rejects while non-null.
  mustMeldCardId: string | null;
};

export type GinState = {
  // Gin: knocker id during 'layoff' phase + scoring. Set by applyKnock; turnPlayerId
  // moves to defender, so we need a separate field to remember the knocker.
  ginKnockerId: PlayerId | null;
  // Gin (rules.md A.2.3): set when applyDiscard reduces stock to ≤ 2 cards without a
  // knock. Signals no scoring; same dealer re-deals.
  cancelledHand: boolean;
};

export type VariantStateMap = {
  basic: BasicState;
  rum500: Rum500State;
  gin: GinState;
};

type BaseGameState = {
  roomId: string;
  players: GamePlayer[];
  turnPlayerId: PlayerId;
  phase: Phase;
  stock: Card[];
  discardPile: Card[];
  // Stable lookup for all cards ever in this game (id → Card)
  cardRegistry: Map<string, Card>;
  // tracks card drawn from discard this turn (all variants: cannot re-discard same turn). rules.md A.1.6 step 4, A.2.3 step 3, A.3.3 step 3, A.4.4
  drewFromDiscardId: string | null;
  scoreSheet: ScoreSheet;
  // Id of the player who went first this hand — used for re-deal rotation.
  firstPlayerId: PlayerId;
  // 500 Rummy (rules.md A.4.6, A.4.7): scoring credits the player who placed a card,
  // not the meld's original owner. Used by basic + 500 (only 500 reads it for scoring).
  meldedBy: Map<string, PlayerId>;
};

export type GameState =
  | (BaseGameState & { variant: 'basic'; variantState: BasicState })
  | (BaseGameState & { variant: 'rum500'; variantState: Rum500State })
  | (BaseGameState & { variant: 'gin'; variantState: GinState });

// Result of an apply*-style action that may end the hand or cancel it.
// Basic / 500 Rummy: { handEnded }. Gin: { handEnded, cancelled? } (stock-depletion).
export type ApplyResult = { handEnded: boolean; cancelled?: boolean };

// Shape of the wonHand event payload returned by handEndPayload.
export type WonHandData = {
  finalHands: Record<PlayerId, Card[]>;
  meldCredits: Record<PlayerId, { card: Card; pts: number }[]>;
  handDeadwood: Record<PlayerId, number>;
  ginInfo?: {
    knockerId: PlayerId;
    knockerDeadwood: number;
    defenderDeadwood: number;
    result: 'gin' | 'knock' | 'undercut';
  };
};

export interface VariantEngine {
  readonly id: VariantId;
  readonly minPlayers: number;
  readonly maxPlayers: number;
  readonly aceHigh: boolean;
  readonly roundTheCorner: boolean;

  // Setup
  deal(playerCount: number, rng: RNG): { hands: Card[][]; stock: Card[]; discard: Card[] };
  createGame(roomId: string, players: Array<{ id: string; name: string }>, rng: RNG, firstPlayerIndex?: number): GameState;

  // Predicates / scoring
  validateMeld(cards: Card[]): boolean;
  canDrawFromDiscard(state: GameState, playerId: PlayerId, cardId?: string): boolean;
  onDrawFromDiscard(state: GameState, playerId: PlayerId, cardId: string): void;
  canDiscard(state: GameState, playerId: PlayerId, cardId: string): boolean;
  scoreHand(state: GameState): Map<PlayerId, number>;
  isGameOver(scoreSheet: ScoreSheet): boolean;

  // Core actions (required — all variants implement these)
  applyDraw(state: GameState, playerId: PlayerId, from: 'stock' | 'discard'): void;
  applyMeld(state: GameState, playerId: PlayerId, cardIds: string[]): ApplyResult;
  applyLayoff(state: GameState, playerId: PlayerId, meldId: string, cardId: string): ApplyResult;
  applyDiscard(state: GameState, playerId: PlayerId, cardId: string): ApplyResult;

  // Variant-specific actions (optional)
  applyDrawFromPile?(state: GameState, playerId: PlayerId, cardId: string): { taken: Card[] };
  applyKnock?(state: GameState, playerId: PlayerId, melds: string[][] | undefined, discardId: string): void;
  applyGinLayoff?(
    state: GameState,
    playerId: PlayerId,
    layoffs: Array<{ cardId: string; meldId: string }>,
    ownMelds: string[][] | undefined,
  ): void;
  applyPassUpcard?(state: GameState, playerId: PlayerId): void;

  // Lifecycle hooks
  nextFirstPlayerIndex(oldState: GameState | null, newPlayers: Array<{ id: string; name: string }>): number;
  winnerForHand(state: GameState, scores: Map<PlayerId, number>): PlayerId | null;
  handEndPayload(state: GameState, scores: Map<PlayerId, number>): WonHandData;
}
