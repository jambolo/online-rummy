import { describe, expect, it } from 'vitest';
import type { Card } from '@online-rummy/shared';
import { makeSeededRNG } from '../../rng.js';
import { applyAction } from '../dispatch.js';
import { createBasicGame } from '../variants/basic.js';
import { createRum500Game } from '../variants/rum500.js';
import { createGinGame } from '../variants/gin.js';

function c(rank: Card['rank'], suit: Card['suit'], id?: string): Card {
  return { id: id ?? `${rank}${suit}`, rank, suit };
}

const two = [
  { id: 'p1', name: 'Alice' },
  { id: 'p2', name: 'Bob' },
];

function basicGame() {
  return createBasicGame('room1', two, makeSeededRNG(1), 0);
}

describe('applyAction — basic happy paths', () => {
  it('draw returns { kind: "state" } and advances to meld', () => {
    const state = basicGame();
    expect(applyAction(state, 'p1', { t: 'draw', from: 'stock' })).toEqual({ kind: 'state' });
    expect(state.phase).toBe('meld');
  });

  it('meld + layoff return { kind: "state" }', () => {
    const state = basicGame();
    const set = [c('Q', 'C', 'q1'), c('Q', 'D', 'q2'), c('Q', 'H', 'q3')];
    set.forEach((card) => state.cardRegistry.set(card.id, card));
    state.players[0]!.hand.push(...set);
    applyAction(state, 'p1', { t: 'draw', from: 'stock' });
    expect(applyAction(state, 'p1', { t: 'meld', cardIds: ['q1', 'q2', 'q3'] })).toEqual({
      kind: 'state',
    });

    // lay a 4th queen onto p1's own set
    const lo = c('Q', 'S', 'q4');
    state.cardRegistry.set(lo.id, lo);
    state.players[0]!.hand.push(lo);
    const meldId = state.players[0]!.melds[0]!.id;
    expect(applyAction(state, 'p1', { t: 'layoff', meldId, cardId: 'q4' })).toEqual({
      kind: 'state',
    });
  });

  it('discard returns { kind: "state" } mid-hand', () => {
    const state = basicGame();
    applyAction(state, 'p1', { t: 'draw', from: 'stock' });
    const cardId = state.players[0]!.hand[0]!.id;
    expect(applyAction(state, 'p1', { t: 'discard', cardId })).toEqual({ kind: 'state' });
  });

  it('discard returns { kind: "handEnded" } when the hand empties', () => {
    const state = basicGame();
    const last = c('A', 'S', 'win-keep');
    state.cardRegistry.set(last.id, last);
    state.players[0]!.hand = [last]; // single card → discarding it empties the hand
    state.phase = 'discard';
    expect(applyAction(state, 'p1', { t: 'discard', cardId: 'win-keep' })).toEqual({
      kind: 'handEnded',
    });
  });

  it('non-engine actions (create/join/start/chat/keepalive/leave) return { kind: "noop" }', () => {
    const state = basicGame();
    expect(applyAction(state, 'p1', { t: 'create', variant: 'basic', name: 'X' })).toEqual({
      kind: 'noop',
    });
    expect(applyAction(state, 'p1', { t: 'join', roomCode: 'A', name: 'X' })).toEqual({
      kind: 'noop',
    });
    expect(applyAction(state, 'p1', { t: 'start' })).toEqual({ kind: 'noop' });
    expect(applyAction(state, 'p1', { t: 'chat', text: 'hi' })).toEqual({ kind: 'noop' });
    expect(applyAction(state, 'p1', { t: 'keepalive' })).toEqual({ kind: 'noop' });
    expect(applyAction(state, 'p1', { t: 'leave' })).toEqual({ kind: 'noop' });
  });
});

describe('applyAction — rum500 drawFromPile', () => {
  it('routes drawFromPile and returns { kind: "state" }', () => {
    const state = createRum500Game('room1', two, makeSeededRNG(1), 0);
    const cardId = state.discardPile[0]!.id;
    expect(applyAction(state, 'p1', { t: 'drawFromPile', cardId })).toEqual({ kind: 'state' });
  });
});

describe('applyAction — gin paths', () => {
  function ginGame() {
    return createGinGame('room1', two, makeSeededRNG(1), 0);
  }

  it('passUpcard returns { kind: "stateAll" }', () => {
    const state = ginGame();
    expect(applyAction(state, 'p1', { t: 'passUpcard' })).toEqual({ kind: 'stateAll' });
    expect(state.turnPlayerId).toBe('p2');
  });

  it('gin knock (0 deadwood) returns { kind: "stateAll" }, advances to layoff, then ginLayoff returns { kind: "handEnded" }', () => {
    const state = ginGame();
    const p1Hand = [
      c('A', 'C', 'g1'),
      c('2', 'C', 'g2'),
      c('3', 'C', 'g3'),
      c('4', 'C', 'g4'),
      c('A', 'D', 'g5'),
      c('2', 'D', 'g6'),
      c('3', 'D', 'g7'),
      c('A', 'H', 'g8'),
      c('2', 'H', 'g9'),
      c('3', 'H', 'g10'),
      c('K', 'S', 'g_disc'),
    ];
    const p2Hand = [c('7', 'C', 'd1'), c('8', 'D', 'd2'), c('9', 'H', 'd3')];
    [...p1Hand, ...p2Hand].forEach((card) => state.cardRegistry.set(card.id, card));
    state.players[0]!.hand = [...p1Hand];
    state.players[1]!.hand = [...p2Hand];
    state.phase = 'discard';
    const knockResult = applyAction(state, 'p1', {
      t: 'knock',
      melds: [
        ['g1', 'g2', 'g3', 'g4'],
        ['g5', 'g6', 'g7'],
        ['g8', 'g9', 'g10'],
      ],
      discardId: 'g_disc',
    });
    // Defender gets a layoff turn (to group own melds — not to lay off against gin).
    expect(knockResult).toEqual({ kind: 'stateAll' });
    expect(state.phase).toBe('layoff');
    expect(state.turnPlayerId).toBe('p2');

    const layoffResult = applyAction(state, 'p2', { t: 'ginLayoff', layoffs: [] });
    expect(layoffResult).toEqual({ kind: 'handEnded' });
    expect(state.phase).toBe('ended');
  });

  it('non-gin knock returns { kind: "stateAll" } and advances to layoff, then ginLayoff returns { kind: "handEnded" }', () => {
    const state = ginGame();
    const p1Hand = [
      c('A', 'C', 'k1'),
      c('2', 'C', 'k2'),
      c('3', 'C', 'k3'),
      c('4', 'C', 'k4'),
      c('5', 'C', 'k5'),
      c('K', 'D', 'k_disc'),
    ];
    const p2Hand = [c('4', 'C', 'd1'), c('5', 'C', 'd2'), c('6', 'C', 'd3')];
    [...p1Hand, ...p2Hand].forEach((card) => state.cardRegistry.set(card.id, card));
    state.players[0]!.hand = [...p1Hand];
    state.players[1]!.hand = [...p2Hand];
    state.phase = 'discard';

    const knockResult = applyAction(state, 'p1', {
      t: 'knock',
      melds: [['k1', 'k2', 'k3']],
      discardId: 'k_disc',
    });
    expect(knockResult).toEqual({ kind: 'stateAll' });
    expect(state.phase).toBe('layoff');

    const meldId = state.players[0]!.melds[0]!.id;
    const layoffResult = applyAction(state, 'p2', {
      t: 'ginLayoff',
      layoffs: [{ cardId: 'd1', meldId }],
    });
    expect(layoffResult).toEqual({ kind: 'handEnded' });
    expect(state.phase).toBe('ended');
  });

  it('discard that depletes stock returns { kind: "handCancelled" }', () => {
    const state = ginGame();
    // Skip the upcard offer to reach normal draw/discard play.
    applyAction(state, 'p1', { t: 'passUpcard' });
    applyAction(state, 'p2', { t: 'passUpcard' });
    state.stock = state.stock.slice(0, 3);
    applyAction(state, 'p1', { t: 'draw', from: 'stock' }); // stock → 2
    const cardId = state.players[0]!.hand[0]!.id;
    expect(applyAction(state, 'p1', { t: 'discard', cardId })).toEqual({ kind: 'handCancelled' });
  });
});

describe('applyAction — not implemented for variant', () => {
  it('drawFromPile on basic throws ERR_NOT_IMPLEMENTED', () => {
    const state = basicGame();
    expect(() => applyAction(state, 'p1', { t: 'drawFromPile', cardId: 'x' })).toThrow('ERR_NOT_IMPLEMENTED:drawFromPile');
  });

  it('passUpcard on basic throws ERR_NOT_IMPLEMENTED', () => {
    const state = basicGame();
    expect(() => applyAction(state, 'p1', { t: 'passUpcard' })).toThrow('ERR_NOT_IMPLEMENTED:passUpcard');
  });

  it('knock on basic throws ERR_NOT_IMPLEMENTED', () => {
    const state = basicGame();
    expect(() => applyAction(state, 'p1', { t: 'knock', discardId: 'x' })).toThrow('ERR_NOT_IMPLEMENTED:knock');
  });

  it('ginLayoff on basic throws ERR_NOT_IMPLEMENTED', () => {
    const state = basicGame();
    expect(() => applyAction(state, 'p1', { t: 'ginLayoff', layoffs: [] })).toThrow('ERR_NOT_IMPLEMENTED:ginLayoff');
  });
});
