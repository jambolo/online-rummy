import { randomInt } from 'node:crypto';
import type { WebSocket } from 'ws';
import type { PlayerId, Variant } from '@online-rummy/shared';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export type Player = {
  id: PlayerId;
  name: string;
  sessionId: string;
  socket: WebSocket | null;
  status: 'active' | 'forfeited';
};

export type RoomStatus = 'lobby' | 'playing' | 'ended';

export type Room = {
  code: string;
  variant: Variant;
  hostId: PlayerId;
  players: Player[];
  status: RoomStatus;
};

const rooms = new Map<string, Room>();
const sessionIndex = new Map<string, string>(); // sessionId → roomCode

function generateCode(): string {
  let code: string;
  do {
    code = Array.from({ length: 5 }, () => CROCKFORD[randomInt(0, 32)] ?? '0').join('');
  } while (rooms.has(code));
  return code;
}

export function createRoom(variant: Variant, host: Player): Room {
  const code = generateCode();
  const room: Room = { code, variant, hostId: host.id, players: [host], status: 'lobby' };
  rooms.set(code, room);
  sessionIndex.set(host.sessionId, code);
  return room;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code);
}

export function getRoomBySession(sessionId: string): Room | undefined {
  const code = sessionIndex.get(sessionId);
  return code !== undefined ? rooms.get(code) : undefined;
}

export function deleteRoom(code: string): void {
  const room = rooms.get(code);
  if (room === undefined) return;
  for (const p of room.players) sessionIndex.delete(p.sessionId);
  rooms.delete(code);
}

export function addPlayer(room: Room, player: Player): void {
  room.players.push(player);
  sessionIndex.set(player.sessionId, room.code);
}

export function removePlayer(room: Room, playerId: PlayerId): void {
  const idx = room.players.findIndex(p => p.id === playerId);
  if (idx === -1) return;
  const removed = room.players.splice(idx, 1)[0];
  if (removed !== undefined) sessionIndex.delete(removed.sessionId);
  if (room.players.length === 0) {
    deleteRoom(room.code);
    return;
  }
  if (room.hostId === playerId) {
    const next = room.players.find(p => p.socket !== null) ?? room.players[0];
    if (next !== undefined) room.hostId = next.id;
  }
}

export function getPlayerBySession(room: Room, sessionId: string): Player | undefined {
  return room.players.find(p => p.sessionId === sessionId);
}

export function activePlayers(room: Room): Player[] {
  return room.players.filter(p => p.status === 'active');
}

export function variantLimits(variant: Variant): { min: number; max: number } {
  switch (variant) {
    case 'basic':  return { min: 2, max: 6 };
    case 'gin':    return { min: 2, max: 2 };
    case 'rum500': return { min: 2, max: 8 };
  }
}
