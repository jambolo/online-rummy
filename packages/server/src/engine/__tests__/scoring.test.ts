import { describe, expect, it } from 'vitest';
import type { Card } from '@online-rummy/shared';
import { validateMeld } from '@online-rummy/shared';
import { deadwood, validateKnockMelds } from '../scoring.js';
import { createBasicGame } from '../variants/basic.js';
import { makeSeededRNG } from '../../rng.js';

function c(rank: Card['rank'], suit: Card['suit'], id?: string): Card {
  return { id: id ?? `${rank}${suit}`, rank, suit };
}

describe('deadwood', () => {
  it('A=1, pip=pip, face=10 (default aceValue=1)', () => {
    const player = {
      id: 'p',
      name: 'P',
      melds: [],
      score: 0,
      status: 'active' as const,
      hand: [c('A', 'C'), c('5', 'D'), c('K', 'H')],
    };
    expect(deadwood(player)).toBe(1 + 5 + 10);
  });

  it('A=15 when aceValue=15 (500 Rummy)', () => {
    const player = {
      id: 'p',
      name: 'P',
      melds: [],
      score: 0,
      status: 'active' as const,
      hand: [c('A', 'C'), c('5', 'D')],
    };
    expect(deadwood(player, 15)).toBe(15 + 5);
  });

  it('empty hand → 0', () => {
    const player = {
      id: 'p',
      name: 'P',
      melds: [],
      score: 0,
      status: 'active' as const,
      hand: [],
    };
    expect(deadwood(player)).toBe(0);
  });
});

describe('validateKnockMelds', () => {
  const GIN_OPTS = { aceHigh: false, roundTheCorner: false };
  const ginValidate = (cards: Card[]) => validateMeld(cards, GIN_OPTS);

  function setup(hand: Card[]) {
    const state = createBasicGame(
      'room1',
      [
        { id: 'p1', name: 'A' },
        { id: 'p2', name: 'B' },
      ],
      makeSeededRNG(1),
      0,
    );
    for (const card of hand) state.cardRegistry.set(card.id, card);
    state.players[0]!.hand = [...hand];
    return { state, player: state.players[0]! };
  }

  it('empty groups → empty result', () => {
    const { state, player } = setup([]);
    const { validated, meldedIds } = validateKnockMelds(state, player, undefined, ginValidate);
    expect(validated).toEqual([]);
    expect(meldedIds.size).toBe(0);
  });

  it('valid set + run → both validated, meldedIds union populated', () => {
    const hand = [c('5', 'C', 's1'), c('5', 'D', 's2'), c('5', 'H', 's3'), c('A', 'C', 'r1'), c('2', 'C', 'r2'), c('3', 'C', 'r3')];
    const { state, player } = setup(hand);
    const { validated, meldedIds } = validateKnockMelds(
      state,
      player,
      [
        ['s1', 's2', 's3'],
        ['r1', 'r2', 'r3'],
      ],
      ginValidate,
    );
    expect(validated).toHaveLength(2);
    expect(validated[0]?.kind).toBe('set');
    expect(validated[1]?.kind).toBe('run');
    expect(meldedIds.size).toBe(6);
  });

  it('card in two groups → ERR_CARD_IN_MULTIPLE_MELDS', () => {
    const hand = [c('7', 'C', 'a'), c('7', 'D', 'b'), c('7', 'H', 'c'), c('7', 'S', 'd'), c('8', 'C', 'e'), c('8', 'D', 'f')];
    const { state, player } = setup(hand);
    expect(() =>
      validateKnockMelds(
        state,
        player,
        [
          ['a', 'b', 'c'],
          ['c', 'd', 'e'],
        ],
        ginValidate,
      ),
    ).toThrow('ERR_CARD_IN_MULTIPLE_MELDS:c');
  });

  it('card not in hand → ERR_CARD_NOT_IN_HAND', () => {
    const hand = [c('7', 'C', 'a'), c('7', 'D', 'b'), c('7', 'H', 'c')];
    const { state, player } = setup(hand);
    expect(() => validateKnockMelds(state, player, [['a', 'b', 'missing']], ginValidate)).toThrow('ERR_CARD_NOT_IN_HAND:missing');
  });

  it('group fails validate → ERR_INVALID_MELD', () => {
    const hand = [c('5', 'C', 'x'), c('7', 'D', 'y'), c('9', 'H', 'z')];
    const { state, player } = setup(hand);
    expect(() => validateKnockMelds(state, player, [['x', 'y', 'z']], ginValidate)).toThrow('ERR_INVALID_MELD');
  });
});
