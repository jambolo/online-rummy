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
  recvUntil: (kind: S2C['t']) => Promise<S2C>;
  close: () => Promise<void>;
};

async function connect(): Promise<Client> {
  const queue: S2C[] = [];
  const waiters: ((m: S2C) => void)[] = [];

  const ws = new WebSocket(`ws://localhost:${port}`, { headers: { origin: TEST_ORIGIN } });

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString()) as S2C;
    const waiter = waiters.shift();
    if (waiter) waiter(msg);
    else queue.push(msg);
  });

  await new Promise<void>((res) => ws.on('open', res));

  const recv = (): Promise<S2C> => {
    const queued = queue.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    return new Promise((res) => waiters.push(res));
  };

  return {
    ws,
    send: (m) => ws.send(JSON.stringify(m)),
    recv,
    // Drain until a message of the given type arrives (skips interleaved state/keepalive).
    recvUntil: async (kind) => {
      for (;;) {
        const m = await recv();
        if (m.t === kind) return m;
      }
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

describe('mid-game reconnect', () => {
  it('a dropped player resumes the same hand within the grace window', async () => {
    const alice = await connect();
    const bob = await connect();

    alice.send({ t: 'create', variant: 'basic', name: 'Alice' });
    const aliceLobby = (await alice.recv()) as Extract<S2C, { t: 'lobby' }>;
    const { roomCode } = aliceLobby;
    const aliceSid = aliceLobby.sessionId; // signed; reused for reconnect
    const aliceId = aliceLobby.players.find((p) => p.name === 'Alice')!.id;

    bob.send({ t: 'join', roomCode, name: 'Bob' });
    await alice.recv(); // updated lobby
    await bob.recv(); // lobby

    alice.send({ t: 'start' });
    await alice.recvUntil('state');
    await bob.recvUntil('state');

    // Alice's socket drops (no leave) → Bob sees a disconnect cue, not an instant forfeit.
    await alice.close();
    const dropEvent = (await bob.recvUntil('event')) as Extract<S2C, { t: 'event' }>;
    expect(dropEvent.kind).toBe('playerDisconnected');
    expect(dropEvent.playerId).toBe(aliceId);

    // Alice rebinds within the grace window using her signed session id.
    const alice2 = await connect();
    alice2.send({ t: 'join', roomCode, name: 'Alice', sessionId: aliceSid });

    // She gets identity (lobby) + full game state back.
    const reLobby = (await alice2.recvUntil('lobby')) as Extract<S2C, { t: 'lobby' }>;
    expect(reLobby.roomCode).toBe(roomCode);
    const reState = (await alice2.recvUntil('state')) as Extract<S2C, { t: 'state' }>;
    expect(reState.private).toBeDefined(); // her hand is restored
    const alicePub = reState.public.players.find((p) => p.id === aliceId);
    expect(alicePub?.status).toBe('active'); // not forfeited

    // Bob is told she's back.
    const backEvent = (await bob.recvUntil('event')) as Extract<S2C, { t: 'event' }>;
    expect(backEvent.kind).toBe('playerReconnected');
    expect(backEvent.playerId).toBe(aliceId);

    await alice2.close();
    await bob.close();
  });

  it('rejects reconnect once the player has been forfeited / game ended', async () => {
    const alice = await connect();
    const bob = await connect();

    alice.send({ t: 'create', variant: 'basic', name: 'Alice' });
    const aliceLobby = (await alice.recv()) as Extract<S2C, { t: 'lobby' }>;
    const { roomCode } = aliceLobby;
    const aliceSid = aliceLobby.sessionId;

    bob.send({ t: 'join', roomCode, name: 'Bob' });
    await alice.recv();
    await bob.recv();

    alice.send({ t: 'start' });
    await alice.recvUntil('state');
    await bob.recvUntil('state');

    // Bob leaves → game cancelled / room torn down. Alice's session is no longer resumable.
    bob.send({ t: 'leave' });
    await alice.recvUntil('event'); // playerLeft

    const alice2 = await connect();
    alice2.send({ t: 'join', roomCode, name: 'Alice', sessionId: aliceSid });
    const err = (await alice2.recvUntil('error')) as Extract<S2C, { t: 'error' }>;
    expect(err.code).toBe('ERR_SESSION_NOT_FOUND'); // room gone

    await alice.close();
    await alice2.close();
    await bob.close();
  });
});
