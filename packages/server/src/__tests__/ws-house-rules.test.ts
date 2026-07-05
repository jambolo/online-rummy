import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { WebSocket } from 'ws';
import type { C2S, S2C, HouseRules } from '@online-rummy/shared';
import { canonicalHouseRules } from '@online-rummy/shared';
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

describe('house rules round-trip', () => {
  it('create stores explicit house rules and the lobby carries them', async () => {
    const alice = await connect();
    alice.send({ t: 'create', variant: 'basic', name: 'Alice', houseRules: { aceEitherEnd: false } });
    const lobby = (await alice.recvUntil('lobby')) as Extract<S2C, { t: 'lobby' }>;
    expect(lobby.houseRules).toEqual(canonicalHouseRules('basic'));
    await alice.close();
  });

  it('create without house rules defaults the room to canonical', async () => {
    const alice = await connect();
    alice.send({ t: 'create', variant: 'basic', name: 'Alice' });
    const lobby = (await alice.recvUntil('lobby')) as Extract<S2C, { t: 'lobby' }>;
    expect(lobby.houseRules).toEqual(canonicalHouseRules('basic'));
    await alice.close();
  });

  it('host setHouseRules in the lobby rebroadcasts the config', async () => {
    const alice = await connect();
    alice.send({ t: 'create', variant: 'basic', name: 'Alice' });
    await alice.recvUntil('lobby');

    alice.send({ t: 'setHouseRules', houseRules: { aceEitherEnd: false } });
    const lobby2 = (await alice.recvUntil('lobby')) as Extract<S2C, { t: 'lobby' }>;
    expect(lobby2.houseRules.aceEitherEnd).toBe(false);
    await alice.close();
  });

  it('setHouseRules from a non-host is rejected', async () => {
    const alice = await connect();
    alice.send({ t: 'create', variant: 'basic', name: 'Alice' });
    const l = (await alice.recvUntil('lobby')) as Extract<S2C, { t: 'lobby' }>;
    const { roomCode } = l;

    const bob = await connect();
    bob.send({ t: 'join', roomCode, name: 'Bob' });
    await bob.recvUntil('lobby');

    bob.send({ t: 'setHouseRules', houseRules: { aceEitherEnd: false } });
    const err = (await bob.recvUntil('error')) as Extract<S2C, { t: 'error' }>;
    expect(err.code).toBe('ERR_NOT_HOST');

    await alice.close();
    await bob.close();
  });

  it('setHouseRules after the game starts is rejected', async () => {
    const alice = await connect();
    alice.send({ t: 'create', variant: 'basic', name: 'Alice' });
    const l = (await alice.recvUntil('lobby')) as Extract<S2C, { t: 'lobby' }>;
    const { roomCode } = l;

    const bob = await connect();
    bob.send({ t: 'join', roomCode, name: 'Bob' });
    await alice.recvUntil('lobby');
    await bob.recvUntil('lobby');

    alice.send({ t: 'start' });
    await alice.recvUntil('state');

    alice.send({ t: 'setHouseRules', houseRules: { aceEitherEnd: false } });
    const err = (await alice.recvUntil('error')) as Extract<S2C, { t: 'error' }>;
    expect(err.code).toBe('ERR_WRONG_STATE');

    await alice.close();
    await bob.close();
  });

  it('setHouseRules with an unknown id is rejected', async () => {
    const alice = await connect();
    alice.send({ t: 'create', variant: 'basic', name: 'Alice' });
    await alice.recvUntil('lobby');

    const bad = { notARule: true } as unknown as HouseRules;
    alice.send({ t: 'setHouseRules', houseRules: bad });
    const err = (await alice.recvUntil('error')) as Extract<S2C, { t: 'error' }>;
    expect(err.code).toBe('ERR_INVALID_HOUSE_RULE');

    await alice.close();
  });

  it('setHouseRules enabling an unsupported rule (jokers) is rejected', async () => {
    const alice = await connect();
    alice.send({ t: 'create', variant: 'rum500', name: 'Alice' });
    await alice.recvUntil('lobby');

    alice.send({ t: 'setHouseRules', houseRules: { jokers: true } });
    const err = (await alice.recvUntil('error')) as Extract<S2C, { t: 'error' }>;
    expect(err.code).toBe('ERR_UNSUPPORTED_HOUSE_RULE');

    await alice.close();
  });

  it('a started game exposes publicState.houseRules', async () => {
    const alice = await connect();
    alice.send({ t: 'create', variant: 'basic', name: 'Alice' });
    const l = (await alice.recvUntil('lobby')) as Extract<S2C, { t: 'lobby' }>;
    const { roomCode } = l;

    const bob = await connect();
    bob.send({ t: 'join', roomCode, name: 'Bob' });
    await alice.recvUntil('lobby');
    await bob.recvUntil('lobby');

    alice.send({ t: 'start' });
    const st = (await alice.recvUntil('state')) as Extract<S2C, { t: 'state' }>;
    expect(st.public.houseRules).toEqual(canonicalHouseRules('basic'));

    await alice.close();
    await bob.close();
  });
});
