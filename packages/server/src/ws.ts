import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage, Server } from 'node:http';
import type { C2S, S2C, Variant } from '@online-rummy/shared';
import {
  createRoom, getRoom, getRoomBySession, deleteRoom,
  addPlayer, removePlayer, getPlayerBySession,
  activePlayers, variantLimits,
  type Player, type Room,
} from './room.js';
import { makeSessionId, signSessionId, verifySessionId } from './session.js';

// --- Module-level state (single-process singleton) ---
let _secret = '';

const idleTimers = new Map<string, ReturnType<typeof setTimeout>>();       // roomCode → timer
const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();  // playerId → timer

type SocketContext = { socketId: string; player: Player | null; room: Room | null };
const socketContexts = new Map<WebSocket, SocketContext>();

const ipConnections = new Map<string, Set<string>>(); // ip → Set<socketId>

const MAX_CONNECTIONS_PER_IP = 10;
const MAX_MSG_RATE = 20; // per second
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const LOBBY_RECONNECT_MS = 60 * 1000;

// --- Wire helpers ---

function send(ws: WebSocket, msg: S2C): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function sendError(ws: WebSocket, code: string, msg: string): void {
  send(ws, { t: 'error', code, msg });
}

function broadcast(room: Room, msg: S2C, exceptId?: string): void {
  for (const p of room.players) {
    if (p.socket !== null && p.id !== exceptId) send(p.socket, msg);
  }
}

// Each player gets their own signed sessionId so they can use it for reconnect.
function broadcastLobby(room: Room): void {
  const players = room.players.map(p => ({ id: p.id, name: p.name }));
  for (const p of room.players) {
    if (p.socket !== null) {
      send(p.socket, {
        t: 'lobby',
        roomCode: room.code,
        variant: room.variant,
        hostId: room.hostId,
        players,
        sessionId: signSessionId(p.sessionId, _secret),
      });
    }
  }
}

function getIp(req: IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = Array.isArray(fwd) ? fwd[0] : fwd;
  return first?.split(',')[0]?.trim() ?? req.socket.remoteAddress ?? '0.0.0.0';
}

// --- Idle timer ---

function startIdleTimer(roomCode: string): void {
  clearIdleTimer(roomCode);
  idleTimers.set(roomCode, setTimeout(() => {
    deleteRoom(roomCode);
    idleTimers.delete(roomCode);
  }, IDLE_TIMEOUT_MS));
}

function clearIdleTimer(roomCode: string): void {
  const t = idleTimers.get(roomCode);
  if (t !== undefined) { clearTimeout(t); idleTimers.delete(roomCode); }
}

function maybeStartIdleTimer(room: Room): void {
  if (!room.players.some(p => p.socket !== null)) startIdleTimer(room.code);
}

// --- Variant validation ---

function isVariant(v: unknown): v is Variant {
  return v === 'basic' || v === 'gin' || v === 'rum500';
}

// --- Message handlers ---

function handleMessage(ws: WebSocket, ctx: SocketContext, msg: C2S): void {
  switch (msg.t) {

    case 'create': {
      if (ctx.room !== null) { sendError(ws, 'ERR_ALREADY_IN_ROOM', 'Already in a room'); return; }
      if (!isVariant(msg.variant)) { sendError(ws, 'ERR_INVALID_VARIANT', 'Invalid variant'); return; }
      const name = msg.name.trim().slice(0, 20);
      if (name.length === 0) { sendError(ws, 'ERR_INVALID_NAME', 'Name cannot be empty'); return; }
      const player: Player = {
        id: randomUUID(), name, sessionId: makeSessionId(), socket: ws, status: 'active',
      };
      const room = createRoom(msg.variant, player);
      ctx.player = player;
      ctx.room = room;
      broadcastLobby(room);
      break;
    }

    case 'join': {
      if (ctx.room !== null) { sendError(ws, 'ERR_ALREADY_IN_ROOM', 'Already in a room'); return; }
      const { roomCode, name, sessionId: signedSid } = msg;
      const normalizedCode = roomCode.toUpperCase();

      // Reconnect path
      if (signedSid !== undefined) {
        const rawId = verifySessionId(signedSid, _secret);
        if (rawId === null) { sendError(ws, 'ERR_INVALID_SESSION', 'Invalid session ID'); return; }
        const reconRoom = getRoomBySession(rawId);
        if (reconRoom === undefined || reconRoom.code !== normalizedCode) {
          sendError(ws, 'ERR_SESSION_NOT_FOUND', 'Session not found in room');
          return;
        }
        if (reconRoom.status !== 'lobby') {
          sendError(ws, 'ERR_GAME_IN_PROGRESS', 'Cannot reconnect mid-game');
          return;
        }
        const reconPlayer = getPlayerBySession(reconRoom, rawId);
        if (reconPlayer === undefined) { sendError(ws, 'ERR_SESSION_NOT_FOUND', 'Player not found'); return; }
        const timer = reconnectTimers.get(reconPlayer.id);
        if (timer !== undefined) { clearTimeout(timer); reconnectTimers.delete(reconPlayer.id); }
        reconPlayer.socket = ws;
        ctx.player = reconPlayer;
        ctx.room = reconRoom;
        clearIdleTimer(reconRoom.code);
        broadcastLobby(reconRoom);
        return;
      }

      // Normal join
      const room = getRoom(normalizedCode);
      if (room === undefined) { sendError(ws, 'ERR_ROOM_NOT_FOUND', 'Room not found'); return; }
      if (room.status !== 'lobby') { sendError(ws, 'ERR_GAME_IN_PROGRESS', 'Game already in progress'); return; }
      const limits = variantLimits(room.variant);
      if (room.players.length >= limits.max) { sendError(ws, 'ERR_ROOM_FULL', 'Room is full'); return; }
      const trimmed = name.trim().slice(0, 20);
      if (trimmed.length === 0) { sendError(ws, 'ERR_INVALID_NAME', 'Name cannot be empty'); return; }
      const player: Player = {
        id: randomUUID(), name: trimmed, sessionId: makeSessionId(), socket: ws, status: 'active',
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
      if (player === null || room === null) { sendError(ws, 'ERR_NOT_IN_ROOM', 'Not in a room'); return; }
      if (room.status !== 'lobby') { sendError(ws, 'ERR_WRONG_STATE', 'Room not in lobby'); return; }
      if (room.hostId !== player.id) { sendError(ws, 'ERR_NOT_HOST', 'Only the host can start'); return; }
      const { min } = variantLimits(room.variant);
      if (room.players.length < min) {
        sendError(ws, 'ERR_NOT_ENOUGH_PLAYERS', `Need at least ${min} players`);
        return;
      }
      room.status = 'playing';
      broadcast(room, { t: 'event', kind: 'gameStarted', playerId: player.id });
      break;
    }

    case 'chat': {
      const { player, room } = ctx;
      if (player === null || room === null) { sendError(ws, 'ERR_NOT_IN_ROOM', 'Not in a room'); return; }
      const text = msg.text.trim().slice(0, 200);
      if (text.length === 0) return;
      broadcast(room, { t: 'chat', from: player.name, text });
      break;
    }

    // Game actions — available in M3 when engine is wired.
    case 'draw':
    case 'drawFromPile':
    case 'meld':
    case 'layoff':
    case 'discard':
    case 'knock': {
      const { room } = ctx;
      if (room === null) { sendError(ws, 'ERR_NOT_IN_ROOM', 'Not in a room'); return; }
      if (room.status !== 'playing') { sendError(ws, 'ERR_WRONG_STATE', 'Game not in progress'); return; }
      sendError(ws, 'ERR_NOT_IMPLEMENTED', 'Game actions wired in M3');
      break;
    }
  }
}

// --- Disconnect ---

function handleDisconnect(ws: WebSocket): void {
  const ctx = socketContexts.get(ws);
  socketContexts.delete(ws);
  if (ctx === undefined || ctx.player === null || ctx.room === null) return;
  const { player, room } = ctx;

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
  } else if (room.status === 'playing') {
    player.status = 'forfeited';
    broadcast(room, { t: 'event', kind: 'forfeit', playerId: player.id });
    const still = activePlayers(room);
    if (still.length <= 1) {
      room.status = 'ended';
      const winner = still[0];
      if (winner !== undefined) broadcast(room, { t: 'event', kind: 'gameOver', playerId: winner.id });
    }
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
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const socketId = randomUUID();
    const ip = getIp(req);

    // Per-IP connection cap
    let ipSet = ipConnections.get(ip);
    if (ipSet === undefined) { ipSet = new Set(); ipConnections.set(ip, ipSet); }
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
    const rateLimiter = setInterval(() => { msgCount = 0; }, 1000);

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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
