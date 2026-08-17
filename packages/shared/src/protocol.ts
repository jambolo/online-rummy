import type { Card, PlayerId, PrivateState, PublicState, Variant } from './cards.js';
import type { HouseRules } from './houseRules.js';

export type LobbyPlayer = { id: PlayerId; name: string };

export type C2S =
  | { t: 'create'; variant: Variant; name: string; houseRules?: HouseRules }
  | { t: 'setHouseRules'; houseRules: HouseRules } // host-only, lobby-only — replace the room's house-rule config
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
  | 'knocked' // gin only — a player knocked or went gin (rules.md A.2.4)
  | 'passedUpcard' // gin only — a player declined the initial upcard offer (rules.md A.2.2)
  | 'wonHand'
  | 'handCancelled' // gin only — stock-depletion cancelled hand (rules.md A.2.3)
  | 'playerLeft' // a player left the room via the leave button; game cancelled, all return to start page
  | 'playerDisconnected' // a player's socket dropped mid-game; grace window open, awaiting reconnect
  | 'playerReconnected' // a previously-disconnected player rebound their socket within the grace window
  | 'forfeit'
  | 'gameOver'
  | 'gameStarted';

// Action-event card payloads. Rule: an event names a card only if that card is already
// public — face-up on the table or in the discard pile. Cards that only the acting player
// has seen are never named.

// Data payload of the 'drew' event; 'pile' = 500 Rummy pile dive (rules.md A.4.4).
// `cards` = the cards taken: the upcard for `discard`, the dive's take for `pile`.
// Absent for `stock` — that card is private to the drawer.
export type DrewEventData = { from: 'stock' | 'discard' | 'pile'; cards?: Card[] };

// Data payload of the 'melded' event — the cards placed on the table.
export type MeldedEventData = { cards: Card[] };

// Data payload of the 'laidOff' event — the cards placed on the table. For the Gin
// defender's ginLayoff that is their own declared melds plus their layoffs onto the
// knocker's melds (rules.md A.2.4); all of them land face-up.
export type LaidOffEventData = { cards: Card[] };

// Data payload of the 'discarded' event — the card discarded.
export type DiscardedEventData = { card: Card };

// Data payload of the 'knocked' event — the meld groups the knocker declared, which go
// face-up on the table. The knock discard is face-down (rules.md A.2.4) and is never named.
export type KnockedEventData = { cards: Card[] };

export type S2C =
  | { t: 'state'; public: PublicState; private?: PrivateState }
  | {
      t: 'lobby';
      roomCode: string;
      variant: Variant;
      hostId: PlayerId;
      players: LobbyPlayer[];
      sessionId: string;
      houseRules: HouseRules;
    }
  | { t: 'event'; kind: EventKind; playerId: string; data?: unknown }
  | { t: 'error'; code: string; msg: string }
  | { t: 'keepalive'; from: PlayerId } // relayed idle keep-alive from another room player
  | { t: 'chat'; from: string; text: string };
