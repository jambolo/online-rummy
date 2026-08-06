import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage, Server } from 'node:http';
import type {
  C2S,
  Card,
  DiscardedEventData,
  DrewEventData,
  KnockedEventData,
  LaidOffEventData,
  MeldedEventData,
  S2C,
  PublicState,
  HouseRules,
  Variant,
} from '@online-rummy/shared';
import { HOUSE_RULE_DEFS, canonicalHouseRules } from '@online-rummy/shared';
import {
  createRoom,
  getRoom,
  getRoomBySession,
  deleteRoom,
  addPlayer,
  removePlayer,
  getPlayerBySession,
  activePlayers,
  variantLimits,
  type Player,
  type Room,
} from './room.js';
import { makeSessionId, signSessionId, verifySessionId } from './session.js';
import { cryptoRNG } from './rng.js';
import { getVariant, isVariant } from './engine/variants/index.js';
import { applyAction } from './engine/dispatch.js';
import type { GameState, GamePlayer } from './engine/types.js';

// --- Module-level state (single-process singleton) ---
let _secret = '';

const idleTimers = new Map<string, ReturnType<typeof setTimeout>>(); // roomCode → timer
const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>(); // playerId → timer

type SocketContext = { socketId: string; player: Player | null; room: Room | null };
const socketContexts = new Map<WebSocket, SocketContext>();

const ipConnections = new Map<string, Set<string>>(); // ip → Set<socketId>

const MAX_CONNECTIONS_PER_IP = 10;
const MAX_MSG_RATE = 20; // per second
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const LOBBY_RECONNECT_MS = 60 * 1000;
// Grace window after a mid-game socket drop before the player is forfeited. Lets a
// flaky network / reloaded tab rebind via join+sessionId and resume the same hand.
const GAME_RECONNECT_MS = 60 * 1000;

// --- Wire helpers ---

function send(ws: WebSocket, msg: S2C): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function sendError(ws: WebSocket, code: string, msg: string): void {
  console.log(`[ws] error → client  code=${code}  msg=${msg}`);
  send(ws, { t: 'error', code, msg });
}

function broadcast(room: Room, msg: S2C, exceptId?: string): void {
  for (const p of room.players) {
    if (p.socket !== null && p.id !== exceptId) send(p.socket, msg);
  }
}

// Each player gets their own signed sessionId so they can use it for reconnect.
function sendLobby(ws: WebSocket, room: Room, player: Player): void {
  send(ws, {
    t: 'lobby',
    roomCode: room.code,
    variant: room.variant,
    hostId: room.hostId,
    players: room.players.map((p) => ({ id: p.id, name: p.name })),
    sessionId: signSessionId(player.sessionId, _secret),
    houseRules: room.houseRules,
  });
}

function broadcastLobby(room: Room): void {
  for (const p of room.players) {
    if (p.socket !== null) sendLobby(p.socket, room, p);
  }
}

// --- Engine helpers ---

function engineError(err: unknown): { code: string; msg: string } {
  if (err instanceof Error) {
    const code = err.message.split(':')[0] ?? 'ERR_UNKNOWN';
    return { code, msg: err.message };
  }
  return { code: 'ERR_UNKNOWN', msg: 'Unknown error' };
}

// NS-8 (T-NS8-2): validate a client house-rule map against the registry for `variant`.
// Returns null when valid, else the wire error to send. Server-authoritative [S9]; a rule
// at its canonical value is always allowed, only enabling an unsupported rule is rejected [E9].
function validateHouseRules(variant: Variant, hr: HouseRules): { code: string; msg: string } | null {
  const defs = HOUSE_RULE_DEFS[variant];
  for (const [id, value] of Object.entries(hr)) {
    if (value === undefined) continue;
    const def = defs.find((d) => d.id === id);
    if (def === undefined) return { code: 'ERR_INVALID_HOUSE_RULE', msg: `Unknown house rule: ${id}` };
    const typeOk = def.kind === 'toggle' ? typeof value === 'boolean' : (def.choices ?? []).some((c) => c.value === value);
    if (!typeOk) return { code: 'ERR_INVALID_HOUSE_RULE', msg: `Invalid value for house rule: ${id}` };
    if (value !== def.canonical && !def.supported) {
      return { code: 'ERR_UNSUPPORTED_HOUSE_RULE', msg: `House rule not yet available: ${id}` };
    }
  }
  return null;
}

// Guard: require an in-progress game tied to a player + room. Returns narrowed
// context, or sends an ERR_* and returns null (caller must check + break).
type PlayingCtx = { player: Player; room: Room; state: GameState };
function requirePlaying(ws: WebSocket, ctx: SocketContext): PlayingCtx | null {
  if (ctx.player === null || ctx.room === null) {
    sendError(ws, 'ERR_NOT_IN_ROOM', 'Not in a room');
    return null;
  }
  if (ctx.room.status !== 'playing' || ctx.room.gameState === null) {
    sendError(ws, 'ERR_WRONG_STATE', 'Game not in progress');
    return null;
  }
  return { player: ctx.player, room: ctx.room, state: ctx.room.gameState };
}

function buildPublicState(room: Room, state: GameState): PublicState {
  return {
    roomId: room.code,
    variant: state.variant,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      handCount: p.hand.length,
      melds: p.melds.map((m) => ({
        ...m,
        cards: m.cardIds.map((id) => state.cardRegistry.get(id)).filter((c): c is Card => c !== undefined),
      })),
      score: p.score,
      status: p.status,
    })),
    turnPlayerId: state.turnPlayerId,
    phase: state.phase,
    discardTop: state.discardPile[state.discardPile.length - 1] ?? null,
    discardPileSize: state.discardPile.length,
    discardPile: [...state.discardPile],
    stockSize: state.stock.length,
    meldedBy: Object.fromEntries(state.meldedBy),
    variantPublic: buildVariantPublic(state),
    houseRules: state.houseRules,
  };
}

// Project the variant-specific state pocket into a public-state slice. Discriminated
// by variant so the client can narrow on it without seeing fields from other variants.
function buildVariantPublic(state: GameState): PublicState['variantPublic'] {
  switch (state.variant) {
    case 'basic':
      return { variant: 'basic', data: {} };
    case 'rum500':
      return { variant: 'rum500', data: { mustMeldCardId: state.variantState.mustMeldCardId } };
    case 'gin':
      return { variant: 'gin', data: { ginKnockerId: state.variantState.ginKnockerId } };
  }
}

// Send public state to all; private hand only to actingPlayerId.
function broadcastState(room: Room, state: GameState, actingPlayerId: string): void {
  const pub = buildPublicState(room, state);
  for (const p of room.players) {
    if (p.socket === null) continue;
    if (p.id === actingPlayerId) {
      const gp = state.players.find((sp) => sp.id === p.id);
      send(p.socket, { t: 'state', public: pub, private: { hand: gp?.hand ?? [] } });
    } else {
      send(p.socket, { t: 'state', public: pub });
    }
  }
}

// Send public state + each player's own private hand to every connected player.
function broadcastStateAll(room: Room, state: GameState): void {
  const pub = buildPublicState(room, state);
  for (const p of room.players) {
    if (p.socket === null) continue;
    const gp = state.players.find((sp) => sp.id === p.id);
    send(p.socket, { t: 'state', public: pub, private: { hand: gp?.hand ?? [] } });
  }
}

// Next active player in turn order after afterId (wraps around).
function nextActivePlayer(state: GameState, afterId: string): GamePlayer | undefined {
  const idx = state.players.findIndex((p) => p.id === afterId);
  if (idx === -1) return undefined;
  const total = state.players.length;
  for (let i = 1; i < total; i++) {
    const candidate = state.players[(idx + i) % total];
    if (candidate?.status === 'active') return candidate;
  }
  return undefined;
}

// Gin (rules.md A.2.3) stock-depletion cancel: no scoring, no winner. Mark room ended
// so the host can re-deal with the same dealer.
function handleHandCancelled(room: Room, state: GameState): void {
  room.status = 'ended';
  state.phase = 'ended';
  broadcast(room, { t: 'event', kind: 'handCancelled', playerId: state.turnPlayerId });
  broadcastStateAll(room, state);
}

// Score completed hand, update cumulative scores, broadcast events + final state.
function handleHandEnd(room: Room, state: GameState): void {
  const engine = getVariant(room.variant);
  const scores = engine.scoreHand(state);
  for (const gp of state.players) {
    const pts = scores.get(gp.id) ?? 0;
    gp.score += pts;
    const sheet = state.scoreSheet.get(gp.id) ?? [];
    sheet.push(pts);
    state.scoreSheet.set(gp.id, sheet);
  }

  const winnerId = engine.winnerForHand(state, scores);
  if (winnerId !== null) {
    const data = engine.handEndPayload(state, scores);
    broadcast(room, { t: 'event', kind: 'wonHand', playerId: winnerId, data });
  }

  if (engine.isGameOver(state.scoreSheet)) {
    room.status = 'ended';
    // rules.md A.4.7: highest cumulative wins at crossover (handles multi-crossover for 500 Rummy).
    const gameWinner = state.players.length > 0 ? state.players.reduce((a, b) => (b.score > a.score ? b : a)) : undefined;
    if (gameWinner !== undefined) {
      broadcast(room, { t: 'event', kind: 'gameOver', playerId: gameWinner.id });
    }
  } else {
    // Hand done but game not over; host must trigger a new hand.
    room.status = 'ended';
  }

  broadcastStateAll(room, state);
}

function getIp(req: IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = Array.isArray(fwd) ? fwd[0] : fwd;
  return first?.split(',')[0]?.trim() ?? req.socket.remoteAddress ?? '0.0.0.0';
}

// --- Idle timer ---

function startIdleTimer(roomCode: string): void {
  clearIdleTimer(roomCode);
  idleTimers.set(
    roomCode,
    setTimeout(() => {
      deleteRoom(roomCode);
      idleTimers.delete(roomCode);
    }, IDLE_TIMEOUT_MS),
  );
}

function clearIdleTimer(roomCode: string): void {
  const t = idleTimers.get(roomCode);
  if (t !== undefined) {
    clearTimeout(t);
    idleTimers.delete(roomCode);
  }
}

function maybeStartIdleTimer(room: Room): void {
  if (!room.players.some((p) => p.socket !== null)) startIdleTimer(room.code);
}

// --- Message handlers ---

// Map a successful game action to its broadcast event. Emitted before the state
// broadcast so clients can key sounds/animations off events without diffing state
// (see docs/client-server-protocol.md 'event').
type GameActionC2S = Extract<
  C2S,
  { t: 'draw' | 'drawFromPile' | 'meld' | 'layoff' | 'discard' | 'passUpcard' | 'knock' | 'ginLayoff' }
>;
// cardRegistry holds every card for the whole game, so ids still resolve after the action
// has moved them between hand, melds and pile.
function resolveCards(state: GameState, ids: string[]): Card[] {
  return ids.map((id) => state.cardRegistry.get(id)).filter((c): c is Card => c !== undefined);
}

// Card payloads name only cards that are already public — the face-up discard pile and
// cards placed on the table. A stock draw and the Gin knock's face-down discard are never
// named (rules.md A.2.4). `pileBefore` is the discard pile as it stood before the action:
// a draw removes what it takes, so the post-action state can no longer name it.
function actionEvent(msg: GameActionC2S, playerId: string, state: GameState, pileBefore: Card[]): S2C {
  switch (msg.t) {
    case 'draw': {
      // Inbound C2S is cast without runtime validation and the engines treat any
      // non-'discard' value as a stock draw — normalize rather than echoing
      // unvalidated client input into a room-wide broadcast.
      const from = msg.from === 'discard' ? 'discard' : 'stock';
      const upcard = pileBefore[pileBefore.length - 1];
      const data: DrewEventData = from === 'discard' && upcard !== undefined ? { from, cards: [upcard] } : { from };
      return { t: 'event', kind: 'drew', playerId, data };
    }
    case 'drawFromPile': {
      // A dive takes the selected card and everything above it (rules.md A.4.4).
      const idx = pileBefore.findIndex((c) => c.id === msg.cardId);
      const cards = idx === -1 ? [] : pileBefore.slice(idx);
      return { t: 'event', kind: 'drew', playerId, data: { from: 'pile', cards } satisfies DrewEventData };
    }
    case 'meld':
      return {
        t: 'event',
        kind: 'melded',
        playerId,
        data: { cards: resolveCards(state, msg.cardIds) } satisfies MeldedEventData,
      };
    case 'layoff':
      return {
        t: 'event',
        kind: 'laidOff',
        playerId,
        data: { cards: resolveCards(state, [msg.cardId]) } satisfies LaidOffEventData,
      };
    case 'ginLayoff': {
      // The defender's own declared melds and their layoffs all land face-up (rules.md A.2.4).
      const ids = [...(msg.ownMelds ?? []).flat(), ...msg.layoffs.map((l) => l.cardId)];
      return {
        t: 'event',
        kind: 'laidOff',
        playerId,
        data: { cards: resolveCards(state, ids) } satisfies LaidOffEventData,
      };
    }
    case 'discard': {
      const card = state.cardRegistry.get(msg.cardId);
      if (card === undefined) return { t: 'event', kind: 'discarded', playerId };
      return { t: 'event', kind: 'discarded', playerId, data: { card } satisfies DiscardedEventData };
    }
    case 'knock':
      // Declared melds only — msg.discardId is the face-down knock discard (rules.md A.2.4).
      return {
        t: 'event',
        kind: 'knocked',
        playerId,
        data: { cards: resolveCards(state, (msg.melds ?? []).flat()) } satisfies KnockedEventData,
      };
    case 'passUpcard':
      return { t: 'event', kind: 'passedUpcard', playerId };
  }
}

function handleMessage(ws: WebSocket, ctx: SocketContext, msg: C2S): void {
  switch (msg.t) {
    case 'create': {
      if (ctx.room !== null) {
        sendError(ws, 'ERR_ALREADY_IN_ROOM', 'Already in a room');
        return;
      }
      if (!isVariant(msg.variant)) {
        sendError(ws, 'ERR_INVALID_VARIANT', 'Invalid variant');
        return;
      }
      const name = msg.name.trim().slice(0, 20);
      if (name.length === 0) {
        sendError(ws, 'ERR_INVALID_NAME', 'Name cannot be empty');
        return;
      }
      if (msg.houseRules !== undefined) {
        const hrErr = validateHouseRules(msg.variant, msg.houseRules);
        if (hrErr !== null) {
          sendError(ws, hrErr.code, hrErr.msg);
          return;
        }
      }
      const player: Player = {
        id: randomUUID(),
        name,
        sessionId: makeSessionId(),
        socket: ws,
        status: 'active',
      };
      const room = createRoom(msg.variant, player);
      if (msg.houseRules !== undefined) {
        room.houseRules = { ...canonicalHouseRules(msg.variant), ...msg.houseRules };
      }
      ctx.player = player;
      ctx.room = room;
      broadcastLobby(room);
      break;
    }

    case 'join': {
      if (ctx.room !== null) {
        sendError(ws, 'ERR_ALREADY_IN_ROOM', 'Already in a room');
        return;
      }
      const { roomCode, name, sessionId: signedSid } = msg;
      const normalizedCode = roomCode.toUpperCase();

      // Reconnect path
      if (signedSid !== undefined) {
        const rawId = verifySessionId(signedSid, _secret);
        if (rawId === null) {
          sendError(ws, 'ERR_INVALID_SESSION', 'Invalid session ID');
          return;
        }
        const reconRoom = getRoomBySession(rawId);
        if (reconRoom === undefined || reconRoom.code !== normalizedCode) {
          sendError(ws, 'ERR_SESSION_NOT_FOUND', 'Session not found in room');
          return;
        }
        const reconPlayer = getPlayerBySession(reconRoom, rawId);
        if (reconPlayer === undefined) {
          sendError(ws, 'ERR_SESSION_NOT_FOUND', 'Player not found');
          return;
        }
        // Reconnect is only possible while the room is live and the player is still in.
        // A re-deal drops socketless players and a grace-expiry forfeit eliminates them;
        // either way there's nothing to resume.
        if (reconRoom.status === 'ended' || reconPlayer.status === 'forfeited') {
          sendError(ws, 'ERR_GAME_IN_PROGRESS', 'Cannot reconnect — the game has ended');
          return;
        }
        const timer = reconnectTimers.get(reconPlayer.id);
        if (timer !== undefined) {
          clearTimeout(timer);
          reconnectTimers.delete(reconPlayer.id);
        }
        reconPlayer.socket = ws;
        ctx.player = reconPlayer;
        ctx.room = reconRoom;
        clearIdleTimer(reconRoom.code);

        if (reconRoom.status === 'playing' && reconRoom.gameState !== null) {
          // Mid-game reconnect: restore identity first (the lobby payload carries sessionId +
          // roster + host so a reloaded tab can resolve "me"), tell the opponent the player is
          // back so their waiting cue clears, then resend full state to everyone.
          sendLobby(ws, reconRoom, reconPlayer);
          broadcast(reconRoom, { t: 'event', kind: 'playerReconnected', playerId: reconPlayer.id }, reconPlayer.id);
          broadcastStateAll(reconRoom, reconRoom.gameState);
        } else {
          broadcastLobby(reconRoom);
        }
        return;
      }

      // Normal join
      const room = getRoom(normalizedCode);
      if (room === undefined) {
        sendError(ws, 'ERR_ROOM_NOT_FOUND', 'Room not found');
        return;
      }
      if (room.status !== 'lobby') {
        sendError(ws, 'ERR_GAME_IN_PROGRESS', 'Game already in progress');
        return;
      }
      const limits = variantLimits(room.variant);
      if (room.players.length >= limits.max) {
        sendError(ws, 'ERR_ROOM_FULL', 'Room is full');
        return;
      }
      const trimmed = name.trim().slice(0, 20);
      if (trimmed.length === 0) {
        sendError(ws, 'ERR_INVALID_NAME', 'Name cannot be empty');
        return;
      }
      const player: Player = {
        id: randomUUID(),
        name: trimmed,
        sessionId: makeSessionId(),
        socket: ws,
        status: 'active',
      };
      addPlayer(room, player);
      ctx.player = player;
      ctx.room = room;
      clearIdleTimer(room.code);
      broadcastLobby(room);
      break;
    }

    case 'start': {
      const { player, room } = ctx;
      if (player === null || room === null) {
        sendError(ws, 'ERR_NOT_IN_ROOM', 'Not in a room');
        return;
      }
      if (room.hostId !== player.id) {
        sendError(ws, 'ERR_NOT_HOST', 'Only the host can start');
        return;
      }
      const engine = getVariant(room.variant);

      if (room.status === 'lobby') {
        const { min } = variantLimits(room.variant);
        if (room.players.length < min) {
          sendError(ws, 'ERR_NOT_ENOUGH_PLAYERS', `Need at least ${min} players`);
          return;
        }
        room.status = 'playing';
        room.gameState = engine.createGame(
          room.code,
          room.players.map((p) => ({ id: p.id, name: p.name })),
          cryptoRNG,
          undefined,
          room.houseRules,
        );
        broadcast(room, { t: 'event', kind: 'gameStarted', playerId: player.id });
        broadcastStateAll(room, room.gameState);
      } else if (room.status === 'ended') {
        const oldState = room.gameState;
        // Drop players who disconnected during the previous hand. Clear any pending grace
        // timer first so it can't fire on an already-removed player.
        for (const p of [...room.players]) {
          if (p.socket === null) {
            const gt = reconnectTimers.get(p.id);
            if (gt !== undefined) {
              clearTimeout(gt);
              reconnectTimers.delete(p.id);
            }
            removePlayer(room, p.id);
          }
        }
        // Reset survivors to active for the new hand.
        for (const p of room.players) p.status = 'active';
        const { min } = variantLimits(room.variant);
        if (room.players.length < min) {
          sendError(ws, 'ERR_NOT_ENOUGH_PLAYERS', `Need at least ${min} players`);
          return;
        }
        // First-player rotation owned by the variant — gin cancelled = same dealer,
        // gin normal = loser plays first, basic/500 = clockwise.
        const newPlayers = room.players.map((p) => ({ id: p.id, name: p.name }));
        const nextFirstIndex = engine.nextFirstPlayerIndex(oldState, newPlayers);
        room.status = 'playing';
        const newState = engine.createGame(room.code, newPlayers, cryptoRNG, nextFirstIndex, room.houseRules);
        // "New Hand" carries scores forward; "Play Again" after game over starts fresh.
        // Both arrive as the same `start` message, so re-derive which one this is.
        const gameWasOver = oldState !== null && engine.isGameOver(oldState.scoreSheet);
        if (!gameWasOver) {
          // Carry forward cumulative scores and score history.
          for (const gp of newState.players) {
            const prev = oldState?.players.find((op) => op.id === gp.id);
            if (prev !== undefined) {
              gp.score = prev.score;
              newState.scoreSheet.set(gp.id, oldState?.scoreSheet.get(gp.id) ?? []);
            }
          }
        }
        room.gameState = newState;
        broadcast(room, { t: 'event', kind: 'gameStarted', playerId: player.id });
        broadcastStateAll(room, newState);
      } else {
        sendError(ws, 'ERR_WRONG_STATE', 'Room not in lobby or ended state');
      }
      break;
    }

    case 'setHouseRules': {
      const { player, room } = ctx;
      if (player === null || room === null) {
        sendError(ws, 'ERR_NOT_IN_ROOM', 'Not in a room');
        return;
      }
      if (room.hostId !== player.id) {
        sendError(ws, 'ERR_NOT_HOST', 'Only the host can change house rules');
        return;
      }
      if (room.status !== 'lobby') {
        sendError(ws, 'ERR_WRONG_STATE', 'House rules can only be changed in the lobby');
        return;
      }
      const hrErr = validateHouseRules(room.variant, msg.houseRules);
      if (hrErr !== null) {
        sendError(ws, hrErr.code, hrErr.msg);
        return;
      }
      room.houseRules = { ...canonicalHouseRules(room.variant), ...msg.houseRules };
      broadcastLobby(room);
      break;
    }

    case 'chat': {
      const { player, room } = ctx;
      if (player === null || room === null) {
        sendError(ws, 'ERR_NOT_IN_ROOM', 'Not in a room');
        return;
      }
      const text = msg.text.trim().slice(0, 200);
      if (text.length === 0) return;
      broadcast(room, { t: 'chat', from: player.name, text });
      break;
    }

    case 'keepalive': {
      // Receiving this frame already kept the sender's socket warm. Relay to the
      // other room players so their sockets stay warm too (Cloudflare drops idle WS).
      const { player, room } = ctx;
      if (player === null || room === null) return;
      broadcast(room, { t: 'keepalive', from: player.id }, player.id);
      break;
    }

    case 'leave': {
      const { player, room } = ctx;
      if (player === null || room === null) {
        sendError(ws, 'ERR_NOT_IN_ROOM', 'Not in a room');
        return;
      }
      // Tell the other players this player left and the game is cancelled.
      broadcast(room, { t: 'event', kind: 'playerLeft', playerId: player.id }, player.id);
      // Cancel the game and free everyone: cancel timers, detach each player's socket
      // context (so they can immediately create/join again), then tear down the room.
      clearIdleTimer(room.code);
      for (const p of room.players) {
        const t = reconnectTimers.get(p.id);
        if (t !== undefined) {
          clearTimeout(t);
          reconnectTimers.delete(p.id);
        }
        if (p.socket !== null) {
          const pctx = socketContexts.get(p.socket);
          if (pctx !== undefined) {
            pctx.player = null;
            pctx.room = null;
          }
        }
      }
      deleteRoom(room.code);
      break;
    }

    case 'draw':
    case 'drawFromPile':
    case 'meld':
    case 'layoff':
    case 'discard':
    case 'passUpcard':
    case 'knock':
    case 'ginLayoff': {
      const p = requirePlaying(ws, ctx);
      if (p === null) break;
      try {
        // Snapshot the pile before the action so a draw event can name the cards taken.
        const takesFromPile = msg.t === 'drawFromPile' || (msg.t === 'draw' && msg.from === 'discard');
        const pileBefore = takesFromPile ? [...p.state.discardPile] : [];
        const result = applyAction(p.state, p.player.id, msg);
        if (result.kind !== 'noop') broadcast(p.room, actionEvent(msg, p.player.id, p.state, pileBefore));
        switch (result.kind) {
          case 'state':
            broadcastState(p.room, p.state, p.player.id);
            break;
          case 'stateAll':
            broadcastStateAll(p.room, p.state);
            break;
          case 'handEnded':
            handleHandEnd(p.room, p.state);
            break;
          case 'handCancelled':
            handleHandCancelled(p.room, p.state);
            break;
          case 'noop':
            break;
        }
      } catch (err) {
        const { code, msg: m } = engineError(err);
        sendError(ws, code, m);
      }
      break;
    }
  }
}

// --- Disconnect ---

// Forfeit a player (rules.md disconnect): drop their hand + melds, advance the turn if
// it was theirs, broadcast forfeit, and end the game if ≤1 active player remains. Used by
// the grace-timer expiry path and guarded so a re-deal / hand-end racing the timer is a no-op.
function forfeitPlayer(room: Room, player: Player): void {
  if (player.status === 'forfeited' || room.status !== 'playing') return;
  player.status = 'forfeited';

  // Sync engine game state for the forfeit.
  const gs = room.gameState;
  if (gs !== null) {
    const gp = gs.players.find((p) => p.id === player.id);
    if (gp !== undefined) {
      gp.status = 'forfeited';
      // rules.md disconnect: hand + melds removed from play, NOT returned to stock.
      gp.hand = [];
      gp.melds = [];
    }

    // If it was the forfeiting player's turn, advance to next active player.
    if (gs.turnPlayerId === player.id && gs.phase !== 'ended') {
      const next = nextActivePlayer(gs, player.id);
      if (next !== undefined) {
        gs.turnPlayerId = next.id;
        gs.phase = 'draw';
        gs.drewFromDiscardId = null;
      } else {
        gs.phase = 'ended';
      }
    }
  }

  broadcast(room, { t: 'event', kind: 'forfeit', playerId: player.id });

  const still = activePlayers(room);
  if (still.length <= 1) {
    room.status = 'ended';
    if (gs !== null) gs.phase = 'ended';
    const winner = still[0];
    if (winner !== undefined) broadcast(room, { t: 'event', kind: 'gameOver', playerId: winner.id });
  } else if (gs !== null) {
    broadcastStateAll(room, gs);
  }

  maybeStartIdleTimer(room);
}

function handleDisconnect(ws: WebSocket): void {
  const ctx = socketContexts.get(ws);
  socketContexts.delete(ws);
  if (ctx === undefined || ctx.player === null || ctx.room === null) return;
  const { player, room } = ctx;

  // A reconnect may have already rebound this player to a newer socket; ignore the
  // stale close so it doesn't clobber the live socket or double-arm a grace timer.
  if (player.socket !== null && player.socket !== ws) return;

  player.socket = null;

  if (room.status === 'lobby') {
    const timer = setTimeout(() => {
      reconnectTimers.delete(player.id);
      removePlayer(room, player.id);
      if (getRoom(room.code) !== undefined) broadcastLobby(room);
      maybeStartIdleTimer(room);
    }, LOBBY_RECONNECT_MS);
    reconnectTimers.set(player.id, timer);
    maybeStartIdleTimer(room);
  } else if (room.status === 'playing' && player.status === 'active') {
    // Don't forfeit immediately — open a grace window so a flaky connection / reloaded
    // tab can rebind via join+sessionId and resume the same hand. Tell the opponent so
    // they see a "waiting for reconnect" cue instead of a frozen table.
    broadcast(room, { t: 'event', kind: 'playerDisconnected', playerId: player.id });
    const timer = setTimeout(() => {
      reconnectTimers.delete(player.id);
      forfeitPlayer(room, player);
    }, GAME_RECONNECT_MS);
    reconnectTimers.set(player.id, timer);
    maybeStartIdleTimer(room);
  }
}

// --- Entry point ---

export function initWS(httpServer: Server, secret: string, allowedOrigins: Set<string>): void {
  _secret = secret;
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const origin = req.headers.origin ?? '';
    if (!allowedOrigins.has(origin)) {
      console.log(`[ws] upgrade rejected  origin="${origin}"  url=${req.url ?? '/'}`);
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    console.log(`[ws] upgrade accepted  origin="${origin}"`);
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const socketId = randomUUID();
    const ip = getIp(req);

    // Per-IP connection cap
    let ipSet = ipConnections.get(ip);
    if (ipSet === undefined) {
      ipSet = new Set();
      ipConnections.set(ip, ipSet);
    }
    if (ipSet.size >= MAX_CONNECTIONS_PER_IP) {
      sendError(ws, 'ERR_TOO_MANY_CONNECTIONS', 'Connection limit exceeded');
      ws.close(1008, 'Too many connections');
      return;
    }
    ipSet.add(socketId);

    const ctx: SocketContext = { socketId, player: null, room: null };
    socketContexts.set(ws, ctx);

    // Per-socket rate limiter
    let msgCount = 0;
    const rateLimiter = setInterval(() => {
      msgCount = 0;
    }, 1000);

    ws.on('message', (data) => {
      if (++msgCount > MAX_MSG_RATE) {
        sendError(ws, 'ERR_RATE_LIMIT', 'Message rate exceeded');
        return;
      }
      const raw = Buffer.isBuffer(data)
        ? data.toString('utf8')
        : Array.isArray(data)
          ? Buffer.concat(data as Buffer[]).toString('utf8')
          : Buffer.from(data as ArrayBuffer).toString('utf8');
      let msg: C2S;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null || !('t' in parsed)) {
          sendError(ws, 'ERR_INVALID_MSG', 'Message must be an object with field t');
          return;
        }
        msg = parsed as C2S;
      } catch {
        sendError(ws, 'ERR_INVALID_JSON', 'Invalid JSON');
        return;
      }
      handleMessage(ws, ctx, msg);
    });

    ws.on('close', () => {
      const who = ctx.player ? `${ctx.player.name}(${ctx.room?.code ?? '?'})` : `anon`;
      console.log(`[ws] close  ${who}`);
      clearInterval(rateLimiter);
      const set = ipConnections.get(ip);
      if (set !== undefined) {
        set.delete(socketId);
        if (set.size === 0) ipConnections.delete(ip);
      }
      handleDisconnect(ws);
    });
  });
}
