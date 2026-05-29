import { describe, expect, it } from 'vitest';
import { makeSeededRNG } from '../../rng.js';
import { createBasicGame } from '../variants/basic.js';
import {
  advanceTurn,
  buildBaseState,
  detectMeldKind,
  lookupCard,
  makeMeldId,
  requireTurn,
} from '../util.js';

const players = [
  { id: 'p1', name: 'Alice' },
  { id: 'p2', name: 'Bob' },
];

function game() {
  return createBasicGame('room1', players, makeSeededRNG(1), 0);
}

describe('requireTurn', () => {
  it('returns the current player on a valid turn', () => {
    const state = game();
    expect(requireTurn(state, 'p1').id).toBe('p1');
  });

  it('throws ERR_NOT_YOUR_TURN when not the active player', () => {
    const state = game();
    expect(() => requireTurn(state, 'p2')).toThrow('ERR_NOT_YOUR_TURN');
  });

  it('throws ERR_PLAYER_NOT_FOUND when the turn id has no matching player', () => {
    const state = game();
    state.turnPlayerId = 'ghost';
    expect(() => requireTurn(state, 'ghost')).toThrow('ERR_PLAYER_NOT_FOUND');
  });

  it('throws ERR_PLAYER_FORFEITED when the active player has forfeited', () => {
    const state = game();
    state.players[0]!.status = 'forfeited';
    expect(() => requireTurn(state, 'p1')).toThrow('ERR_PLAYER_FORFEITED');
  });
});

describe('lookupCard', () => {
  it('returns a registered card', () => {
    const state = game();
    const id = state.players[0]!.hand[0]!.id;
    expect(lookupCard(state, id).id).toBe(id);
  });

  it('throws ERR_UNKNOWN_CARD for an unregistered id', () => {
    const state = game();
    expect(() => lookupCard(state, 'no-such-card')).toThrow('ERR_UNKNOWN_CARD:no-such-card');
  });
});

describe('advanceTurn', () => {
  it('rotates to the next active player and resets phase/drewFromDiscardId', () => {
    const state = game();
    state.phase = 'discard';
    state.drewFromDiscardId = 'something';
    advanceTurn(state);
    expect(state.turnPlayerId).toBe('p2');
    expect(state.phase).toBe('draw');
    expect(state.drewFromDiscardId).toBeNull();
  });

  it('throws ERR_NO_ACTIVE_PLAYERS when no players are active', () => {
    const state = game();
    state.players.forEach((p) => (p.status = 'forfeited'));
    expect(() => advanceTurn(state)).toThrow('ERR_NO_ACTIVE_PLAYERS');
  });
});

describe('detectMeldKind', () => {
  it('detects a set when all ranks match', () => {
    expect(
      detectMeldKind([
        { id: '1', rank: '7', suit: 'C' },
        { id: '2', rank: '7', suit: 'D' },
      ]),
    ).toBe('set');
  });

  it('detects a run when ranks differ', () => {
    expect(
      detectMeldKind([
        { id: '1', rank: '5', suit: 'C' },
        { id: '2', rank: '6', suit: 'C' },
      ]),
    ).toBe('run');
  });
});

describe('buildBaseState', () => {
  it('falls back to an empty hand when deal.hands is shorter than players', () => {
    // players has 2 entries but deal supplies a single hand → second player gets [].
    const state = buildBaseState(
      'r',
      'basic',
      players,
      { hands: [[{ id: 'c1', rank: 'A', suit: 'S' }]], stock: [], discard: [] },
      makeSeededRNG(1),
      'draw',
      {},
      0,
    );
    expect(state.players[0]!.hand).toHaveLength(1);
    expect(state.players[1]!.hand).toEqual([]);
  });

  it('uses rng to pick the first player when firstPlayerIndex is omitted', () => {
    // Seeded rng(0,2) is deterministic, so the chosen first player is stable.
    const state = buildBaseState(
      'r',
      'basic',
      players,
      { hands: [[], []], stock: [], discard: [] },
      makeSeededRNG(1),
      'draw',
      {},
    );
    expect(['p1', 'p2']).toContain(state.firstPlayerId);
    expect(state.turnPlayerId).toBe(state.firstPlayerId);
  });
});

describe('makeMeldId', () => {
  it('returns unique ids', () => {
    expect(makeMeldId()).not.toBe(makeMeldId());
  });
});
