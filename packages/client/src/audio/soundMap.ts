import type { DrewEventData, PublicState, S2C } from '@online-rummy/shared';

// Pure decision table: S2C message -> sound id (or null for silence). No asset
// imports here so node-env unit tests can import it without Vite asset handling.

export type SoundId =
  | 'draw-stock'
  | 'draw-discard'
  | 'pile-dive'
  | 'meld'
  | 'layoff'
  | 'discard'
  | 'knock'
  | 'deal'
  | 'your-turn'
  | 'hand-over'
  | 'go-out'
  | 'gin'
  | 'undercut'
  | 'game-over'
  | 'hand-cancelled'
  | 'error'
  | 'chat'
  | 'player-joined'
  | 'disconnect'
  | 'reconnect'
  | 'forfeit';

export type SoundContext = {
  prevPublic: PublicState | null;
  myPlayerId: string | null;
  myName: string | null;
  prevLobbyCount: number;
};

// Subset of the wonHand event payload this module reads — same cast style as the
// store's 'wonHand' branch.
type WonHandData = {
  ginInfo?: { result: 'gin' | 'knock' | 'undercut' };
};

function soundForEvent(msg: Extract<S2C, { t: 'event' }>, ctx: SoundContext): SoundId | null {
  switch (msg.kind) {
    case 'drew': {
      const from = (msg.data as DrewEventData | undefined)?.from;
      if (from === 'discard') return 'draw-discard';
      if (from === 'pile') return 'pile-dive';
      return 'draw-stock'; // malformed/absent payload falls back to the common case
    }
    case 'melded':
      return 'meld';
    case 'laidOff':
      return 'layoff';
    case 'discarded':
      return 'discard';
    case 'knocked':
      return 'knock';
    case 'passedUpcard':
      return null; // deliberately silent
    case 'gameStarted':
      return 'deal';
    case 'gameOver':
      return 'game-over';
    case 'handCancelled':
      return 'hand-cancelled';
    case 'forfeit':
      return 'forfeit';
    case 'playerDisconnected':
      return 'disconnect';
    case 'playerReconnected':
      return 'reconnect';
    case 'playerLeft':
      return null;
    case 'wonHand': {
      // One sound only: gin/undercut outrank the generic win/lose outcomes.
      const d = msg.data as WonHandData | undefined;
      if (d?.ginInfo?.result === 'gin') return 'gin';
      if (d?.ginInfo?.result === 'undercut') return 'undercut';
      return msg.playerId === ctx.myPlayerId ? 'go-out' : 'hand-over';
    }
  }
}

// Error codes the store's 'error' branch swallows without showing any UI (stale
// sessionStorage from a previous game) — keep in sync with store.ts handleMessage.
const SWALLOWED_ERROR_CODES = new Set(['ERR_SESSION_NOT_FOUND', 'ERR_INVALID_SESSION', 'ERR_GAME_IN_PROGRESS']);

export function soundForMessage(msg: S2C, ctx: SoundContext): SoundId | null {
  switch (msg.t) {
    case 'state':
      // The prev-null and ended-phase guards suppress deal-time, reconnect and
      // hand-end false positives; a re-broadcast of unchanged state maps to null,
      // so bare state replays never fire sounds.
      return ctx.prevPublic !== null &&
        ctx.myPlayerId !== null &&
        ctx.prevPublic.phase !== 'ended' &&
        msg.public.phase !== 'ended' &&
        ctx.prevPublic.turnPlayerId !== ctx.myPlayerId &&
        msg.public.turnPlayerId === ctx.myPlayerId
        ? 'your-turn'
        : null;
    case 'chat':
      // Own messages stay silent. Known limitation: the chat frame carries only the
      // sender's display name and the server doesn't enforce name uniqueness, so a
      // same-named other player's messages are also silenced (same ambiguity as the
      // store's name→id last-seen lookup).
      return ctx.myName !== null && msg.from !== ctx.myName ? 'chat' : null;
    case 'error':
      // In-game only — pre-join errors are shown as a banner, no buzz. The stale-
      // session codes are swallowed silently by the store's error branch (no visible
      // UI), so they must not buzz either.
      return ctx.prevPublic !== null && !SWALLOWED_ERROR_CODES.has(msg.code) ? 'error' : null;
    case 'lobby':
      // No ding for your own arrival or the initial lobby snapshot.
      return msg.players.length > ctx.prevLobbyCount && ctx.prevLobbyCount > 0 ? 'player-joined' : null;
    case 'keepalive':
      return null;
    case 'event':
      return soundForEvent(msg, ctx);
  }
}
