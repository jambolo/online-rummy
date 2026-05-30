import { create } from "zustand";
import type { C2S, Card, LobbyPlayer, S2C, Variant } from "@online-rummy/shared";
import type { PublicState, PrivateState } from "@online-rummy/shared";
import { send as wsSend } from "./net/ws";

const ERROR_MESSAGES: Record<string, string> = {
  ERR_NOT_YOUR_TURN: "It's not your turn.",
  ERR_WRONG_PHASE: "That action isn't allowed in the current phase.",
  ERR_INVALID_MELD: "Those cards don't form a valid meld (need a set of 3–4 matching ranks, or a run of 3+ in the same suit).",
  ERR_CARD_NOT_IN_HAND: "That card is no longer in your hand.",
  ERR_DREW_DISCARD_REDISCARD: "You can't discard the same card you just drew from the discard pile.",
  ERR_MELD_NOT_FOUND: "That meld no longer exists.",
  // ERR_INVALID_LAYOFF intentionally absent — server provides a specific reason in msg.
  ERR_NOT_IN_ROOM: "You're not in a room.",
  ERR_ROOM_NOT_FOUND: "Room not found — check the code and try again.",
  ERR_ROOM_FULL: "That room is already full.",
  ERR_GAME_IN_PROGRESS: "A game is already in progress in that room.",
  ERR_WRONG_STATE: "The room isn't in the right state for that action.",
  ERR_NOT_HOST: "Only the host can do that.",
  ERR_NOT_ENOUGH_PLAYERS: "Not enough players to start.",
  ERR_ALREADY_IN_ROOM: "You're already in a room.",
  ERR_INVALID_NAME: "Name can't be empty.",
  ERR_INVALID_VARIANT: "Unknown game variation.",
  ERR_NOT_IMPLEMENTED: "That game variation isn't implemented yet.",
  ERR_MUST_USE_PILE_CARD: "You drew a card from the discard pile — you must meld or lay it off before discarding.",
  ERR_NO_LEGAL_DIVE: "You can't pile-dive that card — there's no legal meld or lay-off for it with your current hand.",
  ERR_CARD_NOT_IN_PILE: "That card isn't in the discard pile.",
  ERR_DISCARD_EMPTY: "The discard pile is empty.",
  ERR_STOCK_EMPTY: "The stock pile is empty.",
  ERR_INVALID_LAYOFF: "That card doesn't fit on the selected meld.",
  ERR_KNOCK_REQUIRES_DISCARD: "Select a card to discard face-down when knocking.",
  ERR_CANNOT_DISCARD_MELDED_CARD: "You can't discard a card that's in one of your declared melds.",
  ERR_RATE_LIMIT: "Sending messages too fast — slow down.",
  ERR_TOO_MANY_CONNECTIONS: "Too many connections from your network.",
  ERR_INVALID_JSON: "Malformed message sent to server.",
  ERR_INVALID_MSG: "Unrecognised message type.",
};

function friendlyError(code: string, raw: string): string {
  return ERROR_MESSAGES[code] ?? raw;
}

interface ChatMessage {
  from: string;
  text: string;
}

interface AppState {
  connected: boolean;

  // Identity — myPlayerId inferred from pendingName on first lobby msg
  myPlayerId: string | null;
  pendingName: string | null;
  sessionId: string | null;

  // Room (populated on lobby msg)
  roomCode: string | null;
  variant: Variant | null;
  hostId: string | null;
  lobbyPlayers: LobbyPlayer[];

  // Game (populated on state msg)
  publicState: PublicState | null;
  privateState: PrivateState | null;

  // UI
  selectedCardIds: string[];
  handOrder: string[];      // card IDs in display order (drag-to-reorder)
  chatMessages: ChatMessage[];
  lastError: string | null;
  // Informational banner shown on the Home page (e.g. after leaving a game). Not an error.
  notice: string | null;
  // Last time (ms epoch) a message attributable to each player id was received.
  // Fed by keepalive relays, events, and chat; used to flag a silently-dropped opponent.
  playerLastSeen: Record<string, number>;
  // Set when another player has been silent past the disconnect threshold; drives the
  // "probably disconnected — cancel the game?" prompt. null when no warning pending.
  disconnectWarning: { id: string; name: string } | null;
  // Cache of Card objects by id — populated from private state so we can
  // render meld cards after they leave the hand.
  cardCache: Record<string, Card>;
  // Scores snapshot taken just before a hand ends, used to compute per-hand delta.
  prevScores: Record<string, number>;
  // All players' final hands at hand end, keyed by playerId (from wonHand event).
  finalHands: Record<string, Card[]>;
  // Per-player melded cards credited to *placer* (not meld owner) with variant-correct
  // per-card points — used by ScoreOverlay for full hand-end breakdown.
  meldCredits: Record<string, { card: Card; pts: number }[]>;
  // Gin-specific hand result, populated from wonHand event data.
  ginInfo: { knockerId: string; knockerDeadwood: number; defenderDeadwood: number; result: 'gin' | 'knock' | 'undercut' } | null;
  // Gin: declared meld groups accumulated by the player before knocking (client-only).
  knockMelds: string[][];
  // Gin: defender's pending own meld declarations during 'layoff' phase (client-only).
  ginDefenderMelds: string[][];
  // Gin: defender's pending layoff declarations during 'layoff' phase (client-only).
  ginLayoffs: Array<{ cardId: string; meldId: string }>;
  // Per-player unmelded hand point totals (variant-correct ace value). Server-computed
  // to avoid client/server divergence over ace pts in 500 Rum.
  handDeadwood: Record<string, number>;
  // True from gameOver event until the next gameStarted event.
  isGameOver: boolean;
  // Gin (rules.md A.2.3): set when the server emits handCancelled (stock-depletion). Cleared on next gameStarted.
  handCancelled: boolean;

  setConnected(v: boolean): void;
  send(msg: C2S): void;
  handleMessage(msg: S2C): void;
  leaveGame(): void;
  checkDisconnects(): void;
  dismissDisconnectWarning(): void;
  toggleSelect(cardId: string): void;
  clearSelect(): void;
  setHandOrder(ids: string[]): void;
  dismissError(): void;
  dismissNotice(): void;
  lookupCard(id: string): Card | undefined;
  addKnockMeld(cardIds: string[]): void;
  removeKnockMeld(index: number): void;
  clearKnockMelds(): void;
  addGinDefenderMeld(cardIds: string[]): void;
  removeGinDefenderMeld(index: number): void;
  clearGinDefenderMelds(): void;
  addGinLayoff(cardId: string, meldId: string): void;
  removeGinLayoff(index: number): void;
  clearGinLayoffs(): void;
}

// A player whose messages we haven't seen for this long is treated as probably
// disconnected (server hasn't fired a clean forfeit, e.g. ungraceful network drop).
const DISCONNECT_TIMEOUT_MS = 5 * 60 * 1000;

// State reset when returning to the start page (leaving a game). Keeps `connected`
// and `notice` untouched — the caller sets `notice` to explain why they're home.
const HOME_RESET = {
  myPlayerId: null,
  pendingName: null,
  sessionId: null,
  roomCode: null,
  variant: null,
  hostId: null,
  lobbyPlayers: [],
  publicState: null,
  privateState: null,
  selectedCardIds: [],
  handOrder: [],
  chatMessages: [],
  lastError: null,
  cardCache: {},
  prevScores: {},
  finalHands: {},
  meldCredits: {},
  handDeadwood: {},
  ginInfo: null,
  knockMelds: [],
  ginDefenderMelds: [],
  ginLayoffs: [],
  isGameOver: false,
  handCancelled: false,
  playerLastSeen: {},
  disconnectWarning: null,
} satisfies Partial<AppState>;

function clearSessionStorage(): void {
  sessionStorage.removeItem("sessionId");
  sessionStorage.removeItem("roomCode");
  sessionStorage.removeItem("playerName");
}

export const useAppStore = create<AppState>()((set, _get) => ({
  connected: false,
  myPlayerId: null,
  pendingName: null,
  sessionId: null,
  roomCode: null,
  variant: null,
  hostId: null,
  lobbyPlayers: [],
  publicState: null,
  privateState: null,
  selectedCardIds: [],
  handOrder: [],
  chatMessages: [],
  lastError: null,
  notice: null,
  playerLastSeen: {},
  disconnectWarning: null,
  cardCache: {},
  prevScores: {},
  finalHands: {},
  meldCredits: {},
  handDeadwood: {},
  ginInfo: null,
  knockMelds: [],
  ginDefenderMelds: [],
  ginLayoffs: [],
  isGameOver: false,
  handCancelled: false,

  setConnected: (v) => set({ connected: v }),

  send: (msg) => {
    if (msg.t === "create" || msg.t === "join") {
      set({ pendingName: msg.name });
      sessionStorage.setItem("playerName", msg.name);
    }
    wsSend(msg);
  },

  // Player chose to leave: tell the server (which cancels the game and notifies the
  // others), then drop all room/game state and return to the start page.
  leaveGame: () => {
    wsSend({ t: "leave" });
    clearSessionStorage();
    set({ ...HOME_RESET, notice: "You left the game." });
  },

  handleMessage: (msg) => {
    switch (msg.t) {
      case "lobby":
        set((s) => {
          const myPlayerId =
            s.myPlayerId ??
            msg.players.find((p) => p.name === s.pendingName)?.id ??
            null;
          // Seed last-seen for newly-known players so they don't trip the disconnect
          // check before we've had a chance to hear from them.
          const now = Date.now();
          const playerLastSeen = { ...s.playerLastSeen };
          for (const p of msg.players) {
            if (playerLastSeen[p.id] === undefined) playerLastSeen[p.id] = now;
          }
          return {
            roomCode: msg.roomCode,
            variant: msg.variant,
            hostId: msg.hostId,
            lobbyPlayers: msg.players,
            sessionId: msg.sessionId,
            myPlayerId,
            playerLastSeen,
            lastError: null, // clear pre-join errors (e.g. invalid room code)
            notice: null,    // clear any "you left the game" banner once back in a room
          };
        });
        sessionStorage.setItem("sessionId", msg.sessionId);
        sessionStorage.setItem("roomCode", msg.roomCode);
        break;

      case "state":
        set((s) => {
          // Snapshot scores the moment a hand transitions to ended,
          // so the overlay can show per-hand delta.
          const handJustEnded =
            s.publicState?.phase !== "ended" && msg.public.phase === "ended";
          const prevScores = handJustEnded
            ? Object.fromEntries(
                s.publicState?.players.map((p) => [p.id, p.score]) ?? []
              )
            : s.prevScores;

          // Clear finalHands when a new hand starts (overlay disappears).
          const handJustStarted =
            s.publicState?.phase === "ended" && msg.public.phase !== "ended";
          const finalHands = handJustStarted ? {} : s.finalHands;
          const meldCredits = handJustStarted ? {} : s.meldCredits;
          const handDeadwood = handJustStarted ? {} : s.handDeadwood;
          const ginInfo = handJustStarted ? null : s.ginInfo;
          // Clear declared knock melds and gin layoffs at the start of each turn (draw phase).
          const knockMelds = msg.public.phase === 'draw' ? [] : s.knockMelds;
          const ginDefenderMelds = msg.public.phase === 'draw' ? [] : s.ginDefenderMelds;
          const ginLayoffs = msg.public.phase === 'draw' ? [] : s.ginLayoffs;

          // A state broadcast proves the server just processed a game action —
          // refresh last-seen for all non-self players. Active gameplay suppresses
          // keepalive pings (incoming state resets lastActivity), so without this,
          // playerLastSeen goes stale and triggers false disconnect warnings.
          // Silently-dropped players are handled by the server's forfeit path, which
          // sets their status to 'forfeited' (excluded from checkDisconnects) before
          // any subsequent state message arrives.
          const now = Date.now();
          const playerLastSeen = { ...s.playerLastSeen };
          const me = s.myPlayerId;
          for (const p of msg.public.players) {
            if (p.id !== me) playerLastSeen[p.id] = now;
          }

          if (msg.private === undefined) {
            return { publicState: msg.public, playerLastSeen, prevScores, finalHands, meldCredits, handDeadwood, ginInfo, knockMelds, ginDefenderMelds, ginLayoffs };
          }
          const newIds = new Set(msg.private.hand.map((c) => c.id));
          const kept = s.handOrder.filter((id) => newIds.has(id));
          const added = msg.private.hand
            .map((c) => c.id)
            .filter((id) => !s.handOrder.includes(id));
          // Update card cache with all hand cards so we can render
          // melded cards after they leave the hand.
          const cardCache = { ...s.cardCache };
          for (const card of msg.private.hand) {
            cardCache[card.id] = card;
          }
          return {
            publicState: msg.public,
            privateState: msg.private,
            handOrder: [...kept, ...added],
            selectedCardIds: s.selectedCardIds.filter((id) => newIds.has(id)),
            cardCache,
            playerLastSeen,
            prevScores,
            finalHands,
            meldCredits,
            handDeadwood,
            ginInfo,
            knockMelds,
            ginDefenderMelds,
            ginLayoffs,
          };
        });
        break;

      case "keepalive":
        // Relayed liveness ping from another room player — refresh their last-seen.
        set((s) => ({
          playerLastSeen: { ...s.playerLastSeen, [msg.from]: Date.now() },
        }));
        break;

      case "chat":
        set((s) => {
          // chat carries the sender's name; map it back to an id for last-seen.
          const fromId =
            s.publicState?.players.find((p) => p.name === msg.from)?.id ??
            s.lobbyPlayers.find((p) => p.name === msg.from)?.id;
          const playerLastSeen =
            fromId !== undefined
              ? { ...s.playerLastSeen, [fromId]: Date.now() }
              : s.playerLastSeen;
          return {
            chatMessages: [...s.chatMessages, { from: msg.from, text: msg.text }],
            playerLastSeen,
          };
        });
        break;

      case "error":
        if (
          msg.code === "ERR_SESSION_NOT_FOUND" ||
          msg.code === "ERR_INVALID_SESSION" ||
          msg.code === "ERR_GAME_IN_PROGRESS"
        ) {
          // Stale sessionStorage from a previous game — clear silently.
          sessionStorage.removeItem("sessionId");
          sessionStorage.removeItem("roomCode");
          sessionStorage.removeItem("playerName");
          break;
        }
        set({ lastError: friendlyError(msg.code, msg.msg) });
        break;

      case "event":
        // Any event is attributable to the player who triggered it → refresh last-seen.
        set((s) => ({
          playerLastSeen: { ...s.playerLastSeen, [msg.playerId]: Date.now() },
        }));
        if (msg.kind === "wonHand" && msg.data !== undefined) {
          const d = msg.data as {
            finalHands?: Record<string, Card[]>;
            meldCredits?: Record<string, { card: Card; pts: number }[]>;
            handDeadwood?: Record<string, number>;
            ginInfo?: { knockerId: string; knockerDeadwood: number; defenderDeadwood: number; result: 'gin' | 'knock' | 'undercut' };
          };
          set({
            finalHands: d.finalHands ?? {},
            meldCredits: d.meldCredits ?? {},
            handDeadwood: d.handDeadwood ?? {},
            ginInfo: d.ginInfo ?? null,
          });
        } else if (msg.kind === "gameOver") {
          set({ isGameOver: true, disconnectWarning: null });
        } else if (msg.kind === "forfeit") {
          // Server detected the player's socket close → any pending silent-drop warning
          // for them is now redundant.
          set((s) =>
            s.disconnectWarning?.id === msg.playerId ? { disconnectWarning: null } : {},
          );
        } else if (msg.kind === "handCancelled") {
          set({ handCancelled: true });
        } else if (msg.kind === "gameStarted") {
          set({ isGameOver: false, handCancelled: false, knockMelds: [], ginDefenderMelds: [], ginLayoffs: [] });
        } else if (msg.kind === "playerLeft") {
          // Another player left → game cancelled for everyone. Resolve their name from
          // current state before we reset, then return to the start page.
          set((s) => {
            const name =
              s.publicState?.players.find((p) => p.id === msg.playerId)?.name ??
              s.lobbyPlayers.find((p) => p.id === msg.playerId)?.name ??
              "A player";
            return {
              ...HOME_RESET,
              notice: `${name} left the game. The game has been cancelled.`,
            };
          });
          clearSessionStorage();
        }
        break;
    }
  },

  toggleSelect: (id) =>
    set((s) => ({
      selectedCardIds: s.selectedCardIds.includes(id)
        ? s.selectedCardIds.filter((x) => x !== id)
        : [...s.selectedCardIds, id],
    })),

  clearSelect: () => set({ selectedCardIds: [] }),
  setHandOrder: (ids) => set({ handOrder: ids }),
  dismissError: () => set({ lastError: null }),
  dismissNotice: () => set({ notice: null }),

  // Periodic sweep (driven by an interval in App): flag the first other player whose
  // messages we haven't seen for DISCONNECT_TIMEOUT_MS. Only one warning at a time.
  checkDisconnects: () => {
    const s = _get();
    if (s.disconnectWarning !== null) return;
    const me = s.myPlayerId;
    const others = s.publicState
      ? s.publicState.players.filter((p) => p.id !== me && p.status !== "forfeited")
      : s.lobbyPlayers.filter((p) => p.id !== me);
    const now = Date.now();
    for (const p of others) {
      const seen = s.playerLastSeen[p.id];
      if (seen !== undefined && now - seen > DISCONNECT_TIMEOUT_MS) {
        set({ disconnectWarning: { id: p.id, name: p.name } });
        return;
      }
    }
  },

  // "Keep waiting" — snooze the timer for that player so the prompt clears and would
  // only re-appear after another full interval of silence.
  dismissDisconnectWarning: () => {
    const w = _get().disconnectWarning;
    if (w === null) return;
    set((s) => ({
      disconnectWarning: null,
      playerLastSeen: { ...s.playerLastSeen, [w.id]: Date.now() },
    }));
  },
  lookupCard: (id) => _get().cardCache[id],
  addKnockMeld: (cardIds) =>
    set((s) => ({ knockMelds: [...s.knockMelds, cardIds], selectedCardIds: [] })),
  removeKnockMeld: (index) =>
    set((s) => ({ knockMelds: s.knockMelds.filter((_, i) => i !== index) })),
  clearKnockMelds: () => set({ knockMelds: [] }),
  addGinDefenderMeld: (cardIds) =>
    set((s) => ({ ginDefenderMelds: [...s.ginDefenderMelds, cardIds], selectedCardIds: [] })),
  removeGinDefenderMeld: (index) =>
    set((s) => ({ ginDefenderMelds: s.ginDefenderMelds.filter((_, i) => i !== index) })),
  clearGinDefenderMelds: () => set({ ginDefenderMelds: [] }),
  addGinLayoff: (cardId, meldId) =>
    set((s) => ({ ginLayoffs: [...s.ginLayoffs, { cardId, meldId }], selectedCardIds: [] })),
  removeGinLayoff: (index) =>
    set((s) => ({ ginLayoffs: s.ginLayoffs.filter((_, i) => i !== index) })),
  clearGinLayoffs: () => set({ ginLayoffs: [] }),
}));
