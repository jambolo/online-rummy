import { describe, expect, it } from 'vitest';
import type { Card } from '@online-rummy/shared';
import { makeSeededRNG } from '../../rng.js';
import {
  applyDiscard,
  applyDraw,
  applyLayoff,
  applyMeld,
  basicVariant,
  createBasicGame,
} from '../variants/basic.js';

function c(rank: Card['rank'], suit: Card['suit'], id?: string): Card {
  return { id: id ?? `${rank}${suit}`, rank, suit };
}

function twoPlayerGame(seed = 1) {
  return createBasicGame(
    'room1',
    [
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ],
    makeSeededRNG(seed),
  );
}

// ---- createBasicGame ----

describe('createBasicGame', () => {
  it('deals 10 cards each for 2P', () => {
    // rules.md A.1.2
    const state = twoPlayerGame();
    expect(state.players[0]?.hand).toHaveLength(10);
    expect(state.players[1]?.hand).toHaveLength(10);
  });

  it('leaves 31 cards in stock (52 - 20 dealt - 1 discard)', () => {
    const state = twoPlayerGame();
    expect(state.stock).toHaveLength(31);
  });

  it('starts with 1 discard card', () => {
    const state = twoPlayerGame();
    expect(state.discardPile).toHaveLength(1);
  });

  it('starts in draw phase', () => {
    const state = twoPlayerGame();
    expect(state.phase).toBe('draw');
  });

  it('all 52 cards in registry', () => {
    const state = twoPlayerGame();
    expect(state.cardRegistry.size).toBe(52);
  });

  it('deals 7 cards each for 3P', () => {
    const state = createBasicGame(
      'r',
      [
        { id: 'p1', name: 'A' },
        { id: 'p2', name: 'B' },
        { id: 'p3', name: 'C' },
      ],
      makeSeededRNG(1),
    );
    for (const p of state.players) {
      expect(p.hand).toHaveLength(7);
    }
  });

  it('rejects invalid player count', () => {
    expect(() =>
      createBasicGame('r', [{ id: 'p1', name: 'A' }], makeSeededRNG(1)),
    ).toThrow('ERR_INVALID_PLAYER_COUNT');
  });
});

// ---- applyDraw ----

describe('applyDraw', () => {
  it('draws from stock, adds to hand', () => {
    const state = twoPlayerGame();
    const before = state.players[0]!.hand.length;
    applyDraw(state, 'p1', 'stock');
    expect(state.players[0]!.hand).toHaveLength(before + 1);
    expect(state.stock).toHaveLength(30);
  });

  it('phase becomes meld after draw', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    expect(state.phase).toBe('meld');
  });

  it('draws from discard, sets drewFromDiscardId', () => {
    const state = twoPlayerGame();
    const topId = state.discardPile[0]!.id;
    applyDraw(state, 'p1', 'discard');
    expect(state.drewFromDiscardId).toBe(topId);
    expect(state.discardPile).toHaveLength(0);
  });

  it('throws ERR_NOT_YOUR_TURN for wrong player', () => {
    const state = twoPlayerGame();
    expect(() => applyDraw(state, 'p2', 'stock')).toThrow('ERR_NOT_YOUR_TURN');
  });

  it('throws ERR_WRONG_PHASE if not draw phase', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    expect(() => applyDraw(state, 'p1', 'stock')).toThrow('ERR_WRONG_PHASE');
  });

  it('throws ERR_CANNOT_DRAW_DISCARD when discard pile empty', () => {
    const state = twoPlayerGame();
    state.discardPile = [];
    expect(() => applyDraw(state, 'p1', 'discard')).toThrow('ERR_CANNOT_DRAW_DISCARD');
  });
});

// ---- applyMeld ----

describe('applyMeld', () => {
  it('removes melded cards from hand and adds meld', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');

    // Inject a known set into p1 hand
    const set = [c('9', 'C', 'x1'), c('9', 'D', 'x2'), c('9', 'H', 'x3')];
    set.forEach((card) => {
      state.players[0]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    });
    const beforeLen = state.players[0]!.hand.length;
    applyMeld(state, 'p1', ['x1', 'x2', 'x3']);
    expect(state.players[0]!.hand).toHaveLength(beforeLen - 3);
    expect(state.players[0]!.melds).toHaveLength(1);
    expect(state.players[0]!.melds[0]?.kind).toBe('set');
  });

  it('phase becomes discard after meld', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const run = [c('3', 'S', 'r1'), c('4', 'S', 'r2'), c('5', 'S', 'r3')];
    run.forEach((card) => {
      state.players[0]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    });
    applyMeld(state, 'p1', ['r1', 'r2', 'r3']);
    expect(state.phase).toBe('discard');
  });

  it('marks hasMeldedEver for player', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const set = [c('Q', 'C', 'q1'), c('Q', 'D', 'q2'), c('Q', 'H', 'q3')];
    set.forEach((card) => {
      state.players[0]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    });
    applyMeld(state, 'p1', ['q1', 'q2', 'q3']);
    expect(state.hasMeldedEver.get('p1')).toBe(true);
  });

  it('throws ERR_ALREADY_MELDED_THIS_TURN on second meld same turn', () => {
    // rules.md A.1.6 step 2 [PG-R]
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const set1 = [c('9', 'C', 's1'), c('9', 'D', 's2'), c('9', 'H', 's3')];
    const set2 = [c('8', 'C', 't1'), c('8', 'D', 't2'), c('8', 'H', 't3')];
    [...set1, ...set2].forEach((card) => {
      state.players[0]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    });
    applyMeld(state, 'p1', ['s1', 's2', 's3']);
    expect(() => applyMeld(state, 'p1', ['t1', 't2', 't3'])).toThrow('ERR_ALREADY_MELDED_THIS_TURN');
  });

  it('throws ERR_INVALID_MELD for invalid cards', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const bad = [c('9', 'C', 'b1'), c('10', 'D', 'b2'), c('J', 'H', 'b3')]; // mixed suits
    bad.forEach((card) => {
      state.players[0]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    });
    expect(() => applyMeld(state, 'p1', ['b1', 'b2', 'b3'])).toThrow('ERR_INVALID_MELD');
  });
});

// ---- applyLayoff ----

describe('applyLayoff', () => {
  it('throws ERR_NO_OWN_MELD if player has not melded yet', () => {
    // rules.md A.1.6 step 3 [WP]
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const extraCard = c('6', 'S', 'lo1');
    state.players[0]!.hand.push(extraCard);
    state.cardRegistry.set(extraCard.id, extraCard);
    // p2 has a meld
    const p2set = [c('J', 'C', 'm1'), c('J', 'D', 'm2'), c('J', 'H', 'm3')];
    p2set.forEach((card) => {
      state.players[1]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    });
    // Manually give p2 a meld in state
    state.players[1]!.melds.push({ id: 'meld1', kind: 'set', cardIds: ['m1', 'm2', 'm3'], ownerId: 'p2' });
    expect(() => applyLayoff(state, 'p1', 'meld1', 'lo1')).toThrow('ERR_NO_OWN_MELD');
  });

  it('lays off valid card onto existing run', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');

    // Give p1 a meld so they can lay off
    const ownSet = [c('K', 'C', 'os1'), c('K', 'D', 'os2'), c('K', 'H', 'os3')];
    ownSet.forEach((card) => {
      state.players[0]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    });
    applyMeld(state, 'p1', ['os1', 'os2', 'os3']);

    // Inject a run meld on p2 and a layoff card for p1
    const run = [c('4', 'H', 'run1'), c('5', 'H', 'run2'), c('6', 'H', 'run3')];
    run.forEach((card) => {
      state.cardRegistry.set(card.id, card);
    });
    state.players[1]!.melds.push({ id: 'runMeld', kind: 'run', cardIds: ['run1', 'run2', 'run3'], ownerId: 'p2' });

    const layoffCard = c('7', 'H', 'lo_c');
    state.players[0]!.hand.push(layoffCard);
    state.cardRegistry.set(layoffCard.id, layoffCard);

    applyLayoff(state, 'p1', 'runMeld', 'lo_c');
    const target = state.players[1]!.melds[0]!;
    expect(target.cardIds).toContain('lo_c');
    expect(state.players[0]!.hand.find((c) => c.id === 'lo_c')).toBeUndefined();
  });
});

// ---- applyDiscard ----

describe('applyDiscard', () => {
  it('moves card to discard pile', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const cardId = state.players[0]!.hand[0]!.id;
    applyDiscard(state, 'p1', cardId);
    expect(state.discardPile[state.discardPile.length - 1]?.id).toBe(cardId);
  });

  it('advances to next player on discard', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const cardId = state.players[0]!.hand[0]!.id;
    applyDiscard(state, 'p1', cardId);
    expect(state.turnPlayerId).toBe('p2');
    expect(state.phase).toBe('draw');
  });

  it('throws ERR_CANNOT_DISCARD_DRAWN_CARD when re-discarding drawn discard', () => {
    // rules.md A.1.6 step 4 [PG-R]
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'discard');
    const drawnId = state.drewFromDiscardId!;
    expect(() => applyDiscard(state, 'p1', drawnId)).toThrow('ERR_CANNOT_DISCARD_DRAWN_CARD');
  });

  it('ends hand when player discards last card', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    // Empty the hand except one card
    const lastCard = state.players[0]!.hand[0]!;
    state.players[0]!.hand = [lastCard];
    const result = applyDiscard(state, 'p1', lastCard.id);
    expect(result.handEnded).toBe(true);
    expect(state.phase).toBe('ended');
  });
});

// ---- basicVariant.scoreHand ----

describe('scoreHand', () => {
  it('winner earns sum of opponents unmelded values', () => {
    // rules.md A.1.8: A=1, 2-10=pip, JQK=10
    const state = twoPlayerGame();
    // Empty p1 hand (winner)
    state.players[0]!.hand = [];
    // p2 holds 5H + KD = 5 + 10 = 15
    state.players[1]!.hand = [c('5', 'H', 'x'), c('K', 'D', 'y')];
    state.hasMeldedEver.set('p1', true); // did meld before going out

    const scores = basicVariant.scoreHand(state);
    expect(scores.get('p1')).toBe(15);
    expect(scores.get('p2')).toBe(0);
  });

  it('going-rummy doubles the score', () => {
    // rules.md A.1.7: score × 2 if winner never melded before going out
    const state = twoPlayerGame();
    state.players[0]!.hand = [];
    state.players[1]!.hand = [c('5', 'H', 'x'), c('K', 'D', 'y')]; // 15
    state.hasMeldedEver.set('p1', false); // never melded

    const scores = basicVariant.scoreHand(state);
    expect(scores.get('p1')).toBe(30); // 15 × 2
  });
});

// ---- basicVariant.isGameOver ----

describe('isGameOver', () => {
  it('game over when cumulative score >= 100', () => {
    // rules.md A.1.8 [RRB]
    const sheet = new Map([
      ['p1', [60, 45]],
      ['p2', [20, 10]],
    ]);
    expect(basicVariant.isGameOver(sheet)).toBe(true);
  });

  it('not over when all scores < 100', () => {
    const sheet = new Map([
      ['p1', [40, 30]],
      ['p2', [50, 10]],
    ]);
    expect(basicVariant.isGameOver(sheet)).toBe(false);
  });

  it('exactly 100 triggers game over', () => {
    const sheet = new Map([['p1', [50, 50]]]);
    expect(basicVariant.isGameOver(sheet)).toBe(true);
  });
});
