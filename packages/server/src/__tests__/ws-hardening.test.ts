// Transport-level hardening: malformed input must cost the offender one reply (or its
// socket), never the process; connection limits must key off an identity the client
// cannot pick; finished rooms must be reclaimed.

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import http from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket } from 'ws';
import type { C2S, Card, Rank, S2C, Suit } from '@online-rummy/shared';
import { initWS } from '../ws.js';
import { getRoom } from '../room.js';
import type { GameState } from '../engine/types.js';

const TEST_ORIGIN = 'http://localhost:5173';
const TEST_SECRET = 'test-secret-32-chars-minimum-here';
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

type Client = {
  ws: WebSocket;
  send: (m: C2S) => void;
  sendRaw: (payload: unknown) => void;
  recv: () => Promise<S2C>;
  recvUntil: (kind: S2C['t']) => Promise<S2C>;
  close: () => Promise<void>;
};

async function connectTo(port: number, headers: Record<string, string> = {}): Promise<Client> {
  const queue: S2C[] = [];
  const waiters: ((m: S2C) => void)[] = [];
  const ws = new WebSocket(`ws://localhost:${port}`, { headers: { origin: TEST_ORIGIN, ...headers } });
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
    sendRaw: (payload) => ws.send(JSON.stringify(payload)),
    recv,
    recvUntil: async (kind) => {
      for (;;) {
        const m = await recv();
        if (m.t === kind) return m;
      }
    },
    // Safe on a socket the server already closed (cap refusal, protocol error).
    close: () =>
      new Promise<void>((res) => {
        if (ws.readyState === WebSocket.CLOSED) return res();
        ws.on('close', () => res());
        ws.close();
      }),
  };
}

async function listen(server: http.Server): Promise<number> {
  await new Promise<void>((res) => server.listen(0, '127.0.0.1', () => res()));
  return (server.address() as { port: number }).port;
}

// Resolves true when the server refuses the socket — its first frame is the cap error.
// Accepted sockets are sent nothing, hence the short race.
async function refused(c: Client): Promise<boolean> {
  const first = await Promise.race([c.recv(), new Promise<null>((r) => setTimeout(() => r(null), 300))]);
  return first !== null && first.t === 'error' && first.code === 'ERR_TOO_MANY_CONNECTIONS';
}

// Spin the event loop until cond() holds. setImmediate-based so it works under fake timers.
async function until(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 5000 && !cond(); i++) await new Promise<void>((r) => setImmediate(r));
  expect(cond()).toBe(true);
}

let server: http.Server;
let port: number;
const connect = (headers?: Record<string, string>) => connectTo(port, headers);

beforeAll(async () => {
  server = http.createServer();
  initWS(server, TEST_SECRET, new Set([TEST_ORIGIN]));
  port = await listen(server);
});

afterAll(async () => {
  await new Promise<void>((res) => server.close(() => res()));
});

describe('ingress validation', () => {
  const cases: [string, unknown][] = [
    ['create without name', { t: 'create', variant: 'basic' }],
    ['create with non-string name', { t: 'create', variant: 'basic', name: 42 }],
    ['create with null houseRules', { t: 'create', variant: 'basic', name: 'A', houseRules: null }],
    ['join without roomCode', { t: 'join', name: 'A' }],
    ['meld with non-array cardIds', { t: 'meld', cardIds: 'abc' }],
    ['unknown type', { t: 'nope' }],
    ['inherited type name', { t: 'toString' }],
    ['array payload', [1, 2]],
  ];
  for (const [label, payload] of cases) {
    it(`${label} → ERR_INVALID_MSG, and the socket keeps working`, async () => {
      const c = await connect();
      c.sendRaw(payload);
      expect(await c.recvUntil('error')).toMatchObject({ t: 'error', code: 'ERR_INVALID_MSG' });
      c.send({ t: 'create', variant: 'basic', name: 'Alice' });
      expect((await c.recvUntil('lobby')).t).toBe('lobby');
      await c.close();
    });
  }

  it('chat without text and setHouseRules with null are rejected inside a room', async () => {
    const c = await connect();
    c.send({ t: 'create', variant: 'basic', name: 'Alice' });
    await c.recvUntil('lobby');
    c.sendRaw({ t: 'chat' });
    expect(await c.recvUntil('error')).toMatchObject({ code: 'ERR_INVALID_MSG' });
    c.sendRaw({ t: 'setHouseRules', houseRules: null });
    expect(await c.recvUntil('error')).toMatchObject({ code: 'ERR_INVALID_MSG' });
    await c.close();
  });

  it("variant 'toString' is not a variant, even though it is `in` the registry", async () => {
    const c = await connect();
    c.sendRaw({ t: 'create', variant: 'toString', name: 'Alice' });
    expect(await c.recvUntil('error')).toMatchObject({ code: 'ERR_INVALID_VARIANT' });
    await c.close();
  });
});

describe('malformed frames', () => {
  it('an unmasked frame closes only the offending socket', async () => {
    const bystander = await connect();
    const attacker = await connect();
    const closed = new Promise<number>((res) => attacker.ws.on('close', (code) => res(code)));

    // Clients must mask. Write a bare text frame ('A') to the TCP socket under the ws
    // client; the server's receiver rejects it with WS_ERR_EXPECTED_MASK.
    const sock = (attacker.ws as unknown as { _socket: Duplex })._socket;
    sock.write(Buffer.from([0x81, 0x01, 0x41]));
    expect(await closed).toBe(1002);

    bystander.send({ t: 'create', variant: 'basic', name: 'Alice' });
    expect((await bystander.recvUntil('lobby')).t).toBe('lobby');
    await bystander.close();
  });
});

describe('per-IP connection cap', () => {
  it('ignores X-Forwarded-For by default — one peer cannot mint fresh identities', async () => {
    const opened: Client[] = [];
    for (let i = 0; i < 12; i++) opened.push(await connect({ 'x-forwarded-for': `10.0.0.${i}` }));
    const results = await Promise.all(opened.map(refused));
    expect(results.filter(Boolean).length).toBeGreaterThanOrEqual(1);
    expect(results.filter((r) => !r).length).toBeLessThanOrEqual(10);
    await Promise.all(opened.map((c) => c.close()));
  });

  describe('with TRUST_PROXY', () => {
    let proxied: http.Server;
    let proxiedPort: number;

    beforeAll(async () => {
      proxied = http.createServer();
      initWS(proxied, TEST_SECRET, new Set([TEST_ORIGIN]), { trustProxy: true });
      proxiedPort = await listen(proxied);
    });

    afterAll(async () => {
      await new Promise<void>((res) => proxied.close(() => res()));
    });

    it('keys the cap off the LAST X-Forwarded-For entry (the one the proxy appended)', async () => {
      // Distinct client-supplied first entries, identical proxy-appended last entry.
      const opened: Client[] = [];
      for (let i = 0; i < 12; i++) {
        opened.push(await connectTo(proxiedPort, { 'x-forwarded-for': `10.0.0.${i}, 203.0.113.7` }));
      }
      const results = await Promise.all(opened.map(refused));
      expect(results.filter(Boolean).length).toBe(2);
      await Promise.all(opened.map((c) => c.close()));
    });

    it('distinct proxy-appended addresses get their own allowance', async () => {
      const opened: Client[] = [];
      for (let i = 0; i < 12; i++) {
        opened.push(await connectTo(proxiedPort, { 'x-forwarded-for': `10.0.0.1, 203.0.113.${i}` }));
      }
      const results = await Promise.all(opened.map(refused));
      expect(results.filter(Boolean).length).toBe(0);
      await Promise.all(opened.map((c) => c.close()));
    });
  });
});

describe('room reclamation', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function findCard(state: GameState, rank: Rank, suit: Suit): Card {
    const card = [...state.cardRegistry.values()].find((c) => c.rank === rank && c.suit === suit);
    if (card === undefined) throw new Error(`test rig: card ${rank}${suit} not in registry`);
    return card;
  }

  // Move `cards` out of every zone so each lives in exactly one place afterwards.
  function extractCards(state: GameState, cards: Card[]): void {
    const ids = new Set(cards.map((c) => c.id));
    state.stock = state.stock.filter((c) => !ids.has(c.id));
    state.discardPile = state.discardPile.filter((c) => !ids.has(c.id));
    for (const p of state.players) p.hand = p.hand.filter((c) => !ids.has(c.id));
  }

  it('an ended room whose last socket drops is deleted after the idle timeout', async () => {
    const alice = await connect();
    alice.send({ t: 'create', variant: 'basic', name: 'Alice' });
    const { roomCode } = (await alice.recvUntil('lobby')) as Extract<S2C, { t: 'lobby' }>;
    const bob = await connect();
    bob.send({ t: 'join', roomCode, name: 'Bob' });
    await alice.recvUntil('lobby');
    await bob.recvUntil('lobby');
    alice.send({ t: 'start' });
    await alice.recvUntil('state');
    await bob.recvUntil('state');

    // Rig the acting player to go out on the first turn: hand 7C 7D, stock top 7H.
    const room = getRoom(roomCode)!;
    const state = room.gameState!;
    const actorId = state.turnPlayerId;
    const actor = state.players.find((p) => p.id === actorId)!;
    const rig = [findCard(state, '7', 'C'), findCard(state, '7', 'D'), findCard(state, '7', 'H')];
    extractCards(state, rig);
    state.stock.push(...actor.hand);
    actor.hand = [rig[0]!, rig[1]!];
    state.stock.unshift(rig[2]!);

    const actorClient = actorId === room.players[0]!.id ? alice : bob;
    actorClient.send({ t: 'draw', from: 'stock' });
    await actorClient.recvUntil('state');
    actorClient.send({ t: 'meld', cardIds: rig.map((c) => c.id) });
    await alice.recvUntil('state');
    await bob.recvUntil('state');
    expect(room.status).toBe('ended');

    // Fake timers from here so the idle timer armed by the disconnects is controllable.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await alice.close();
    await bob.close();
    await until(() => room.players.every((p) => p.socket === null));
    expect(getRoom(roomCode)).toBe(room);

    vi.advanceTimersByTime(IDLE_TIMEOUT_MS + 1);
    expect(getRoom(roomCode)).toBeUndefined();
  });
});
