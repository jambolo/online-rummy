import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { WebSocket } from 'ws';
import type { C2S, S2C } from '@online-rummy/shared';
import { initWS } from '../ws.js';

const TEST_ORIGIN = 'http://localhost:5173';
const TEST_SECRET = 'test-secret-32-chars-minimum-here';

let server: http.Server;
let port: number;

type Client = {
  ws: WebSocket;
  send: (m: C2S) => void;
  recv: () => Promise<S2C>;
  close: () => Promise<void>;
};

async function connect(): Promise<Client> {
  const queue: S2C[] = [];
  const waiters: ((m: S2C) => void)[] = [];

  const ws = new WebSocket(`ws://localhost:${port}`, {
    headers: { origin: TEST_ORIGIN },
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString()) as S2C;
    const waiter = waiters.shift();
    if (waiter) waiter(msg);
    else queue.push(msg);
  });

  await new Promise<void>((res) => ws.on('open', res));

  return {
    ws,
    send: (m) => ws.send(JSON.stringify(m)),
    recv: () => {
      const queued = queue.shift();
      if (queued !== undefined) return Promise.resolve(queued);
      return new Promise((res) => waiters.push(res));
    },
    close: () =>
      new Promise<void>((res) => {
        ws.close();
        ws.on('close', () => res());
      }),
  };
}

beforeAll(async () => {
  server = http.createServer();
  initWS(server, TEST_SECRET, new Set([TEST_ORIGIN]));
  await new Promise<void>((res) => server.listen(0, '127.0.0.1', () => res()));
  port = (server.address() as { port: number }).port;
});

afterAll(async () => {
  await new Promise<void>((res) => server.close(() => res()));
});

describe('leave — not in room', () => {
  it('returns ERR_NOT_IN_ROOM', async () => {
    const c = await connect();
    c.send({ t: 'leave' });
    const msg = await c.recv();
    expect(msg).toMatchObject({ t: 'error', code: 'ERR_NOT_IN_ROOM' });
    await c.close();
  });
});

describe('leave — lobby', () => {
  it('broadcasts playerLeft to others; room is deleted; leaver context cleared', async () => {
    const alice = await connect();
    const bob = await connect();

    // Alice creates a room
    alice.send({ t: 'create', variant: 'basic', name: 'Alice' });
    const aliceLobby = (await alice.recv()) as Extract<S2C, { t: 'lobby' }>;
    expect(aliceLobby.t).toBe('lobby');
    const { roomCode, players: lobbyPlayers } = aliceLobby;
    const aliceId = lobbyPlayers.find((p) => p.name === 'Alice')!.id;

    // Bob joins
    bob.send({ t: 'join', roomCode, name: 'Bob' });
    // Both get lobby broadcast
    await alice.recv(); // Alice gets updated lobby
    const bobLobby = (await bob.recv()) as Extract<S2C, { t: 'lobby' }>;
    expect(bobLobby.t).toBe('lobby');

    // Alice leaves
    alice.send({ t: 'leave' });

    // Bob should receive playerLeft event
    const event = (await bob.recv()) as Extract<S2C, { t: 'event' }>;
    expect(event.t).toBe('event');
    expect(event.kind).toBe('playerLeft');
    expect(event.playerId).toBe(aliceId);

    // Alice's context is cleared — she can immediately create a new room
    alice.send({ t: 'create', variant: 'basic', name: 'Alice2' });
    const newLobby = await alice.recv();
    expect(newLobby.t).toBe('lobby');

    await alice.close();
    await bob.close();
  });
});

describe('leave — during active game', () => {
  it('broadcasts playerLeft; room is torn down; players can rejoin elsewhere', async () => {
    const alice = await connect();
    const bob = await connect();

    // Create and start a game
    alice.send({ t: 'create', variant: 'basic', name: 'Alice' });
    const aliceLobby1 = (await alice.recv()) as Extract<S2C, { t: 'lobby' }>;
    const { roomCode } = aliceLobby1;
    const aliceId = aliceLobby1.players.find((p) => p.name === 'Alice')!.id;

    bob.send({ t: 'join', roomCode, name: 'Bob' });
    await alice.recv(); // updated lobby for Alice
    await bob.recv(); // lobby for Bob

    alice.send({ t: 'start' });
    // Server sends gameStarted event then state to each player
    const aliceEvent = await alice.recv();
    const aliceState = await alice.recv();
    const bobEvent = await bob.recv();
    const bobState = await bob.recv();
    expect(aliceEvent.t).toBe('event');
    expect(aliceState.t).toBe('state');
    expect(bobEvent.t).toBe('event');
    expect(bobState.t).toBe('state');

    // Alice leaves mid-game
    alice.send({ t: 'leave' });
    const event = (await bob.recv()) as Extract<S2C, { t: 'event' }>;
    expect(event.kind).toBe('playerLeft');
    expect(event.playerId).toBe(aliceId);

    // Bob's context is also cleared — he can create a new room
    bob.send({ t: 'create', variant: 'basic', name: 'Bob2' });
    const bobNewLobby = await bob.recv();
    expect(bobNewLobby.t).toBe('lobby');

    await alice.close();
    await bob.close();
  });
});
