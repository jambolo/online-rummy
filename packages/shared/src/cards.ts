export type Suit = 'C' | 'D' | 'H' | 'S';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
export type Card = { id: string; suit: Suit; rank: Rank };

export type MeldKind = 'set' | 'run';
export type Meld = { id: string; kind: MeldKind; cardIds: string[]; ownerId: string };

export type Phase = 'draw' | 'meld' | 'discard' | 'ended';

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

export type PublicState = {
  roomId: string;
  variant: Variant;
  players: PublicPlayer[];
  turnPlayerId: PlayerId;
  phase: Phase;
  discardTop: Card | null;
  discardPileSize: number;
  stockSize: number;
};

export type PrivateState = { hand: Card[] };

// Rank ordering helpers
export const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const RANK_INDEX: Record<Rank, number> = {
  A: 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6,
  '8': 7, '9': 8, '10': 9, J: 10, Q: 11, K: 12,
};
