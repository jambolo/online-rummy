import type { Card, PlayerId, PrivateState, PublicState, Variant } from './cards.js';

export type LobbyPlayer = { id: PlayerId; name: string };

export type C2S =
  | { t: 'create'; variant: Variant; name: string }
  | { t: 'join'; roomCode: string; name: string; sessionId?: string }
  | { t: 'start' }
  | { t: 'draw'; from: 'stock' | 'discard' }
  | { t: 'drawFromPile'; cardId: string }
  | { t: 'meld'; cardIds: string[] }
  | { t: 'layoff'; meldId: string; cardId: string }
  | { t: 'discard'; cardId: string }
  | { t: 'knock' }
  | { t: 'chat'; text: string };

export type EventKind =
  | 'drew'
  | 'melded'
  | 'laidOff'
  | 'discarded'
  | 'wonHand'
  | 'forfeit'
  | 'gameOver'
  | 'gameStarted';

export type S2C =
  | { t: 'state'; public: PublicState; private?: PrivateState }
  | { t: 'lobby'; roomCode: string; variant: Variant; hostId: PlayerId; players: LobbyPlayer[]; sessionId: string }
  | { t: 'event'; kind: EventKind; playerId: string; data?: unknown }
  | { t: 'error'; code: string; msg: string }
  | { t: 'chat'; from: string; text: string };

// Convenience: cards present in drawFromPile response data
export type PileSlice = { taken: Card[] };
