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
    0, // p1 always goes first in unit tests
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

  it('deals 7 cards each for 4P (rules.md A.1.2)', () => {
    const players = Array.from({ length: 4 }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` }));
    const state = createBasicGame('r4', players, makeSeededRNG(1), 0);
    for (const p of state.players) {
      expect(p.hand).toHaveLength(7);
    }
    expect(state.stock).toHaveLength(52 - 28 - 1);
  });

  it('deals 6 cards each for 5P (rules.md A.1.2)', () => {
    const players = Array.from({ length: 5 }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` }));
    const state = createBasicGame('r5', players, makeSeededRNG(1), 0);
    for (const p of state.players) {
      expect(p.hand).toHaveLength(6);
    }
    expect(state.stock).toHaveLength(52 - 30 - 1);
  });

  it('deals 6 cards each for 6P (rules.md A.1.2)', () => {
    const players = Array.from({ length: 6 }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` }));
    const state = createBasicGame('r6', players, makeSeededRNG(1), 0);
    for (const p of state.players) {
      expect(p.hand).toHaveLength(6);
    }
    expect(state.stock).toHaveLength(52 - 36 - 1);
  });

  it('deals 10 cards each for 7P using 2 combined decks (104 cards: 70 dealt, 33 stock, 1 discard)', () => {
    // rules.md A.1.1: 7P uses 2 × 52 = 104 cards; A.1.2: 7P deals 10 each.
    const players = Array.from({ length: 7 }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` }));
    const state = createBasicGame('r7', players, makeSeededRNG(1), 0);
    for (const p of state.players) {
      expect(p.hand).toHaveLength(10);
    }
    expect(state.discardPile).toHaveLength(1);
    expect(state.stock).toHaveLength(33);
    expect(state.cardRegistry.size).toBe(104);
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

  it('throws ERR_STOCK_EMPTY when stock empty', () => {
    const state = twoPlayerGame();
    state.stock = [];
    expect(() => applyDraw(state, 'p1', 'stock')).toThrow('ERR_STOCK_EMPTY');
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

  it('phase stays meld after melding (can meld/layoff again)', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const run = [c('3', 'S', 'r1'), c('4', 'S', 'r2'), c('5', 'S', 'r3')];
    run.forEach((card) => {
      state.players[0]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    });
    applyMeld(state, 'p1', ['r1', 'r2', 'r3']);
    expect(state.phase).toBe('meld');
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

  it('allows multiple melds per turn', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const set1 = [c('9', 'C', 's1'), c('9', 'D', 's2'), c('9', 'H', 's3')];
    const set2 = [c('8', 'C', 't1'), c('8', 'D', 't2'), c('8', 'H', 't3')];
    [...set1, ...set2].forEach((card) => {
      state.players[0]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    });
    applyMeld(state, 'p1', ['s1', 's2', 's3']);
    applyMeld(state, 'p1', ['t1', 't2', 't3']);
    expect(state.players[0]!.melds).toHaveLength(2);
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
  it('allows layoff without own prior meld', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    // p2 has a meld; p1 has no melds yet
    const p2set = [c('J', 'C', 'm1'), c('J', 'D', 'm2'), c('J', 'H', 'm3')];
    p2set.forEach((card) => {
      state.cardRegistry.set(card.id, card);
    });
    state.players[1]!.melds.push({ id: 'meld1', kind: 'set', cardIds: ['m1', 'm2', 'm3'], ownerId: 'p2' });
    const layoffCard = c('J', 'S', 'lo1');
    state.players[0]!.hand.push(layoffCard);
    state.cardRegistry.set(layoffCard.id, layoffCard);
    applyLayoff(state, 'p1', 'meld1', 'lo1');
    expect(state.players[1]!.melds[0]!.cardIds).toContain('lo1');
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

  it('lays off at LOW end of run and sorts cardIds ascending', () => {
    // rules.md A.1.6 step 3 — layoff may extend at either end of a run
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const run = [c('5', 'S', 'r5'), c('6', 'S', 'r6'), c('7', 'S', 'r7')];
    run.forEach((card) => state.cardRegistry.set(card.id, card));
    state.players[1]!.melds.push({
      id: 'lowEndRun',
      kind: 'run',
      cardIds: ['r5', 'r6', 'r7'],
      ownerId: 'p2',
    });
    const lo = c('4', 'S', 'r4');
    state.players[0]!.hand.push(lo);
    state.cardRegistry.set(lo.id, lo);

    applyLayoff(state, 'p1', 'lowEndRun', 'r4');
    expect(state.players[1]!.melds[0]!.cardIds).toEqual(['r4', 'r5', 'r6', 'r7']);
  });

  it('lays off 4th card onto a 3-card set', () => {
    // rules.md A.1.5 — set may contain up to 4 cards
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const set = [c('8', 'C', 'e1'), c('8', 'D', 'e2'), c('8', 'H', 'e3')];
    set.forEach((card) => state.cardRegistry.set(card.id, card));
    state.players[1]!.melds.push({
      id: 'eightSet',
      kind: 'set',
      cardIds: ['e1', 'e2', 'e3'],
      ownerId: 'p2',
    });
    const fourth = c('8', 'S', 'e4');
    state.players[0]!.hand.push(fourth);
    state.cardRegistry.set(fourth.id, fourth);

    applyLayoff(state, 'p1', 'eightSet', 'e4');
    expect(state.players[1]!.melds[0]!.cardIds).toHaveLength(4);
  });

  it('throws ERR_MELD_NOT_FOUND for unknown meldId', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const card = state.players[0]!.hand[0]!;
    expect(() => applyLayoff(state, 'p1', 'nope', card.id)).toThrow('ERR_MELD_NOT_FOUND');
  });

  it('layoff: ERR_NOT_YOUR_TURN for non-turn player', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const card = state.players[1]!.hand[0]!;
    expect(() => applyLayoff(state, 'p2', 'mx', card.id)).toThrow('ERR_NOT_YOUR_TURN');
  });

  it('layoff: ERR_WRONG_PHASE before draw', () => {
    const state = twoPlayerGame();
    const card = state.players[0]!.hand[0]!;
    expect(() => applyLayoff(state, 'p1', 'mx', card.id)).toThrow('ERR_WRONG_PHASE');
  });

  it('layoff: ERR_UNKNOWN_CARD for unknown cardId', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    expect(() => applyLayoff(state, 'p1', 'mx', 'phantom')).toThrow(/ERR_UNKNOWN_CARD/);
  });

  it('ERR_INVALID_LAYOFF: set wrong rank', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const set = [c('8', 'C', 'w1'), c('8', 'D', 'w2'), c('8', 'H', 'w3')];
    set.forEach((card) => state.cardRegistry.set(card.id, card));
    state.players[1]!.melds.push({
      id: 'wsm',
      kind: 'set',
      cardIds: ['w1', 'w2', 'w3'],
      ownerId: 'p2',
    });
    const wrong = c('9', 'S', 'wrong');
    state.players[0]!.hand.push(wrong);
    state.cardRegistry.set(wrong.id, wrong);
    expect(() => applyLayoff(state, 'p1', 'wsm', 'wrong')).toThrow(/ERR_INVALID_LAYOFF.*8s/);
  });

  it('ERR_INVALID_LAYOFF: set already full (4 cards)', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const full = [c('9', 'C', 'f1'), c('9', 'D', 'f2'), c('9', 'H', 'f3'), c('9', 'S', 'f4')];
    full.forEach((card) => state.cardRegistry.set(card.id, card));
    state.players[1]!.melds.push({
      id: 'fullset',
      kind: 'set',
      cardIds: ['f1', 'f2', 'f3', 'f4'],
      ownerId: 'p2',
    });
    // A 5th 9 from the second deck would still be rejected even with same rank.
    const extra = c('9', 'C', 'f5');
    state.players[0]!.hand.push(extra);
    state.cardRegistry.set(extra.id, extra);
    expect(() => applyLayoff(state, 'p1', 'fullset', 'f5')).toThrow(/ERR_INVALID_LAYOFF.*full/);
  });

  it('ERR_INVALID_LAYOFF: run wrong suit', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const run = [c('4', 'H', 'rh1'), c('5', 'H', 'rh2'), c('6', 'H', 'rh3')];
    run.forEach((card) => state.cardRegistry.set(card.id, card));
    state.players[1]!.melds.push({
      id: 'redrun',
      kind: 'run',
      cardIds: ['rh1', 'rh2', 'rh3'],
      ownerId: 'p2',
    });
    const wrongSuit = c('7', 'C', 'wc');
    state.players[0]!.hand.push(wrongSuit);
    state.cardRegistry.set(wrongSuit.id, wrongSuit);
    expect(() => applyLayoff(state, 'p1', 'redrun', 'wc')).toThrow(/ERR_INVALID_LAYOFF.*suit/);
  });

  it('ERR_INVALID_LAYOFF: run rank out of range', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const run = [c('4', 'D', 'd4'), c('5', 'D', 'd5'), c('6', 'D', 'd6')];
    run.forEach((card) => state.cardRegistry.set(card.id, card));
    state.players[1]!.melds.push({
      id: 'midrun',
      kind: 'run',
      cardIds: ['d4', 'd5', 'd6'],
      ownerId: 'p2',
    });
    const offRank = c('10', 'D', 'd10');
    state.players[0]!.hand.push(offRank);
    state.cardRegistry.set(offRank.id, offRank);
    expect(() => applyLayoff(state, 'p1', 'midrun', 'd10')).toThrow(/ERR_INVALID_LAYOFF/);
  });

  it('ERR_INVALID_LAYOFF: run includes ace at low end (loRank === A)', () => {
    // exercises the "lo === A" guidance branch
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const lowAceRun = [c('A', 'S', 'aS'), c('2', 'S', '2S'), c('3', 'S', '3S')];
    lowAceRun.forEach((card) => state.cardRegistry.set(card.id, card));
    state.players[1]!.melds.push({
      id: 'aceLowRun',
      kind: 'run',
      cardIds: ['aS', '2S', '3S'],
      ownerId: 'p2',
    });
    const off = c('7', 'S', 'off7');
    state.players[0]!.hand.push(off);
    state.cardRegistry.set(off.id, off);
    expect(() => applyLayoff(state, 'p1', 'aceLowRun', 'off7')).toThrow(/ERR_INVALID_LAYOFF/);
  });

  it('ERR_INVALID_LAYOFF: run mid-range (loRank != A, hiRank != K) emits guidance', () => {
    // exercises the "non-A, non-K" branches of the descriptive error message
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const mid = [c('5', 'H', 'h5'), c('6', 'H', 'h6'), c('7', 'H', 'h7')];
    mid.forEach((card) => state.cardRegistry.set(card.id, card));
    state.players[1]!.melds.push({
      id: 'midH',
      kind: 'run',
      cardIds: ['h5', 'h6', 'h7'],
      ownerId: 'p2',
    });
    const off = c('10', 'H', 'h10');
    state.players[0]!.hand.push(off);
    state.cardRegistry.set(off.id, off);
    expect(() => applyLayoff(state, 'p1', 'midH', 'h10')).toThrow(/low end|high end/);
  });

  it('ERR_INVALID_LAYOFF: run reaching the K end (hiRank === K)', () => {
    // exercises the "hi === K" guidance branch
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const highRun = [c('J', 'C', 'jC'), c('Q', 'C', 'qC'), c('K', 'C', 'kC')];
    highRun.forEach((card) => state.cardRegistry.set(card.id, card));
    state.players[1]!.melds.push({
      id: 'highRunMeld',
      kind: 'run',
      cardIds: ['jC', 'qC', 'kC'],
      ownerId: 'p2',
    });
    const off = c('5', 'C', 'off5');
    state.players[0]!.hand.push(off);
    state.cardRegistry.set(off.id, off);
    expect(() => applyLayoff(state, 'p1', 'highRunMeld', 'off5')).toThrow(/ERR_INVALID_LAYOFF/);
  });

  it('throws ERR_CARD_NOT_IN_HAND on meld with card not in player hand', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const orphan = [c('2', 'C', 'o1'), c('2', 'D', 'o2'), c('2', 'H', 'o3')];
    orphan.forEach((card) => state.cardRegistry.set(card.id, card));
    // Cards registered but never added to p1.hand
    expect(() => applyMeld(state, 'p1', ['o1', 'o2', 'o3'])).toThrow(/ERR_CARD_NOT_IN_HAND/);
  });

  it('throws ERR_UNKNOWN_CARD on meld with unknown card id', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    expect(() => applyMeld(state, 'p1', ['ghost-id'])).toThrow(/ERR_UNKNOWN_CARD/);
  });

  it('throws ERR_NOT_YOUR_TURN on meld by non-turn player', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    expect(() => applyMeld(state, 'p2', [])).toThrow('ERR_NOT_YOUR_TURN');
  });

  it('throws ERR_WRONG_PHASE on meld before draw', () => {
    const state = twoPlayerGame();
    expect(() => applyMeld(state, 'p1', [])).toThrow('ERR_WRONG_PHASE');
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
    // rules.md A.1.6 step 4
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

  it('discard: ERR_NOT_YOUR_TURN for non-turn player', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const card = state.players[1]!.hand[0]!;
    expect(() => applyDiscard(state, 'p2', card.id)).toThrow('ERR_NOT_YOUR_TURN');
  });

  it('discard: ERR_WRONG_PHASE before draw', () => {
    const state = twoPlayerGame();
    const card = state.players[0]!.hand[0]!;
    expect(() => applyDiscard(state, 'p1', card.id)).toThrow('ERR_WRONG_PHASE');
  });

  it('after draw-from-discard, may discard a DIFFERENT card', () => {
    // rules.md A.1.6 step 4 — only the drawn card itself is restricted
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'discard');
    const drawnId = state.drewFromDiscardId!;
    const other = state.players[0]!.hand.find((c) => c.id !== drawnId)!;
    expect(() => applyDiscard(state, 'p1', other.id)).not.toThrow();
  });

  it('drewFromDiscardId resets to null after turn advance', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'discard');
    expect(state.drewFromDiscardId).not.toBeNull();
    const other = state.players[0]!.hand.find((c) => c.id !== state.drewFromDiscardId)!;
    applyDiscard(state, 'p1', other.id);
    expect(state.drewFromDiscardId).toBeNull();
  });

  it('throws ERR_CARD_NOT_IN_HAND on discard with card not in hand', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const ghost = c('5', 'C', 'ghost');
    state.cardRegistry.set(ghost.id, ghost);
    expect(() => applyDiscard(state, 'p1', 'ghost')).toThrow(/ERR_CARD_NOT_IN_HAND/);
  });

  it('throws ERR_UNKNOWN_CARD on discard with unknown id', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    expect(() => applyDiscard(state, 'p1', 'no-such-id')).toThrow(/ERR_UNKNOWN_CARD/);
  });
});

// ---- forfeit handling ----

describe('forfeit handling', () => {
  it('throws ERR_PLAYER_FORFEITED if turn player is marked forfeited', () => {
    const state = twoPlayerGame();
    state.players[0]!.status = 'forfeited';
    expect(() => applyDraw(state, 'p1', 'stock')).toThrow('ERR_PLAYER_FORFEITED');
  });

  it('advanceTurn (via discard) skips forfeited players', () => {
    const state = createBasicGame(
      'r3',
      [
        { id: 'p1', name: 'A' },
        { id: 'p2', name: 'B' },
        { id: 'p3', name: 'C' },
      ],
      makeSeededRNG(1),
      0,
    );
    state.players[1]!.status = 'forfeited';
    applyDraw(state, 'p1', 'stock');
    const card = state.players[0]!.hand[0]!;
    applyDiscard(state, 'p1', card.id);
    expect(state.turnPlayerId).toBe('p3');
  });

  it('scoreHand excludes forfeited players from credit and from being scored', () => {
    const state = createBasicGame(
      'r3',
      [
        { id: 'p1', name: 'A' },
        { id: 'p2', name: 'B' },
        { id: 'p3', name: 'C' },
      ],
      makeSeededRNG(1),
      0,
    );
    state.players[0]!.hand = []; // winner
    state.players[1]!.hand = [c('5', 'H', 'h1'), c('K', 'D', 'h2')]; // 15
    state.players[2]!.status = 'forfeited';
    state.players[2]!.hand = [c('Q', 'S', 'h3')]; // forfeit hand ignored
    state.hasMeldedEver.set('p1', true);
    const scores = basicVariant.scoreHand(state);
    expect(scores.get('p1')).toBe(15); // only p2's deadwood credited
  });
});

// ---- variant interface direct tests ----

describe('basicVariant interface methods', () => {
  it('canDrawFromDiscard true when in draw phase and pile non-empty', () => {
    const state = twoPlayerGame();
    expect(basicVariant.canDrawFromDiscard(state, 'p1')).toBe(true);
  });

  it('canDrawFromDiscard false in non-draw phase', () => {
    const state = twoPlayerGame();
    state.phase = 'meld';
    expect(basicVariant.canDrawFromDiscard(state, 'p1')).toBe(false);
  });

  it('canDrawFromDiscard false when pile empty', () => {
    const state = twoPlayerGame();
    state.discardPile = [];
    expect(basicVariant.canDrawFromDiscard(state, 'p1')).toBe(false);
  });

  it('onDrawFromDiscard records drewFromDiscardId', () => {
    const state = twoPlayerGame();
    basicVariant.onDrawFromDiscard(state, 'p1', 'x-id');
    expect(state.drewFromDiscardId).toBe('x-id');
  });

  it('canDiscard true for any card not matching drewFromDiscardId', () => {
    const state = twoPlayerGame();
    state.drewFromDiscardId = 'just-drew';
    expect(basicVariant.canDiscard(state, 'p1', 'other')).toBe(true);
  });

  it('canDiscard false for the just-drawn card', () => {
    const state = twoPlayerGame();
    state.drewFromDiscardId = 'just-drew';
    expect(basicVariant.canDiscard(state, 'p1', 'just-drew')).toBe(false);
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
