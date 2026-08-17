import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { WebSocket } from 'ws';
import type { C2S, Card, EventKind, Rank, S2C, Suit, Variant } from '@online-rummy/shared';
import { initWS } from '../ws.js';
import { getRoom } from '../room.js';
import type { GameState } from '../engine/types.js';

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

// --- Game setup + state-rigging helpers ---

type Game = {
  ids: { alice: string; bob: string };
  state: GameState;
  clientOf: (pid: string) => Client;
  otherOf: (pid: string) => Client;
  otherId: (pid: string) => string;
  closeAll: () => Promise<void>;
};

async function startGame(variant: Variant): Promise<Game> {
  const alice = await connect();
  alice.send({ t: 'create', variant, name: 'Alice' });
  const aliceLobby = (await alice.recvUntil('lobby')) as Extract<S2C, { t: 'lobby' }>;
  const { roomCode } = aliceLobby;
  const aliceId = aliceLobby.players.find((p) => p.name === 'Alice')!.id;

  const bob = await connect();
  bob.send({ t: 'join', roomCode, name: 'Bob' });
  await alice.recvUntil('lobby');
  const bobLobby = (await bob.recvUntil('lobby')) as Extract<S2C, { t: 'lobby' }>;
  const bobId = bobLobby.players.find((p) => p.name === 'Bob')!.id;

  alice.send({ t: 'start' });
  // Consume the gameStarted event + initial state so each stream starts empty.
  await alice.recvUntil('state');
  await bob.recvUntil('state');

  const state = getRoom(roomCode)!.gameState!;
  return {
    ids: { alice: aliceId, bob: bobId },
    state,
    clientOf: (pid) => (pid === aliceId ? alice : bob),
    otherOf: (pid) => (pid === aliceId ? bob : alice),
    otherId: (pid) => (pid === aliceId ? bobId : aliceId),
    closeAll: async () => {
      await alice.close();
      await bob.close();
    },
  };
}

type Spec = [Rank, Suit];

function findCard(state: GameState, [rank, suit]: Spec): Card {
  const card = [...state.cardRegistry.values()].find((c) => c.rank === rank && c.suit === suit);
  if (card === undefined) throw new Error(`test rig: card ${rank}${suit} not in registry`);
  return card;
}

// Remove the given cards from every zone so each ends up living in exactly one place.
function extractCards(state: GameState, cards: Card[]): void {
  const ids = new Set(cards.map((c) => c.id));
  state.stock = state.stock.filter((c) => !ids.has(c.id));
  state.discardPile = state.discardPile.filter((c) => !ids.has(c.id));
  for (const p of state.players) p.hand = p.hand.filter((c) => !ids.has(c.id));
}

// Replace a player's hand with known cards; displaced cards go to the bottom of the
// stock so the deck stays consistent with the card registry.
function setHand(state: GameState, playerId: string, specs: Spec[]): Card[] {
  const player = state.players.find((p) => p.id === playerId)!;
  const picked = specs.map((s) => findCard(state, s));
  const pickedIds = new Set(picked.map((c) => c.id));
  const displaced = player.hand.filter((c) => !pickedIds.has(c.id));
  extractCards(state, picked);
  player.hand = picked;
  state.stock.push(...displaced);
  return picked;
}

// Replace the discard pile (bottom → top) with known cards; displaced pile cards go
// to the bottom of the stock.
function setDiscard(state: GameState, specs: Spec[]): Card[] {
  const picked = specs.map((s) => findCard(state, s));
  const pickedIds = new Set(picked.map((c) => c.id));
  const displaced = state.discardPile.filter((c) => !pickedIds.has(c.id));
  extractCards(state, picked);
  state.discardPile = picked;
  state.stock.push(...displaced);
  return picked;
}

// Assert the very next two frames on `client` are the action event then a state
// broadcast — verifies receipt AND event-before-state ordering in one step.
// `absentDataKeys` names keys the payload must NOT carry — toMatchObject is a partial
// match, so an accidental leak of a private card would otherwise slip through.
async function expectEventThenState(
  client: Client,
  kind: EventKind,
  playerId: string,
  data?: unknown,
  absentDataKeys: string[] = [],
): Promise<void> {
  const e = await client.recv();
  const expected: Record<string, unknown> = { t: 'event', kind, playerId };
  if (data !== undefined) expected['data'] = data;
  expect(e).toMatchObject(expected);
  // Data-less kinds must carry NO data at all — pins that action events can never
  // leak private info (e.g. the gin knock's face-down discardId, rules.md A.2.4).
  if (data === undefined) expect(Object.hasOwn(e, 'data')).toBe(false);
  const payload = (e as { data?: Record<string, unknown> }).data ?? {};
  for (const k of absentDataKeys) expect(Object.hasOwn(payload, k)).toBe(false);
  const s = await client.recv();
  expect(s.t).toBe('state');
}

describe('action events — basic', () => {
  it('draw from stock → drew {from:stock} to both players, before the state broadcast', async () => {
    const g = await startGame('basic');
    const actorId = g.state.turnPlayerId;
    g.clientOf(actorId).send({ t: 'draw', from: 'stock' });
    // No `cards` — the stock card is private to the drawer.
    await expectEventThenState(g.clientOf(actorId), 'drew', actorId, { from: 'stock' }, ['cards']);
    await expectEventThenState(g.otherOf(actorId), 'drew', actorId, { from: 'stock' }, ['cards']);
    await g.closeAll();
  });

  it('draw from discard → drew {from:discard} naming the face-up upcard', async () => {
    const g = await startGame('basic');
    const actorId = g.state.turnPlayerId;
    const upcard = g.state.discardPile[g.state.discardPile.length - 1]!;
    g.clientOf(actorId).send({ t: 'draw', from: 'discard' });
    await expectEventThenState(g.clientOf(actorId), 'drew', actorId, { from: 'discard', cards: [upcard] });
    await expectEventThenState(g.otherOf(actorId), 'drew', actorId, { from: 'discard', cards: [upcard] });
    await g.closeAll();
  });

  it('meld → melded, layoff → laidOff, discard → discarded', async () => {
    const g = await startGame('basic');
    const actorId = g.state.turnPlayerId;
    const actor = g.clientOf(actorId);
    const other = g.otherOf(actorId);
    const rig = setHand(g.state, actorId, [
      ['7', 'C'],
      ['7', 'D'],
      ['7', 'H'],
      ['7', 'S'],
      ['K', 'D'],
    ]);

    actor.send({ t: 'draw', from: 'stock' });
    await actor.recvUntil('state');
    await other.recvUntil('state');

    const melded = { cards: [rig[0], rig[1], rig[2]] };
    actor.send({ t: 'meld', cardIds: [rig[0]!.id, rig[1]!.id, rig[2]!.id] });
    await expectEventThenState(actor, 'melded', actorId, melded);
    await expectEventThenState(other, 'melded', actorId, melded);

    const meldId = g.state.players.find((p) => p.id === actorId)!.melds[0]!.id;
    actor.send({ t: 'layoff', meldId, cardId: rig[3]!.id });
    await expectEventThenState(actor, 'laidOff', actorId, { cards: [rig[3]] });
    await expectEventThenState(other, 'laidOff', actorId, { cards: [rig[3]] });

    actor.send({ t: 'discard', cardId: rig[4]!.id });
    await expectEventThenState(actor, 'discarded', actorId, { card: rig[4] });
    await expectEventThenState(other, 'discarded', actorId, { card: rig[4] });
    await g.closeAll();
  });

  it('a rejected action emits no event', async () => {
    const g = await startGame('basic');
    const actorId = g.state.turnPlayerId;
    const offender = g.otherOf(actorId);

    offender.send({ t: 'draw', from: 'stock' });
    const err = await offender.recv();
    expect(err).toMatchObject({ t: 'error', code: 'ERR_NOT_YOUR_TURN' });

    // Prove nothing was broadcast for the rejected action: the next frame both streams
    // see is the event for the subsequent legal draw.
    g.clientOf(actorId).send({ t: 'draw', from: 'stock' });
    await expectEventThenState(g.clientOf(actorId), 'drew', actorId, { from: 'stock' });
    await expectEventThenState(offender, 'drew', actorId, { from: 'stock' });
    await g.closeAll();
  });
});

describe('action events — gin', () => {
  it('passUpcard → passedUpcard to both players', async () => {
    const g = await startGame('gin');
    // rules.md A.2.2: the hand opens with the non-dealer deciding on the upcard.
    const nonDealerId = g.state.turnPlayerId;
    g.clientOf(nonDealerId).send({ t: 'passUpcard' });
    await expectEventThenState(g.clientOf(nonDealerId), 'passedUpcard', nonDealerId);
    await expectEventThenState(g.otherOf(nonDealerId), 'passedUpcard', nonDealerId);
    await g.closeAll();
  });

  // Decline both upcard offers, rig a legal knock hand, draw, and send the knock.
  // Callers consume the resulting 'knocked' frames themselves.
  async function rigKnock(g: Game): Promise<{ knockerId: string; defenderId: string; meldCards: Card[] }> {
    const nonDealerId = g.state.turnPlayerId;
    const dealerId = g.otherId(nonDealerId);

    // Both decline the upcard so normal play opens with the non-dealer's draw.
    g.clientOf(nonDealerId).send({ t: 'passUpcard' });
    await g.clientOf(nonDealerId).recvUntil('state');
    await g.clientOf(dealerId).recvUntil('state');
    g.clientOf(dealerId).send({ t: 'passUpcard' });
    await g.clientOf(nonDealerId).recvUntil('state');
    await g.clientOf(dealerId).recvUntil('state');
    expect(g.state.phase).toBe('draw');

    // Three melds + one 5-point knock card. The drawn stock card stays deadwood but a
    // single card is worth at most 10, so the knock is always legal.
    const knockerId = g.state.turnPlayerId;
    const rig = setHand(g.state, knockerId, [
      ['2', 'C'],
      ['2', 'D'],
      ['2', 'H'],
      ['3', 'C'],
      ['3', 'D'],
      ['3', 'H'],
      ['4', 'S'],
      ['5', 'S'],
      ['6', 'S'],
      ['5', 'H'],
    ]);
    // Force the drawn card so the leftover deadwood is a known KH — non-zero, so this is
    // a regular knock and layoffs against it are legal (rules.md A.2.4).
    const drawn = findCard(g.state, ['K', 'H']);
    extractCards(g.state, [drawn]);
    g.state.stock.unshift(drawn);

    const knocker = g.clientOf(knockerId);
    knocker.send({ t: 'draw', from: 'stock' });
    await knocker.recvUntil('state');
    await g.otherOf(knockerId).recvUntil('state');

    knocker.send({
      t: 'knock',
      melds: [
        [rig[0]!.id, rig[1]!.id, rig[2]!.id],
        [rig[3]!.id, rig[4]!.id, rig[5]!.id],
        [rig[6]!.id, rig[7]!.id, rig[8]!.id],
      ],
      discardId: rig[9]!.id,
    });
    return { knockerId, defenderId: g.otherId(knockerId), meldCards: rig.slice(0, 9) };
  }

  it('knock → knocked to both players, naming the declared melds but not the face-down discard', async () => {
    const g = await startGame('gin');
    const { knockerId, meldCards } = await rigKnock(g);
    // Exactly the nine declared meld cards — which pins out the face-down knock discard,
    // the tenth rigged card (rules.md A.2.4).
    const declared = { cards: meldCards };
    await expectEventThenState(g.clientOf(knockerId), 'knocked', knockerId, declared);
    await expectEventThenState(g.otherOf(knockerId), 'knocked', knockerId, declared);
    await g.closeAll();
  });

  it('ginLayoff → laidOff to both players, before the hand-end frames', async () => {
    const g = await startGame('gin');
    const { knockerId, defenderId } = await rigKnock(g);
    // Consume the knocked event + layoff-phase state on both streams.
    await g.clientOf(knockerId).recvUntil('state');
    await g.clientOf(defenderId).recvUntil('state');
    expect(g.state.phase).toBe('layoff');

    // Empty submission is legal: no own melds declared, nothing laid off — so no cards.
    g.clientOf(defenderId).send({ t: 'ginLayoff', layoffs: [] });
    for (const client of [g.clientOf(defenderId), g.clientOf(knockerId)]) {
      const e = await client.recv();
      expect(e).toMatchObject({ t: 'event', kind: 'laidOff', playerId: defenderId, data: { cards: [] } });
      // ginLayoff ends the hand, so the next frame is the wonHand event, then state.
      const won = await client.recv();
      expect(won).toMatchObject({ t: 'event', kind: 'wonHand', playerId: knockerId });
      const s = await client.recv();
      expect(s.t).toBe('state');
    }
    await g.closeAll();
  });

  it('ginLayoff → laidOff names the defender own melds and their layoffs', async () => {
    const g = await startGame('gin');
    const { knockerId, defenderId } = await rigKnock(g);
    await g.clientOf(knockerId).recvUntil('state');
    await g.clientOf(defenderId).recvUntil('state');

    // Own meld of 9s, plus 2S laid off onto the knocker's set of 2s. Both land face-up.
    const rig = setHand(g.state, defenderId, [
      ['9', 'C'],
      ['9', 'D'],
      ['9', 'H'],
      ['2', 'S'],
    ]);
    const knockerMelds = g.state.players.find((p) => p.id === knockerId)!.melds;
    const twosMeld = knockerMelds.find((m) => m.cardIds.some((id) => g.state.cardRegistry.get(id)?.rank === '2'))!;

    g.clientOf(defenderId).send({
      t: 'ginLayoff',
      ownMelds: [[rig[0]!.id, rig[1]!.id, rig[2]!.id]],
      layoffs: [{ cardId: rig[3]!.id, meldId: twosMeld.id }],
    });
    for (const client of [g.clientOf(defenderId), g.clientOf(knockerId)]) {
      const e = await client.recv();
      expect(e).toMatchObject({
        t: 'event',
        kind: 'laidOff',
        playerId: defenderId,
        data: { cards: [rig[0], rig[1], rig[2], rig[3]] },
      });
      await client.recvUntil('state');
    }
    await g.closeAll();
  });
});

describe('action events — 500 rummy', () => {
  it('drawFromPile (pile dive) → drew {from:pile}', async () => {
    const g = await startGame('rum500');
    const actorId = g.state.turnPlayerId;
    const actor = g.clientOf(actorId);

    // Hand holds 7C+7D so diving for the buried 7H has a legal fresh meld (preflight).
    setHand(g.state, actorId, [
      ['7', 'C'],
      ['7', 'D'],
      ['K', 'S'],
      ['Q', 'H'],
      ['9', 'C'],
    ]);
    const pile = setDiscard(g.state, [
      ['4', 'C'],
      ['7', 'H'],
      ['9', 'D'],
    ]);

    // The dive takes the selected card and everything above it — both are named.
    const taken = { from: 'pile', cards: [pile[1], pile[2]] };
    actor.send({ t: 'drawFromPile', cardId: pile[1]!.id });
    await expectEventThenState(actor, 'drew', actorId, taken);
    await expectEventThenState(g.otherOf(actorId), 'drew', actorId, taken);
    await g.closeAll();
  });
});
