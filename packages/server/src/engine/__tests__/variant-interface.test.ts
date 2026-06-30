// Exercises the VariantEngine interface delegates + lifecycle hooks for every variant.
// The per-action standalone functions are tested in basic/rum500/gin.test.ts; here we
// drive them through the engine object (basicVariant.applyDraw, etc.) and cover the
// nextFirstPlayerIndex / winnerForHand / handEndPayload hooks.

import { describe, expect, it } from 'vitest';
import type { Card } from '@online-rummy/shared';
import { makeSeededRNG } from '../../rng.js';
import type { GameState } from '../types.js';
import { basicVariant } from '../variants/basic.js';
import { rum500Variant } from '../variants/rum500.js';
import { ginVariant } from '../variants/gin.js';
import { getVariant, isVariant } from '../variants/index.js';

function c(rank: Card['rank'], suit: Card['suit'], id?: string): Card {
  return { id: id ?? `${rank}${suit}`, rank, suit };
}

const two = [
  { id: 'p1', name: 'Alice' },
  { id: 'p2', name: 'Bob' },
];

function register(state: GameState, cards: Card[]) {
  cards.forEach((card) => state.cardRegistry.set(card.id, card));
}

// ---- variant registry ----

describe('variant registry', () => {
  it('isVariant recognizes known variants and rejects others', () => {
    expect(isVariant('basic')).toBe(true);
    expect(isVariant('rum500')).toBe(true);
    expect(isVariant('gin')).toBe(true);
    expect(isVariant('poker')).toBe(false);
    expect(isVariant(42)).toBe(false);
    expect(isVariant(undefined)).toBe(false);
  });

  it('getVariant returns the matching engine', () => {
    expect(getVariant('basic')).toBe(basicVariant);
    expect(getVariant('rum500')).toBe(rum500Variant);
    expect(getVariant('gin')).toBe(ginVariant);
  });
});

// ---- basic ----

describe('basicVariant interface', () => {
  it('createGame produces a basic GameState', () => {
    const state = basicVariant.createGame('r', two, makeSeededRNG(1), 0);
    expect(state.variant).toBe('basic');
    expect(state.players).toHaveLength(2);
    expect(state.phase).toBe('draw');
  });

  it('applyDraw / applyMeld / applyLayoff / applyDiscard delegates run end-to-end', () => {
    const state = basicVariant.createGame('r', two, makeSeededRNG(1), 0);
    const set = [c('Q', 'C', 'q1'), c('Q', 'D', 'q2'), c('Q', 'H', 'q3'), c('Q', 'S', 'q4')];
    register(state, set);
    state.players[0]!.hand.push(...set);

    basicVariant.applyDraw(state, 'p1', 'stock');
    expect(state.phase).toBe('meld');

    basicVariant.applyMeld(state, 'p1', ['q1', 'q2', 'q3']);
    const meldId = state.players[0]!.melds[0]!.id;
    expect(meldId).toBeDefined();

    basicVariant.applyLayoff(state, 'p1', meldId, 'q4');
    expect(state.players[0]!.melds[0]!.cardIds).toContain('q4');

    const discardId = state.players[0]!.hand[0]!.id;
    const res = basicVariant.applyDiscard(state, 'p1', discardId);
    expect(res.handEnded).toBe(false);
    expect(state.turnPlayerId).toBe('p2');
  });

  it('nextFirstPlayerIndex: null → 0, rotates clockwise, missing prev → 0', () => {
    expect(basicVariant.nextFirstPlayerIndex(null, two)).toBe(0);

    const state = basicVariant.createGame('r', two, makeSeededRNG(1), 0); // firstPlayerId = p1 (idx 0)
    expect(basicVariant.nextFirstPlayerIndex(state, two)).toBe(1); // rotate to p2

    const lonely = [
      { id: 'pX', name: 'X' },
      { id: 'pY', name: 'Y' },
    ];
    expect(basicVariant.nextFirstPlayerIndex(state, lonely)).toBe(0); // p1 not in new list
  });

  it('winnerForHand: empty-hand active player wins, else null', () => {
    const state = basicVariant.createGame('r', two, makeSeededRNG(1), 0);
    expect(basicVariant.winnerForHand(state, new Map())).toBeNull(); // mid-hand, no empty hand
    state.players[0]!.hand = [];
    expect(basicVariant.winnerForHand(state, new Map())).toBe('p1');
  });

  it('handEndPayload reports melds (credited to placer) + deadwood', () => {
    const state = basicVariant.createGame('r', two, makeSeededRNG(1), 0);
    const set = [c('K', 'C', 'k1'), c('K', 'D', 'k2'), c('K', 'H', 'k3')];
    register(state, set);
    state.players[0]!.hand = [];
    state.players[0]!.melds = [{ id: 'm1', kind: 'set', cardIds: ['k1', 'k2', 'k3'], ownerId: 'p1' }];
    state.meldedBy.set('k1', 'p1');
    state.meldedBy.set('k2', 'p1');
    state.meldedBy.set('k3', 'p1');
    const hand = [c('5', 'S', 'h1'), c('A', 'S', 'h2')];
    register(state, hand);
    state.players[1]!.hand = hand;

    const payload = basicVariant.handEndPayload(state, new Map());
    expect(payload.meldCredits['p1']).toHaveLength(3);
    expect(payload.meldCredits['p1']!.every((mc) => mc.pts === 10)).toBe(true); // K = 10
    expect(payload.handDeadwood['p2']).toBe(6); // 5 + ace(1)
    expect(payload.finalHands['p2']).toHaveLength(2);
  });
});

// ---- rum500 ----

describe('rum500Variant interface', () => {
  it('createGame produces a rum500 GameState with mustMeldCardId null', () => {
    const state = rum500Variant.createGame('r', two, makeSeededRNG(1), 0);
    expect(state.variant).toBe('rum500');
    if (state.variant === 'rum500') expect(state.variantState.mustMeldCardId).toBeNull();
  });

  it('applyDraw / applyMeld / applyDiscard delegates run end-to-end', () => {
    const state = rum500Variant.createGame('r', two, makeSeededRNG(1), 0);
    const run = [c('5', 'C', 'r1'), c('6', 'C', 'r2'), c('7', 'C', 'r3')];
    register(state, run);
    state.players[0]!.hand.push(...run);

    rum500Variant.applyDraw(state, 'p1', 'stock');
    expect(state.phase).toBe('meld');
    rum500Variant.applyMeld(state, 'p1', ['r1', 'r2', 'r3']);
    expect(state.players[0]!.melds).toHaveLength(1);

    const discardId = state.players[0]!.hand[0]!.id;
    rum500Variant.applyDiscard(state, 'p1', discardId);
    expect(state.turnPlayerId).toBe('p2');
  });

  it('applyDrawFromPile delegate (top card) draws and stays in meld phase', () => {
    const state = rum500Variant.createGame('r', two, makeSeededRNG(1), 0);
    const cardId = state.discardPile[state.discardPile.length - 1]!.id;
    const { taken } = rum500Variant.applyDrawFromPile!(state, 'p1', cardId);
    expect(taken.map((t) => t.id)).toContain(cardId);
    expect(state.phase).toBe('meld');
  });

  it('applyLayoff delegate extends an existing meld', () => {
    const state = rum500Variant.createGame('r', two, makeSeededRNG(1), 0);
    const meldCards = [c('5', 'C', 'm1'), c('6', 'C', 'm2'), c('7', 'C', 'm3')];
    register(state, meldCards);
    state.players[1]!.melds = [{ id: 'op', kind: 'run', cardIds: ['m1', 'm2', 'm3'], ownerId: 'p2' }];
    const lo = c('8', 'C', 'lo');
    register(state, [lo]);
    state.players[0]!.hand.push(lo);
    rum500Variant.applyDraw(state, 'p1', 'stock');
    rum500Variant.applyLayoff(state, 'p1', 'op', 'lo');
    expect(state.players[1]!.melds[0]!.cardIds).toContain('lo');
  });

  it('nextFirstPlayerIndex rotates clockwise; null → 0; missing → 0', () => {
    expect(rum500Variant.nextFirstPlayerIndex(null, two)).toBe(0);
    const state = rum500Variant.createGame('r', two, makeSeededRNG(1), 0);
    expect(rum500Variant.nextFirstPlayerIndex(state, two)).toBe(1);
    expect(rum500Variant.nextFirstPlayerIndex(state, [{ id: 'z', name: 'Z' }])).toBe(0);
  });

  it('winnerForHand returns the player who emptied their hand', () => {
    const state = rum500Variant.createGame('r', two, makeSeededRNG(1), 0);
    expect(rum500Variant.winnerForHand(state, new Map())).toBeNull();
    state.players[1]!.hand = [];
    expect(rum500Variant.winnerForHand(state, new Map())).toBe('p2');
  });

  it('handEndPayload scores ace-low run as 1 and hand aces as 15', () => {
    const state = rum500Variant.createGame('r', two, makeSeededRNG(1), 0);
    const run = [c('A', 'C', 'a1'), c('2', 'C', 'a2'), c('3', 'C', 'a3')];
    register(state, run);
    state.players[0]!.hand = [];
    state.players[0]!.melds = [{ id: 'm', kind: 'run', cardIds: ['a1', 'a2', 'a3'], ownerId: 'p1' }];
    state.meldedBy.set('a1', 'p1');
    state.meldedBy.set('a2', 'p1');
    state.meldedBy.set('a3', 'p1');
    const handAce = c('A', 'S', 'ha');
    register(state, [handAce]);
    state.players[1]!.hand = [handAce];

    const payload = rum500Variant.handEndPayload(state, new Map());
    const acePts = payload.meldCredits['p1']!.find((mc) => mc.card.id === 'a1')!.pts;
    expect(acePts).toBe(1); // ace low in A-2-3
    expect(payload.handDeadwood['p2']).toBe(15); // ace in hand = 15
  });
});

// ---- gin ----

describe('ginVariant interface', () => {
  function ginGame() {
    return ginVariant.createGame('r', two, makeSeededRNG(1), 0) as GameState & { variant: 'gin' };
  }

  it('createGame opens in firstUpcardOffer', () => {
    const state = ginGame();
    expect(state.variant).toBe('gin');
    expect(state.phase).toBe('firstUpcardOffer');
  });

  it('canDrawFromDiscard true in draw phase with a discard, false otherwise', () => {
    const state = ginGame();
    state.phase = 'draw';
    expect(ginVariant.canDrawFromDiscard(state, 'p1')).toBe(true);
    state.discardPile = [];
    expect(ginVariant.canDrawFromDiscard(state, 'p1')).toBe(false);
  });

  it('applyMeld / applyLayoff delegates throw ERR_NOT_SUPPORTED', () => {
    const state = ginGame();
    expect(() => ginVariant.applyMeld(state, 'p1', [])).toThrow('ERR_NOT_SUPPORTED');
    expect(() => ginVariant.applyLayoff(state, 'p1', 'm', 'c')).toThrow('ERR_NOT_SUPPORTED');
  });

  it('applyPassUpcard / applyDraw / applyDiscard delegates run end-to-end', () => {
    const state = ginGame();
    ginVariant.applyPassUpcard!(state, 'p1');
    ginVariant.applyPassUpcard!(state, 'p2');
    expect(state.phase).toBe('draw');
    ginVariant.applyDraw(state, 'p1', 'stock');
    expect(state.phase).toBe('discard');
    const discardId = state.players[0]!.hand[0]!.id;
    ginVariant.applyDiscard(state, 'p1', discardId);
    expect(state.turnPlayerId).toBe('p2');
  });

  it('applyKnock + applyGinLayoff delegates run end-to-end', () => {
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
    register(state, [...p1Hand, ...p2Hand]);
    state.players[0]!.hand = [...p1Hand];
    state.players[1]!.hand = [...p2Hand];
    state.phase = 'discard';

    ginVariant.applyKnock!(state, 'p1', [['k1', 'k2', 'k3']], 'k_disc');
    expect(state.phase).toBe('layoff');
    const meldId = state.players[0]!.melds[0]!.id;
    ginVariant.applyGinLayoff!(state, 'p2', [{ cardId: 'd1', meldId }], undefined);
    expect(state.phase).toBe('ended');
  });

  it('nextFirstPlayerIndex: null → 0', () => {
    expect(ginVariant.nextFirstPlayerIndex(null, two)).toBe(0);
  });

  it('nextFirstPlayerIndex: cancelled hand keeps the same dealer (firstPlayerId)', () => {
    const state = ginGame();
    state.firstPlayerId = 'p2';
    state.variantState.cancelledHand = true;
    expect(ginVariant.nextFirstPlayerIndex(state, two)).toBe(1);
    // firstPlayerId absent from new players → 0
    expect(ginVariant.nextFirstPlayerIndex(state, [{ id: 'z', name: 'Z' }])).toBe(0);
  });

  it('nextFirstPlayerIndex: normal end → loser (last score 0) plays first', () => {
    const state = ginGame();
    state.scoreSheet.set('p1', [45]);
    state.scoreSheet.set('p2', [0]);
    expect(ginVariant.nextFirstPlayerIndex(state, two)).toBe(1); // p2 lost → plays first
  });

  it('nextFirstPlayerIndex: falls back to 0 when no zero-score loser found', () => {
    const state = ginGame();
    state.scoreSheet.set('p1', [45]);
    state.scoreSheet.set('p2', [30]);
    expect(ginVariant.nextFirstPlayerIndex(state, two)).toBe(0);
  });

  it('winnerForHand: positive score wins, all-zero → null', () => {
    const state = ginGame();
    expect(
      ginVariant.winnerForHand(
        state,
        new Map([
          ['p1', 0],
          ['p2', 0],
        ]),
      ),
    ).toBeNull();
    expect(
      ginVariant.winnerForHand(
        state,
        new Map([
          ['p1', 0],
          ['p2', 25],
        ]),
      ),
    ).toBe('p2');
  });

  it('handEndPayload: ginInfo labels knock / gin / undercut', () => {
    function payloadFor(p1Hand: Card[], p2Hand: Card[]) {
      const state = ginGame();
      register(state, [...p1Hand, ...p2Hand]);
      state.players[0]!.hand = p1Hand;
      state.players[1]!.hand = p2Hand;
      state.variantState.ginKnockerId = 'p1';
      return ginVariant.handEndPayload(state, new Map());
    }

    const knock = payloadFor([c('5', 'C', 'a')], [c('K', 'C', 'b'), c('Q', 'D', 'c')]);
    expect(knock.ginInfo?.result).toBe('knock');
    expect(knock.handDeadwood['p1']).toBe(5);

    const gin = payloadFor([], [c('K', 'C', 'g')]);
    expect(gin.ginInfo?.result).toBe('gin');

    const undercut = payloadFor([c('K', 'C', 'u1'), c('K', 'D', 'u2')], [c('5', 'C', 'u3')]);
    expect(undercut.ginInfo?.result).toBe('undercut');
  });

  it('handEndPayload: returns no ginInfo when knocker cannot be resolved', () => {
    const state = ginGame();
    state.variantState.ginKnockerId = 'ghost';
    const payload = ginVariant.handEndPayload(state, new Map());
    expect(payload.ginInfo).toBeUndefined();
    expect(Object.keys(payload.finalHands)).toEqual(['p1', 'p2']);
  });
});
