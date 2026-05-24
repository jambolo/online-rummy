import { describe, expect, it } from 'vitest';
import type { Card } from '@online-rummy/shared';
import { makeSeededRNG } from '../../rng.js';
import { createBasicGame } from '../variants/basic.js';
import { createRum500Game } from '../variants/rum500.js';
import { runScript } from '../scripted-player.js';

function c(rank: Card['rank'], suit: Card['suit'], id?: string): Card {
  return { id: id ?? `${rank}${suit}`, rank, suit };
}

function injectHand(state: ReturnType<typeof createBasicGame>, playerId: string, cards: Card[]) {
  const player = state.players.find((p) => p.id === playerId)!;
  player.hand.push(...cards);
  cards.forEach((card) => state.cardRegistry.set(card.id, card));
}

describe('runScript', () => {
  it('records ok result for valid draw', () => {
    const state = createBasicGame(
      'room1',
      [{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' }],
      makeSeededRNG(1),
      0,
    );
    const { results } = runScript(state, [{ t: 'draw', from: 'stock' }]);
    expect(results[0]?.ok).toBe(true);
    expect((results[0] as { stateAfter: { phase: string } }).stateAfter.phase).toBe('meld');
  });

  it('records error result for invalid action', () => {
    const state = createBasicGame(
      'room1',
      [{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' }],
      makeSeededRNG(1),
      0,
    );
    // Try to discard before drawing
    const { results } = runScript(state, [{ t: 'discard', cardId: state.players[0]!.hand[0]!.id }]);
    expect(results[0]?.ok).toBe(false);
    expect((results[0] as { error: string }).error).toContain('ERR_WRONG_PHASE');
  });

  it('continues running after an error', () => {
    const state = createBasicGame(
      'room1',
      [{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' }],
      makeSeededRNG(1),
      0,
    );
    const { results } = runScript(state, [
      { t: 'discard', cardId: 'nonexistent' }, // error
      { t: 'draw', from: 'stock' },            // should succeed
    ]);
    expect(results[0]?.ok).toBe(false);
    expect(results[1]?.ok).toBe(true);
  });

  it('dispatches layoff action via runScript', () => {
    const state = createBasicGame(
      'room1',
      [{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' }],
      makeSeededRNG(1),
      0,
    );
    const setCards = [c('Q', 'C', 'q1'), c('Q', 'D', 'q2'), c('Q', 'H', 'q3')];
    injectHand(state, 'p1', setCards);
    state.players[1]!.melds.push({
      id: 'opMeld',
      kind: 'set',
      cardIds: ['t1', 't2', 't3'],
      ownerId: 'p2',
    });
    [c('5', 'C', 't1'), c('5', 'D', 't2'), c('5', 'H', 't3')].forEach((card) =>
      state.cardRegistry.set(card.id, card),
    );
    const lo = c('5', 'S', 'lo');
    injectHand(state, 'p1', [lo]);
    const { results } = runScript(state, [
      { t: 'draw', from: 'stock' },
      { t: 'meld', cardIds: ['q1', 'q2', 'q3'] },
      { t: 'layoff', meldId: 'opMeld', cardId: 'lo' },
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it('dispatches drawFromPile for rum500 variant', () => {
    const state = createRum500Game(
      'room1',
      [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }],
      makeSeededRNG(1),
      0,
    );
    const target = state.discardPile[0]!.id;
    const { results } = runScript(state, [{ t: 'drawFromPile', cardId: target }]);
    expect(results[0]?.ok).toBe(true);
  });

  it('drawFromPile against basic variant returns ERR_NOT_IMPLEMENTED', () => {
    const state = createBasicGame(
      'room1',
      [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }],
      makeSeededRNG(1),
      0,
    );
    const { results } = runScript(state, [{ t: 'drawFromPile', cardId: 'whatever' }]);
    expect(results[0]?.ok).toBe(false);
    expect((results[0] as { error: string }).error).toContain('ERR_NOT_IMPLEMENTED');
  });

  it.each([
    { t: 'chat' as const, text: 'hi' },
    { t: 'create' as const, variant: 'basic' as const, name: 'X' },
    { t: 'join' as const, roomCode: 'A', name: 'X' },
    { t: 'start' as const },
  ])('non-engine action $t is a no-op', (action) => {
    const state = createBasicGame(
      'room1',
      [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }],
      makeSeededRNG(1),
      0,
    );
    const phaseBefore = state.phase;
    const { results } = runScript(state, [action]);
    expect(results[0]?.ok).toBe(true);
    expect(state.phase).toBe(phaseBefore);
  });

  it('engine action not available for variant returns ERR_NOT_IMPLEMENTED', () => {
    // basic has no applyKnock — dispatcher rejects, scripted result records error.
    const state = createBasicGame(
      'room1',
      [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }],
      makeSeededRNG(1),
      0,
    );
    const { results } = runScript(state, [{ t: 'knock' as const, discardId: 'none' }]);
    expect(results[0]?.ok).toBe(false);
    expect((results[0] as { error: string }).error).toContain('ERR_NOT_IMPLEMENTED');
  });

  it('golden path: p1 draws, melds a set, discards, p2 draws, discards', () => {
    const state = createBasicGame(
      'room1',
      [{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' }],
      makeSeededRNG(42),
      0,
    );

    // Inject known set + extra cards into p1 hand
    const meldCards = [c('J', 'C', 'jc'), c('J', 'D', 'jd'), c('J', 'H', 'jh')];
    injectHand(state, 'p1', meldCards);

    const { results, finalState } = runScript(state, [
      { t: 'draw', from: 'stock' },
      { t: 'meld', cardIds: ['jc', 'jd', 'jh'] },
      { t: 'discard', cardId: state.players[0]!.hand[0]!.id },
      { t: 'draw', from: 'stock' },
      { t: 'discard', cardId: state.players[1]!.hand[0]!.id },
    ]);

    const allOk = results.every((r) => r.ok);
    expect(allOk).toBe(true);
    // p1 should have a meld
    const p1 = finalState.players.find((p: { id: string }) => p.id === 'p1')!;
    expect((p1 as { melds: unknown[] }).melds).toHaveLength(1);
    // Turn should be back with p1 after p2 discards
    expect(finalState.turnPlayerId).toBe('p1');
  });
});
