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
  ERR_NO_OWN_MELD: "You need to have placed your own meld before you can lay off on others.",
  ERR_MELD_NOT_FOUND: "That meld no longer exists.",
  // ERR_INVALID_LAYOFF intentionally absent — server provides a specific reason in msg.
  ERR_ALREADY_MELDED: "You've already melded once this turn.",
  ERR_NOT_IN_ROOM: "You're not in a room.",
  ERR_ROOM_NOT_FOUND: "Room not found — check the code and try again.",
  ERR_ROOM_FULL: "That room is already full.",
  ERR_GAME_IN_PROGRESS: "A game is already in progress in that room.",
  ERR_WRONG_STATE: "The room isn't in the right state for that action.",
  ERR_NOT_HOST: "Only the host can do that.",
  ERR_NOT_ENOUGH_PLAYERS: "Not enough players to start.",
  ERR_ALREADY_IN_ROOM: "You're already in a room.",
  ERR_INVALID_NAME: "Name can't be empty.",
  ERR_INVALID_VARIANT: "Unknown game variant.",
  ERR_NOT_IMPLEMENTED: "That variant isn't implemented yet.",
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
  // Cache of Card objects by id — populated from private state so we can
  // render meld cards after they leave the hand.
  cardCache: Record<string, Card>;
  // Scores snapshot taken just before a hand ends, used to compute per-hand delta.
  prevScores: Record<string, number>;
  // All players' final hands at hand end, keyed by playerId (from wonHand event).
  finalHands: Record<string, Card[]>;

  setConnected(v: boolean): void;
  send(msg: C2S): void;
  handleMessage(msg: S2C): void;
  toggleSelect(cardId: string): void;
  clearSelect(): void;
  setHandOrder(ids: string[]): void;
  dismissError(): void;
  lookupCard(id: string): Card | undefined;
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
  cardCache: {},
  prevScores: {},
  finalHands: {},

  setConnected: (v) => set({ connected: v }),

  send: (msg) => {
    if (msg.t === "create" || msg.t === "join") {
      set({ pendingName: msg.name });
      sessionStorage.setItem("playerName", msg.name);
    }
    wsSend(msg);
  },

  handleMessage: (msg) => {
    switch (msg.t) {
      case "lobby":
        set((s) => {
          const myPlayerId =
            s.myPlayerId ??
            msg.players.find((p) => p.name === s.pendingName)?.id ??
            null;
          return {
            roomCode: msg.roomCode,
            variant: msg.variant,
            hostId: msg.hostId,
            lobbyPlayers: msg.players,
            sessionId: msg.sessionId,
            myPlayerId,
            lastError: null, // clear pre-join errors (e.g. invalid room code)
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

          if (msg.private === undefined) {
            return { publicState: msg.public, prevScores };
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
            prevScores,
          };
        });
        break;

      case "chat":
        set((s) => ({
          chatMessages: [
            ...s.chatMessages,
            { from: msg.from, text: msg.text },
          ],
        }));
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
        if (msg.kind === "wonHand" && msg.data !== undefined) {
          const d = msg.data as { finalHands?: Record<string, Card[]> };
          if (d.finalHands !== undefined) {
            set({ finalHands: d.finalHands });
          }
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
  lookupCard: (id) => _get().cardCache[id],
}));
