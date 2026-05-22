import { describe, expect, it } from 'vitest';
import type { Card } from '@online-rummy/shared';
import { makeSeededRNG } from '../../rng.js';
import { createBasicGame } from '../variants/basic.js';
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
    );
    const { results } = runScript(state, [
      { t: 'discard', cardId: 'nonexistent' }, // error
      { t: 'draw', from: 'stock' },            // should succeed
    ]);
    expect(results[0]?.ok).toBe(false);
    expect(results[1]?.ok).toBe(true);
  });

  it('golden path: p1 draws, melds a set, discards, p2 draws, discards', () => {
    const state = createBasicGame(
      'room1',
      [{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' }],
      makeSeededRNG(42),
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
