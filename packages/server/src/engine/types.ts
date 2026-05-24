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
  // tracks card drawn from discard this turn (all variants: cannot re-discard same turn). rules.md A.1.6 step 4, A.2.3 step 3, A.3.3 step 3, A.4.4
  drewFromDiscardId: string | null;
  // rules.md A.1.7: going-rummy — player must not have melded/laid-off before going out
  hasMeldedEver: Map<PlayerId, boolean>;
  scoreSheet: ScoreSheet;
  // Id of the player who went first this hand — used for clockwise rotation on re-deal.
  firstPlayerId: PlayerId;
  // 500 Rum (rules.md A.4.4): when a player draws from anywhere in the discard pile, the
  // chosen card must be used immediately in a meld or layoff before discarding. Cleared
  // when the card is used. Null for variants that don't enforce this.
  mustMeldCardId: string | null;
  // 500 Rum (rules.md A.4.6, A.4.7): scoring credits the player who placed a card,
  // not the meld's original owner. Tracks placer for every card in any meld.
  meldedBy: Map<string, PlayerId>;
  // Gin: ID of the player who knocked — set by applyKnock, read by scoreHand/handleHandEnd.
  // Needed because turnPlayerId switches to defender during 'layoff' phase.
  ginKnockerId: string | null;
  // Gin (rules.md A.2.3): set when applyDiscard reduces the stock to ≤2 cards without a
  // knock. Signals that the hand is over with no scoring; same dealer re-deals.
  cancelledHand: boolean;
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
