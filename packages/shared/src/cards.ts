import type { HouseRules } from './houseRules.js';

export type Suit = 'C' | 'D' | 'H' | 'S';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
export type Card = { id: string; suit: Suit; rank: Rank };

export type MeldKind = 'set' | 'run';
export type Meld = { id: string; kind: MeldKind; cardIds: string[]; ownerId: string; cards?: Card[] };

export type Phase = 'firstUpcardOffer' | 'draw' | 'meld' | 'discard' | 'layoff' | 'ended';

export type Variant = 'basic' | 'gin' | 'rum500';

export type PlayerId = string;

export type PlayerStatus = 'active' | 'forfeited';

export type PublicPlayer = {
  id: PlayerId;
  name: string;
  handCount: number;
  melds: Meld[];
  score: number;
  status: PlayerStatus;
};

// Variant-specific public state pocket. Client narrows on `variantPublic.variant` to
// access its variant's fields. Keeps the top-level PublicState clean of per-variant
// fields that other variants would always see as null.
export type VariantPublic =
  | { variant: 'basic'; data: Record<string, never> }
  | { variant: 'rum500'; data: { mustMeldCardId: string | null } }
  | { variant: 'gin'; data: { ginKnockerId: string | null } };

export type PublicState = {
  roomId: string;
  variant: Variant;
  players: PublicPlayer[];
  turnPlayerId: PlayerId;
  phase: Phase;
  discardTop: Card | null;
  discardPileSize: number;
  // Full discard pile, bottom-to-top. All discards are public knowledge (face-up). 500
  // Rum uses this for the pile-dive picker; basic clients can ignore it.
  discardPile: Card[];
  stockSize: number;
  // cardId → id of the player who placed that card on the table (melded or laid off).
  // Used by clients to attribute laid-off cards to the layer for interim meld scoring.
  meldedBy: Record<string, PlayerId>;
  // Per-variant fields. See VariantPublic.
  variantPublic: VariantPublic;
  // NS-8 (T-NS8-2): configured house rules for this game. Variation-agnostic config —
  // the sanctioned top-level exception; NOT part of variantPublic. [S5]
  houseRules: HouseRules;
};

export type PrivateState = { hand: Card[] };

// Rank ordering helpers
export const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const RANK_INDEX: Record<Rank, number> = {
  A: 0,
  '2': 1,
  '3': 2,
  '4': 3,
  '5': 4,
  '6': 5,
  '7': 6,
  '8': 7,
  '9': 8,
  '10': 9,
  J: 10,
  Q: 11,
  K: 12,
};
