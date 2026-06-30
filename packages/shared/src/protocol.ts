import type { PlayerId, PrivateState, PublicState, Variant } from './cards.js';

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
  | { t: 'knock'; melds?: string[][]; discardId: string } // gin only — melds declared at knock; discardId = face-down discard (rules.md A.2.4)
  | { t: 'ginLayoff'; ownMelds?: string[][]; layoffs: Array<{ cardId: string; meldId: string }> } // gin only — defender declares own melds + lays off onto knocker's melds (rules.md A.2.4)
  | { t: 'passUpcard' } // gin only — decline initial upcard offer (rules.md A.2.2)
  | { t: 'keepalive' } // idle keep-alive; server relays to other room players (Cloudflare drops idle WS)
  | { t: 'leave' } // leave the room; cancels the game and returns all players to the start page
  | { t: 'chat'; text: string };

export type EventKind =
  | 'drew'
  | 'melded'
  | 'laidOff'
  | 'discarded'
  | 'wonHand'
  | 'handCancelled' // gin only — stock-depletion cancelled hand (rules.md A.2.3)
  | 'playerLeft' // a player left the room via the leave button; game cancelled, all return to start page
  | 'playerDisconnected' // a player's socket dropped mid-game; grace window open, awaiting reconnect
  | 'playerReconnected' // a previously-disconnected player rebound their socket within the grace window
  | 'forfeit'
  | 'gameOver'
  | 'gameStarted';

export type S2C =
  | { t: 'state'; public: PublicState; private?: PrivateState }
  | { t: 'lobby'; roomCode: string; variant: Variant; hostId: PlayerId; players: LobbyPlayer[]; sessionId: string }
  | { t: 'event'; kind: EventKind; playerId: string; data?: unknown }
  | { t: 'error'; code: string; msg: string }
  | { t: 'keepalive'; from: PlayerId } // relayed idle keep-alive from another room player
  | { t: 'chat'; from: string; text: string };
