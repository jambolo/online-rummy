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

export type GameState = {
  roomId: string;
  variant: VariantId;
  players: GamePlayer[];
  turnPlayerId: PlayerId;
  phase: Phase;
  stock: Card[];
  discardPile: Card[];
  // Stable lookup for all cards ever in this game (id → Card)
  cardRegistry: Map<string, Card>;
  // tracks card drawn from discard this turn (basic: cannot re-discard same turn). rules.md A.1.6 step 4
  drewFromDiscardId: string | null;
  // rules.md A.1.6 step 2 [PG-R]: at most 1 meld per turn; reset in advanceTurn
  meldedThisTurn: boolean;
  // rules.md A.1.7: going-rummy — player must not have melded/laid-off before going out
  hasMeldedEver: Map<PlayerId, boolean>;
  scoreSheet: ScoreSheet;
  // Id of the player who went first this hand — used for clockwise rotation on re-deal.
  firstPlayerId: PlayerId;
};

export interface VariantEngine {
  readonly id: VariantId;
  readonly minPlayers: number;
  readonly maxPlayers: number;
  readonly aceHigh: boolean;
  readonly roundTheCorner: boolean;

  deal(playerCount: number, rng: RNG): { hands: Card[][]; stock: Card[]; discard: Card[] };

  validateMeld(cards: Card[]): boolean;

  canDrawFromDiscard(state: GameState, playerId: PlayerId, cardId?: string): boolean;

  onDrawFromDiscard(state: GameState, playerId: PlayerId, cardId: string): void;

  canDiscard(state: GameState, playerId: PlayerId, cardId: string): boolean;

  scoreHand(state: GameState): Map<PlayerId, number>;

  isGameOver(scoreSheet: ScoreSheet): boolean;
}
