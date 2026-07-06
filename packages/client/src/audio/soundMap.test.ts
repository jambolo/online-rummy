import { describe, expect, it } from 'vitest';
import type { EventKind, PublicState, S2C } from '@online-rummy/shared';
import { soundForMessage } from './soundMap';
import type { SoundContext, SoundId } from './soundMap';

const makePublic = (overrides: Partial<PublicState> = {}): PublicState => ({
  roomId: 'R1',
  variant: 'basic',
  players: [],
  turnPlayerId: 'p1',
  phase: 'draw',
  discardTop: null,
  discardPileSize: 0,
  discardPile: [],
  stockSize: 40,
  meldedBy: {},
  variantPublic: { variant: 'basic', data: {} },
  houseRules: {},
  ...overrides,
});

const makeCtx = (overrides: Partial<SoundContext> = {}): SoundContext => ({
  prevPublic: null,
  myPlayerId: null,
  myName: null,
  prevLobbyCount: 0,
  ...overrides,
});

const ev = (kind: EventKind, playerId = 'p1', data?: unknown): S2C => ({
  t: 'event',
  kind,
  playerId,
  data,
});

const state = (pub: PublicState): S2C => ({ t: 'state', public: pub });

const lobby = (playerCount: number): S2C => ({
  t: 'lobby',
  roomCode: 'ABCD',
  variant: 'basic',
  hostId: 'p1',
  players: Array.from({ length: playerCount }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` })),
  sessionId: 'sess',
  houseRules: {},
});

describe('soundForMessage: drew event', () => {
  const cases: Array<{ name: string; data: unknown; expected: SoundId }> = [
    { name: 'from stock', data: { from: 'stock' }, expected: 'draw-stock' },
    { name: 'from discard', data: { from: 'discard' }, expected: 'draw-discard' },
    { name: 'from pile (500 dive)', data: { from: 'pile' }, expected: 'pile-dive' },
    { name: 'absent payload falls back to stock', data: undefined, expected: 'draw-stock' },
    { name: 'unknown from value falls back to stock', data: { from: 'bogus' }, expected: 'draw-stock' },
    { name: 'non-object payload falls back to stock', data: 42, expected: 'draw-stock' },
  ];

  it.each(cases)('$name -> $expected', ({ data, expected }) => {
    expect(soundForMessage(ev('drew', 'p1', data), makeCtx())).toBe(expected);
  });
});

describe('soundForMessage: other event kinds', () => {
  const cases: Array<{ kind: EventKind; expected: SoundId | null }> = [
    { kind: 'melded', expected: 'meld' },
    { kind: 'laidOff', expected: 'layoff' },
    { kind: 'discarded', expected: 'discard' },
    { kind: 'knocked', expected: 'knock' },
    { kind: 'passedUpcard', expected: null },
    { kind: 'gameStarted', expected: 'deal' },
    { kind: 'gameOver', expected: 'game-over' },
    { kind: 'handCancelled', expected: 'hand-cancelled' },
    { kind: 'forfeit', expected: 'forfeit' },
    { kind: 'playerDisconnected', expected: 'disconnect' },
    { kind: 'playerReconnected', expected: 'reconnect' },
    { kind: 'playerLeft', expected: null },
  ];

  it.each(cases)('$kind -> $expected', ({ kind, expected }) => {
    expect(soundForMessage(ev(kind), makeCtx())).toBe(expected);
  });
});

describe('soundForMessage: wonHand event', () => {
  const me = makeCtx({ myPlayerId: 'me' });

  it('gin result -> gin, even when the winner is me', () => {
    const data = { ginInfo: { result: 'gin' } };
    expect(soundForMessage(ev('wonHand', 'me', data), me)).toBe('gin');
    expect(soundForMessage(ev('wonHand', 'p2', data), me)).toBe('gin');
  });

  it('undercut result -> undercut regardless of winner', () => {
    const data = { ginInfo: { result: 'undercut' } };
    expect(soundForMessage(ev('wonHand', 'me', data), me)).toBe('undercut');
    expect(soundForMessage(ev('wonHand', 'p2', data), me)).toBe('undercut');
  });

  it('knock result falls through to the generic win/lose outcome', () => {
    const data = { ginInfo: { result: 'knock' } };
    expect(soundForMessage(ev('wonHand', 'me', data), me)).toBe('go-out');
    expect(soundForMessage(ev('wonHand', 'p2', data), me)).toBe('hand-over');
  });

  it('me without ginInfo -> go-out', () => {
    expect(soundForMessage(ev('wonHand', 'me'), me)).toBe('go-out');
  });

  it('other player without ginInfo -> hand-over', () => {
    expect(soundForMessage(ev('wonHand', 'p2'), me)).toBe('hand-over');
  });
});

describe('soundForMessage: state (your-turn)', () => {
  const base = { myPlayerId: 'me' };

  it('fires on turn transition to me mid-hand', () => {
    const ctx = makeCtx({ ...base, prevPublic: makePublic({ turnPlayerId: 'p2' }) });
    expect(soundForMessage(state(makePublic({ turnPlayerId: 'me' })), ctx)).toBe('your-turn');
  });

  it('suppressed when prevPublic is null', () => {
    const ctx = makeCtx(base);
    expect(soundForMessage(state(makePublic({ turnPlayerId: 'me' })), ctx)).toBeNull();
  });

  it('suppressed when myPlayerId is null', () => {
    const ctx = makeCtx({ prevPublic: makePublic({ turnPlayerId: 'p2' }) });
    expect(soundForMessage(state(makePublic({ turnPlayerId: 'me' })), ctx)).toBeNull();
  });

  it('suppressed when the previous phase was ended', () => {
    const ctx = makeCtx({
      ...base,
      prevPublic: makePublic({ turnPlayerId: 'p2', phase: 'ended' }),
    });
    expect(soundForMessage(state(makePublic({ turnPlayerId: 'me' })), ctx)).toBeNull();
  });

  it('suppressed when the new phase is ended', () => {
    const ctx = makeCtx({ ...base, prevPublic: makePublic({ turnPlayerId: 'p2' }) });
    expect(soundForMessage(state(makePublic({ turnPlayerId: 'me', phase: 'ended' })), ctx)).toBeNull();
  });

  it('suppressed on re-broadcast with turn unchanged', () => {
    const ctx = makeCtx({ ...base, prevPublic: makePublic({ turnPlayerId: 'me' }) });
    expect(soundForMessage(state(makePublic({ turnPlayerId: 'me' })), ctx)).toBeNull();
  });

  it('suppressed on transition to someone else', () => {
    const ctx = makeCtx({ ...base, prevPublic: makePublic({ turnPlayerId: 'p2' }) });
    expect(soundForMessage(state(makePublic({ turnPlayerId: 'p3' })), ctx)).toBeNull();
  });
});

describe('soundForMessage: chat', () => {
  it('another sender -> chat', () => {
    const ctx = makeCtx({ myName: 'Alice' });
    expect(soundForMessage({ t: 'chat', from: 'Bob', text: 'hi' }, ctx)).toBe('chat');
  });

  it('own name -> null', () => {
    const ctx = makeCtx({ myName: 'Alice' });
    expect(soundForMessage({ t: 'chat', from: 'Alice', text: 'hi' }, ctx)).toBeNull();
  });

  it('myName null -> null', () => {
    expect(soundForMessage({ t: 'chat', from: 'Bob', text: 'hi' }, makeCtx())).toBeNull();
  });
});

describe('soundForMessage: error', () => {
  const err: S2C = { t: 'error', code: 'ERR_NOT_YOUR_TURN', msg: 'Not your turn' };

  it('pre-join (prevPublic null) -> null', () => {
    expect(soundForMessage(err, makeCtx())).toBeNull();
  });

  it('in-game -> error', () => {
    expect(soundForMessage(err, makeCtx({ prevPublic: makePublic() }))).toBe('error');
  });

  // The store's error branch swallows these stale-session codes with no visible UI,
  // so no buzz even mid-game (e.g. auto-rejoin after the reconnect grace expired).
  it.each(['ERR_SESSION_NOT_FOUND', 'ERR_INVALID_SESSION', 'ERR_GAME_IN_PROGRESS'])(
    'swallowed code %s -> null even in-game',
    (code) => {
      const msg: S2C = { t: 'error', code, msg: 'stale session' };
      expect(soundForMessage(msg, makeCtx({ prevPublic: makePublic() }))).toBeNull();
    },
  );
});

describe('soundForMessage: lobby', () => {
  it('initial snapshot (prevLobbyCount 0) -> null', () => {
    expect(soundForMessage(lobby(2), makeCtx({ prevLobbyCount: 0 }))).toBeNull();
  });

  it('growth 1 -> 2 -> player-joined', () => {
    expect(soundForMessage(lobby(2), makeCtx({ prevLobbyCount: 1 }))).toBe('player-joined');
  });

  it('same-size rebroadcast -> null', () => {
    expect(soundForMessage(lobby(2), makeCtx({ prevLobbyCount: 2 }))).toBeNull();
  });

  it('shrink -> null', () => {
    expect(soundForMessage(lobby(1), makeCtx({ prevLobbyCount: 2 }))).toBeNull();
  });
});

describe('soundForMessage: keepalive', () => {
  it('-> null', () => {
    expect(soundForMessage({ t: 'keepalive', from: 'p2' }, makeCtx())).toBeNull();
  });
});
