import { describe, expect, it } from 'vitest';
import type { Card } from '@online-rummy/shared';
import { makeSeededRNG } from '../../rng.js';
import {
  applyDiscard,
  applyDraw,
  applyDrawFromPile,
  applyLayoff,
  applyMeld,
  createRum500Game,
  rum500Variant,
} from '../variants/rum500.js';

function c(rank: Card['rank'], suit: Card['suit'], id?: string): Card {
  return { id: id ?? `${rank}${suit}`, rank, suit };
}

function twoPlayerGame(seed = 1) {
  return createRum500Game(
    'room1',
    [
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ],
    makeSeededRNG(seed),
    0,
  );
}

function fivePlayerGame(seed = 1) {
  return createRum500Game(
    'room2',
    [
      { id: 'p1', name: 'A' },
      { id: 'p2', name: 'B' },
      { id: 'p3', name: 'C' },
      { id: 'p4', name: 'D' },
      { id: 'p5', name: 'E' },
    ],
    makeSeededRNG(seed),
    0,
  );
}

// ---- createRum500Game ----

describe('createRum500Game', () => {
  it('deals 13 cards each for 2P from 1 deck', () => {
    // rules.md A.4.1
    const state = twoPlayerGame();
    expect(state.players[0]?.hand).toHaveLength(13);
    expect(state.players[1]?.hand).toHaveLength(13);
    expect(state.cardRegistry.size).toBe(52);
    expect(state.stock).toHaveLength(52 - 26 - 1);
  });

  it('deals 7 cards each for 3-4P from 1 deck', () => {
    const state = createRum500Game(
      'r',
      [
        { id: 'p1', name: 'A' },
        { id: 'p2', name: 'B' },
        { id: 'p3', name: 'C' },
        { id: 'p4', name: 'D' },
      ],
      makeSeededRNG(1),
      0,
    );
    for (const p of state.players) expect(p.hand).toHaveLength(7);
    expect(state.cardRegistry.size).toBe(52);
  });

  it('uses 2 decks for 5+P', () => {
    // rules.md A.4.1
    const state = fivePlayerGame();
    expect(state.cardRegistry.size).toBe(104);
    for (const p of state.players) expect(p.hand).toHaveLength(7);
    expect(state.stock).toHaveLength(104 - 35 - 1);
  });

  it.each([6, 7, 8])('uses 2 decks for %iP and deals 7 each (rules.md A.4.1)', (n) => {
    const players = Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` }));
    const state = createRum500Game(`r${n}`, players, makeSeededRNG(1), 0);
    expect(state.cardRegistry.size).toBe(104);
    for (const p of state.players) expect(p.hand).toHaveLength(7);
    expect(state.stock).toHaveLength(104 - n * 7 - 1);
  });

  it('starts with 1 discard, draw phase, mustMeldCardId null', () => {
    const state = twoPlayerGame();
    expect(state.discardPile).toHaveLength(1);
    expect(state.phase).toBe('draw');
    expect(state.variantState.mustMeldCardId).toBeNull();
  });
});

// ---- validateMeld (ace either end) ----

describe('rum500Variant.validateMeld', () => {
  it('accepts A-2-3 (ace low)', () => {
    expect(rum500Variant.validateMeld([c('A', 'H', 'a'), c('2', 'H', 'b'), c('3', 'H', 'd')])).toBe(true);
  });

  it('accepts Q-K-A (ace high)', () => {
    // rules.md A.4.3
    expect(rum500Variant.validateMeld([c('Q', 'S', 'a'), c('K', 'S', 'b'), c('A', 'S', 'd')])).toBe(true);
  });

  it('rejects K-A-2 (no round-the-corner)', () => {
    expect(rum500Variant.validateMeld([c('K', 'D', 'a'), c('A', 'D', 'b'), c('2', 'D', 'd')])).toBe(false);
  });

  it('accepts set of 3 same rank', () => {
    expect(rum500Variant.validateMeld([c('7', 'C', 'a'), c('7', 'D', 'b'), c('7', 'H', 'd')])).toBe(true);
  });

  it('accepts same-suit set in 2-deck play (locked house rule)', () => {
    // House rule: same-suit sets ALLOWED (not [PG-5] different-suits-required)
    expect(rum500Variant.validateMeld([c('5', 'H', 'a'), c('5', 'H', 'b'), c('5', 'D', 'd')])).toBe(true);
  });

  it('rejects mixed-suit run', () => {
    expect(rum500Variant.validateMeld([c('4', 'C', 'a'), c('5', 'D', 'b'), c('6', 'C', 'd')])).toBe(false);
  });

  it('canDrawFromDiscard returns false when not in draw phase', () => {
    const state = twoPlayerGame();
    state.phase = 'meld';
    expect(rum500Variant.canDrawFromDiscard(state, 'p1')).toBe(false);
  });

  it('canDrawFromDiscard returns false when discard empty', () => {
    const state = twoPlayerGame();
    state.discardPile = [];
    expect(rum500Variant.canDrawFromDiscard(state, 'p1')).toBe(false);
  });

  it('canDrawFromDiscard returns true with cardId in pile', () => {
    const state = twoPlayerGame();
    const top = state.discardPile[0]!;
    expect(rum500Variant.canDrawFromDiscard(state, 'p1', top.id)).toBe(true);
  });

  it('canDrawFromDiscard returns false when cardId absent', () => {
    const state = twoPlayerGame();
    expect(rum500Variant.canDrawFromDiscard(state, 'p1', 'missing-card')).toBe(false);
  });

  it('canDrawFromDiscard returns true with no cardId and non-empty pile', () => {
    const state = twoPlayerGame();
    expect(rum500Variant.canDrawFromDiscard(state, 'p1')).toBe(true);
  });

  it('onDrawFromDiscard sets drewFromDiscardId only (no must-meld for single top)', () => {
    // rules.md A.4.4 — top-card draw has no must-use obligation
    const state = twoPlayerGame();
    rum500Variant.onDrawFromDiscard(state, 'p1', 'someCardId');
    expect(state.drewFromDiscardId).toBe('someCardId');
    expect(state.variantState.mustMeldCardId).toBeNull();
  });

  it('canDiscard returns false while mustMeldCardId is set', () => {
    // rules.md A.4.4 — pile dive obligation blocks discard
    const state = twoPlayerGame();
    state.variantState.mustMeldCardId = 'somePileCard';
    expect(rum500Variant.canDiscard(state, 'p1', 'anyCard')).toBe(false);
  });

  it('canDiscard returns false for the drewFromDiscardId card', () => {
    // rules.md A.4.4 — cannot re-discard the card just drawn from discard
    const state = twoPlayerGame();
    state.drewFromDiscardId = 'drawnCard';
    expect(rum500Variant.canDiscard(state, 'p1', 'drawnCard')).toBe(false);
  });

  it('canDiscard returns true for unrelated card with no obligations', () => {
    const state = twoPlayerGame();
    expect(rum500Variant.canDiscard(state, 'p1', 'freshCard')).toBe(true);
  });

  it('per-meld ace direction: same player may hold A-2-3 and Q-K-A simultaneously', () => {
    // rules.md A.4.3 — ace direction is determined per meld by neighbours.
    // A player melding A-2-3 (low) followed by Q-K-A (high) in the same hand is legal:
    // each validateMeld call is independent and per-meld.
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const low = [c('A', 'S', 'aS'), c('2', 'S', '2S'), c('3', 'S', '3S')];
    const high = [c('Q', 'H', 'qH'), c('K', 'H', 'kH'), c('A', 'H', 'aH')];
    [...low, ...high].forEach((card) => {
      state.players[0]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    });
    applyMeld(state, 'p1', ['aS', '2S', '3S']);
    applyMeld(state, 'p1', ['qH', 'kH', 'aH']);
    expect(state.players[0]!.melds).toHaveLength(2);
  });
});

// ---- applyDrawFromPile ----

describe('applyDrawFromPile', () => {
  it('takes selected card + all above, sets mustMeldCardId', () => {
    // rules.md A.4.4
    const state = twoPlayerGame();
    // Stack discard: [bot, mid, top]
    const bot = c('5', 'C', 'bot');
    const mid = c('Q', 'D', 'mid');
    const top = c('A', 'H', 'top');
    state.discardPile = [bot, mid, top];
    state.cardRegistry.set(bot.id, bot);
    state.cardRegistry.set(mid.id, mid);
    state.cardRegistry.set(top.id, top);
    // Preflight needs partners for mid (Q-D). Give p1 two more Qs.
    const partners = [c('Q', 'C', 'qPart1'), c('Q', 'H', 'qPart2')];
    partners.forEach((card) => {
      state.players[0]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    });

    const before = state.players[0]!.hand.length;
    const { taken } = applyDrawFromPile(state, 'p1', 'mid');
    expect(taken.map((c) => c.id)).toEqual(['mid', 'top']);
    expect(state.players[0]!.hand).toHaveLength(before + 2);
    expect(state.discardPile.map((c) => c.id)).toEqual(['bot']);
    expect(state.variantState.mustMeldCardId).toBe('mid');
    expect(state.phase).toBe('meld');
  });

  it('throws ERR_CARD_NOT_IN_PILE if cardId absent', () => {
    const state = twoPlayerGame();
    expect(() => applyDrawFromPile(state, 'p1', 'nope')).toThrow('ERR_CARD_NOT_IN_PILE');
  });

  it('blocks discard while mustMeldCardId set (deep pile draw)', () => {
    // rules.md A.4.4 — must-use is set ONLY for true pile dives (below top).
    const state = twoPlayerGame();
    // Build a 2-deep pile with a meldable target. Give p1 two 7s so the dive preflight passes.
    const target = c('7', 'H', 'divTarget');
    const filler = c('K', 'D', 'divFiller');
    state.discardPile = [target, filler];
    state.cardRegistry.set(target.id, target);
    state.cardRegistry.set(filler.id, filler);
    const partners = [c('7', 'C', 'p7c'), c('7', 'D', 'p7d')];
    partners.forEach((card) => {
      state.players[0]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    });
    applyDrawFromPile(state, 'p1', 'divTarget');
    expect(state.variantState.mustMeldCardId).toBe('divTarget');
    const someCard = state.players[0]!.hand.find((c) => c.id !== 'divTarget')!;
    expect(() => applyDiscard(state, 'p1', someCard.id)).toThrow('ERR_MUST_USE_PILE_CARD');
  });

  it('single top-discard draw: sets drewFromDiscardId, not mustMeldCardId', () => {
    // rules.md A.4.4: no must-meld obligation for a simple top draw
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'discard');
    expect(state.variantState.mustMeldCardId).toBeNull();
    expect(state.drewFromDiscardId).not.toBeNull();
  });

  it('single top-discard draw: drawn card cannot be re-discarded same turn', () => {
    // rules.md A.4.4
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'discard');
    const drawnId = state.drewFromDiscardId!;
    expect(() => applyDiscard(state, 'p1', drawnId)).toThrow('ERR_CANNOT_DISCARD_DRAWN_CARD');
  });

  it('single top-discard draw: other hand cards may be discarded freely', () => {
    // rules.md A.4.4: no must-meld obligation; only the drawn card itself is restricted
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'discard');
    const drawnId = state.drewFromDiscardId!;
    const otherCard = state.players[0]!.hand.find((c) => c.id !== drawnId)!;
    expect(() => applyDiscard(state, 'p1', otherCard.id)).not.toThrow();
  });

  it('clears mustMeldCardId once card is melded', () => {
    const state = twoPlayerGame();
    const must = c('7', 'H', 'must');
    const filler = c('K', 'D', 'fillerMust');
    // Preflight requires partners in hand BEFORE dive (preflight uses current hand + taken).
    const partners = [c('7', 'C', 'q1'), c('7', 'D', 'q2')];
    partners.forEach((card) => {
      state.players[0]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    });
    state.discardPile = [must, filler];
    state.cardRegistry.set(must.id, must);
    state.cardRegistry.set(filler.id, filler);
    applyDrawFromPile(state, 'p1', 'must');
    expect(state.variantState.mustMeldCardId).toBe('must');

    applyMeld(state, 'p1', ['must', 'q1', 'q2']);
    expect(state.variantState.mustMeldCardId).toBeNull();
  });

  it('applyDraw {from:"discard"} on empty pile throws ERR_DISCARD_EMPTY', () => {
    // rules.md A.4.4
    const state = twoPlayerGame();
    state.discardPile = [];
    expect(() => applyDraw(state, 'p1', 'discard')).toThrow('ERR_DISCARD_EMPTY');
  });

  it('applyDraw {from:"stock"} on empty stock throws ERR_STOCK_EMPTY', () => {
    const state = twoPlayerGame();
    state.stock = [];
    expect(() => applyDraw(state, 'p1', 'stock')).toThrow('ERR_STOCK_EMPTY');
  });

  it('mustMeldCardId clearable via layoff onto own meld', () => {
    const state = twoPlayerGame();
    // p1 first plays a 5s set to have something to layoff onto
    applyDraw(state, 'p1', 'stock');
    const set = [c('5', 'C', 's1'), c('5', 'D', 's2'), c('5', 'H', 's3')];
    set.forEach((card) => {
      state.players[0]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    });
    applyMeld(state, 'p1', ['s1', 's2', 's3']);
    const meldId = state.players[0]!.melds[0]!.id;
    // discard to advance turn back to p1 cleanly
    const someCard = state.players[0]!.hand[0]!;
    applyDiscard(state, 'p1', someCard.id);
    // give p2 a no-op discard
    applyDraw(state, 'p2', 'stock');
    const p2Discard = state.players[1]!.hand[0]!;
    applyDiscard(state, 'p2', p2Discard.id);

    // Now p1 dives a 5 from pile and lays it off. Make it a true below-top dive by
    // also pushing a filler on top — top-only would be a plain draw (no must-use).
    const div = c('5', 'S', 'div');
    const filler = c('K', 'H', 'divFillerLayoff');
    state.discardPile.push(div);
    state.discardPile.push(filler);
    state.cardRegistry.set(div.id, div);
    state.cardRegistry.set(filler.id, filler);
    applyDrawFromPile(state, 'p1', 'div');
    expect(state.variantState.mustMeldCardId).toBe('div');
    applyLayoff(state, 'p1', meldId, 'div');
    expect(state.variantState.mustMeldCardId).toBeNull();
  });
});

// ---- multiple melds + layoffs per turn ----

describe('rum500 turn flow', () => {
  it('allows multiple melds in one turn', () => {
    // 500 Rummy rules silent on per-turn meld cap → permit (unlike basic)
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const setA = [c('9', 'C', 'a1'), c('9', 'D', 'a2'), c('9', 'H', 'a3')];
    const setB = [c('J', 'C', 'b1'), c('J', 'D', 'b2'), c('J', 'H', 'b3')];
    [...setA, ...setB].forEach((card) => {
      state.players[0]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    });
    applyMeld(state, 'p1', ['a1', 'a2', 'a3']);
    applyMeld(state, 'p1', ['b1', 'b2', 'b3']);
    expect(state.players[0]!.melds).toHaveLength(2);
  });

  it('layoff does NOT require own prior meld (unlike basic)', () => {
    // rules.md A.4.6
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const targetSet = [c('J', 'C', 'm1'), c('J', 'D', 'm2'), c('J', 'H', 'm3')];
    targetSet.forEach((card) => state.cardRegistry.set(card.id, card));
    state.players[1]!.melds.push({
      id: 'opMeld',
      kind: 'set',
      cardIds: ['m1', 'm2', 'm3'],
      ownerId: 'p2',
    });
    const lo = c('J', 'S', 'lo');
    state.players[0]!.hand.push(lo);
    state.cardRegistry.set(lo.id, lo);
    applyLayoff(state, 'p1', 'opMeld', 'lo');
    expect(state.meldedBy.get('lo')).toBe('p1');
  });

  it('mustMeldCardId cleared by layoff onto ANOTHER player’s meld (rules.md A.4.4 + A.4.6)', () => {
    const state = twoPlayerGame();
    // p2 has a set of 5s already on table.
    const targetSet = [c('5', 'C', 't1'), c('5', 'D', 't2'), c('5', 'H', 't3')];
    targetSet.forEach((card) => state.cardRegistry.set(card.id, card));
    state.players[1]!.melds.push({
      id: 'pileLayMeld',
      kind: 'set',
      cardIds: ['t1', 't2', 't3'],
      ownerId: 'p2',
    });
    // Stack discard so pile-diving the 5S triggers the must-use obligation. must5 must
    // be below the top for the dive to qualify (rules.md A.4.4) — add a filler on top.
    const must = c('5', 'S', 'must5');
    const filler = c('K', 'H', 'must5Filler');
    state.discardPile.push(must);
    state.discardPile.push(filler);
    state.cardRegistry.set(must.id, must);
    state.cardRegistry.set(filler.id, filler);
    applyDrawFromPile(state, 'p1', 'must5');
    expect(state.variantState.mustMeldCardId).toBe('must5');
    // Lay off onto p2's set; obligation should clear.
    applyLayoff(state, 'p1', 'pileLayMeld', 'must5');
    expect(state.variantState.mustMeldCardId).toBeNull();
    expect(state.meldedBy.get('must5')).toBe('p1');
  });

  it('discard advances turn and resets phase/mustMeldCardId', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const card = state.players[0]!.hand[0]!;
    applyDiscard(state, 'p1', card.id);
    expect(state.turnPlayerId).toBe('p2');
    expect(state.phase).toBe('draw');
    expect(state.variantState.mustMeldCardId).toBeNull();
  });

  it('layoff: ERR_CARD_NOT_IN_HAND when card belongs to another player', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const ghost = c('9', 'C', 'ghostHand');
    state.cardRegistry.set(ghost.id, ghost);
    state.players[1]!.melds.push({
      id: 'mx',
      kind: 'set',
      cardIds: ['m1', 'm2', 'm3'],
      ownerId: 'p2',
    });
    [c('9', 'D', 'm1'), c('9', 'H', 'm2'), c('9', 'S', 'm3')].forEach((card) => state.cardRegistry.set(card.id, card));
    expect(() => applyLayoff(state, 'p1', 'mx', 'ghostHand')).toThrow(/ERR_CARD_NOT_IN_HAND/);
  });

  it('layoff: ERR_MELD_NOT_FOUND for unknown meldId', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const card = state.players[0]!.hand[0]!;
    expect(() => applyLayoff(state, 'p1', 'no-such-meld', card.id)).toThrow('ERR_MELD_NOT_FOUND');
  });

  it('layoff: ERR_INVALID_LAYOFF when card breaks the meld', () => {
    // rules.md A.4.3 — extended meld must remain valid
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const setOfQ = [c('Q', 'C', 'q1'), c('Q', 'D', 'q2'), c('Q', 'H', 'q3')];
    setOfQ.forEach((card) => state.cardRegistry.set(card.id, card));
    state.players[1]!.melds.push({
      id: 'qSet',
      kind: 'set',
      cardIds: ['q1', 'q2', 'q3'],
      ownerId: 'p2',
    });
    const wrong = c('K', 'S', 'wrong500');
    state.players[0]!.hand.push(wrong);
    state.cardRegistry.set(wrong.id, wrong);
    expect(() => applyLayoff(state, 'p1', 'qSet', 'wrong500')).toThrow('ERR_INVALID_LAYOFF');
  });

  it('drawFromPile: ERR_WRONG_PHASE outside draw phase', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    expect(() => applyDrawFromPile(state, 'p1', state.discardPile[0]?.id ?? 'x')).toThrow('ERR_WRONG_PHASE');
  });

  it('meld: ERR_CARD_NOT_IN_HAND when card not held by player', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const orphan = [c('3', 'C', 'oC'), c('3', 'D', 'oD'), c('3', 'H', 'oH')];
    orphan.forEach((card) => state.cardRegistry.set(card.id, card));
    expect(() => applyMeld(state, 'p1', ['oC', 'oD', 'oH'])).toThrow(/ERR_CARD_NOT_IN_HAND/);
  });

  it('meld: ERR_INVALID_MELD for cards that do not form set or run', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const bad = [c('3', 'C', 'b1'), c('5', 'D', 'b2'), c('Q', 'H', 'b3')];
    bad.forEach((card) => {
      state.players[0]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    });
    expect(() => applyMeld(state, 'p1', ['b1', 'b2', 'b3'])).toThrow('ERR_INVALID_MELD');
  });

  it('discard: ERR_WRONG_PHASE before draw', () => {
    const state = twoPlayerGame();
    const card = state.players[0]!.hand[0]!;
    expect(() => applyDiscard(state, 'p1', card.id)).toThrow('ERR_WRONG_PHASE');
  });

  it('meld: ERR_WRONG_PHASE before draw', () => {
    const state = twoPlayerGame();
    expect(() => applyMeld(state, 'p1', [])).toThrow('ERR_WRONG_PHASE');
  });

  it('layoff: ERR_WRONG_PHASE before draw', () => {
    const state = twoPlayerGame();
    expect(() => applyLayoff(state, 'p1', 'm', 'c')).toThrow('ERR_WRONG_PHASE');
  });

  it('discard: ERR_CARD_NOT_IN_HAND when card not in player hand', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const ghost = c('5', 'C', 'ghost500');
    state.cardRegistry.set(ghost.id, ghost);
    expect(() => applyDiscard(state, 'p1', 'ghost500')).toThrow(/ERR_CARD_NOT_IN_HAND/);
  });

  it('Q-K-A run is sorted as Q,K,A (ace-high), not A,J,Q,K (rules.md A.4.3)', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const run = [c('Q', 'S', 'qS'), c('K', 'S', 'kS'), c('A', 'S', 'aS')];
    run.forEach((card) => {
      state.players[0]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    });
    applyMeld(state, 'p1', ['aS', 'qS', 'kS']);
    expect(state.players[0]!.melds[0]!.cardIds).toEqual(['qS', 'kS', 'aS']);
  });

  it('A-2-3 run is sorted as A,2,3 (ace-low) (rules.md A.4.3)', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const run = [c('A', 'H', 'aH'), c('2', 'H', '2H'), c('3', 'H', '3H')];
    run.forEach((card) => {
      state.players[0]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    });
    applyMeld(state, 'p1', ['3H', 'aH', '2H']);
    expect(state.players[0]!.melds[0]!.cardIds).toEqual(['aH', '2H', '3H']);
  });

  it('layoff of ace onto J-Q-K places ace at high end (Q-K-A direction)', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const run = [c('J', 'D', 'jD'), c('Q', 'D', 'qD'), c('K', 'D', 'kD')];
    run.forEach((card) => state.cardRegistry.set(card.id, card));
    state.players[1]!.melds.push({
      id: 'highRun',
      kind: 'run',
      cardIds: ['jD', 'qD', 'kD'],
      ownerId: 'p2',
    });
    const ace = c('A', 'D', 'aD');
    state.players[0]!.hand.push(ace);
    state.cardRegistry.set(ace.id, ace);
    applyLayoff(state, 'p1', 'highRun', 'aD');
    expect(state.players[1]!.melds[0]!.cardIds).toEqual(['jD', 'qD', 'kD', 'aD']);
  });

  it('layoff onto a run sorts cardIds in ascending rank order', () => {
    // rules.md A.4.3 — runs stay in sequence after layoff
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const run = [c('5', 'C', 'r5'), c('6', 'C', 'r6'), c('7', 'C', 'r7')];
    run.forEach((card) => state.cardRegistry.set(card.id, card));
    state.players[1]!.melds.push({
      id: 'sortRun',
      kind: 'run',
      cardIds: ['r5', 'r6', 'r7'],
      ownerId: 'p2',
    });
    const lo = c('4', 'C', 'r4');
    state.players[0]!.hand.push(lo);
    state.cardRegistry.set(lo.id, lo);
    applyLayoff(state, 'p1', 'sortRun', 'r4');
    expect(state.players[1]!.melds[0]!.cardIds).toEqual(['r4', 'r5', 'r6', 'r7']);
  });

  it('discarding the last hand card ends the hand', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const last = state.players[0]!.hand[0]!;
    state.players[0]!.hand = [last];
    const { handEnded } = applyDiscard(state, 'p1', last.id);
    expect(handEnded).toBe(true);
    expect(state.phase).toBe('ended');
  });

  it('meld that would empty the hand is rejected (rules.md A.4.8)', () => {
    // 500 Rummy: cannot play the last card — must retain one to discard.
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const set = [c('7', 'C', 'z1'), c('7', 'D', 'z2'), c('7', 'H', 'z3')];
    set.forEach((card) => state.cardRegistry.set(card.id, card));
    state.players[0]!.hand = [...set]; // exactly the 3 meld cards, nothing else
    expect(() => applyMeld(state, 'p1', ['z1', 'z2', 'z3'])).toThrow('ERR_CANNOT_PLAY_LAST_CARD');
    expect(state.players[0]!.melds).toHaveLength(0);
    expect(state.players[0]!.hand).toHaveLength(3);
  });

  it('layoff of the last hand card is rejected (rules.md A.4.8)', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const targetSet = [c('Q', 'C', 'w1'), c('Q', 'D', 'w2'), c('Q', 'H', 'w3')];
    targetSet.forEach((card) => state.cardRegistry.set(card.id, card));
    state.players[1]!.melds.push({
      id: 'qLast',
      kind: 'set',
      cardIds: ['w1', 'w2', 'w3'],
      ownerId: 'p2',
    });
    const lo = c('Q', 'S', 'loLast');
    state.cardRegistry.set(lo.id, lo);
    state.players[0]!.hand = [lo]; // only one card left
    expect(() => applyLayoff(state, 'p1', 'qLast', 'loLast')).toThrow('ERR_CANNOT_PLAY_LAST_CARD');
    expect(state.players[0]!.hand).toHaveLength(1);
  });

  it('meld leaving one card in hand is allowed (does not go out)', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const set = [c('8', 'C', 'y1'), c('8', 'D', 'y2'), c('8', 'H', 'y3')];
    const keep = c('2', 'S', 'keep');
    [...set, keep].forEach((card) => state.cardRegistry.set(card.id, card));
    state.players[0]!.hand = [...set, keep]; // 4 cards: meld 3, retain 1
    applyMeld(state, 'p1', ['y1', 'y2', 'y3']);
    expect(state.players[0]!.melds).toHaveLength(1);
    expect(state.players[0]!.hand).toHaveLength(1);
    expect(state.phase).toBe('meld');
  });
});

// ---- scoring (meld credit minus hand) ----

describe('rum500Variant.scoreHand', () => {
  it('credits melded value to placer minus hand value', () => {
    // rules.md A.4.7
    const state = twoPlayerGame();
    // Empty p2 hand (winner); register cards but melds go to p1 (placer)
    state.players[1]!.hand = [];
    state.players[0]!.hand = [c('5', 'H', 'h1'), c('K', 'D', 'h2')]; // 5+10=15

    const set = [c('7', 'C', 'q1'), c('7', 'D', 'q2'), c('7', 'H', 'q3')];
    set.forEach((card) => state.cardRegistry.set(card.id, card));
    state.players[0]!.melds.push({
      id: 'M1',
      kind: 'set',
      cardIds: ['q1', 'q2', 'q3'],
      ownerId: 'p1',
    });
    state.meldedBy.set('q1', 'p1');
    state.meldedBy.set('q2', 'p1');
    state.meldedBy.set('q3', 'p1');

    const scores = rum500Variant.scoreHand(state);
    // p1: 21 melded - 15 hand = 6
    expect(scores.get('p1')).toBe(21 - 15);
    expect(scores.get('p2')).toBe(0);
  });

  it('layoff credits points to layoff player', () => {
    // rules.md A.4.6
    const state = twoPlayerGame();
    state.players[0]!.hand = [];
    state.players[1]!.hand = [];
    // p1 meld of three Q (30 pts)
    const set = [c('Q', 'C', 'q1'), c('Q', 'D', 'q2'), c('Q', 'H', 'q3')];
    set.forEach((card) => state.cardRegistry.set(card.id, card));
    state.players[0]!.melds.push({
      id: 'M',
      kind: 'set',
      cardIds: ['q1', 'q2', 'q3', 'q4'],
      ownerId: 'p1',
    });
    const q4 = c('Q', 'S', 'q4');
    state.cardRegistry.set('q4', q4);
    ['q1', 'q2', 'q3'].forEach((id) => state.meldedBy.set(id, 'p1'));
    state.meldedBy.set('q4', 'p2'); // p2 laid off

    const scores = rum500Variant.scoreHand(state);
    expect(scores.get('p1')).toBe(30); // 3 × 10
    expect(scores.get('p2')).toBe(10); // 1 × 10
  });

  it('ace in A-2-3 run scores 1; ace in Q-K-A run scores 15', () => {
    // rules.md A.4.2
    const state = twoPlayerGame();
    state.players[0]!.hand = [];
    state.players[1]!.hand = [];

    const lowRun = [c('A', 'C', 'lA'), c('2', 'C', 'l2'), c('3', 'C', 'l3')];
    const highRun = [c('Q', 'D', 'hQ'), c('K', 'D', 'hK'), c('A', 'D', 'hA')];
    [...lowRun, ...highRun].forEach((card) => {
      state.cardRegistry.set(card.id, card);
      state.meldedBy.set(card.id, 'p1');
    });
    state.players[0]!.melds.push(
      { id: 'L', kind: 'run', cardIds: ['lA', 'l2', 'l3'], ownerId: 'p1' },
      { id: 'H', kind: 'run', cardIds: ['hQ', 'hK', 'hA'], ownerId: 'p1' },
    );
    const scores = rum500Variant.scoreHand(state);
    // low: 1+2+3 = 6; high: 10+10+15 = 35; total = 41
    expect(scores.get('p1')).toBe(6 + 35);
  });

  it('ace in set scores 15', () => {
    const state = twoPlayerGame();
    state.players[0]!.hand = [];
    state.players[1]!.hand = [];
    const set = [c('A', 'C', 'a1'), c('A', 'D', 'a2'), c('A', 'H', 'a3')];
    set.forEach((card) => {
      state.cardRegistry.set(card.id, card);
      state.meldedBy.set(card.id, 'p1');
    });
    state.players[0]!.melds.push({
      id: 'AS',
      kind: 'set',
      cardIds: ['a1', 'a2', 'a3'],
      ownerId: 'p1',
    });
    const scores = rum500Variant.scoreHand(state);
    expect(scores.get('p1')).toBe(45);
  });

  it('ace in hand counts 15 against player', () => {
    // Locked house rule: aces in hand always 15
    const state = twoPlayerGame();
    state.players[0]!.hand = [c('A', 'H', 'a')];
    state.players[1]!.hand = [];
    const scores = rum500Variant.scoreHand(state);
    expect(scores.get('p1')).toBe(-15);
  });
});

// ---- not-your-turn + unknown-card sweep ----

describe('rum500 turn-ownership + unknown-card enforcement', () => {
  it('draw: ERR_NOT_YOUR_TURN', () => {
    const state = twoPlayerGame();
    expect(() => applyDraw(state, 'p2', 'stock')).toThrow('ERR_NOT_YOUR_TURN');
  });

  it('drawFromPile: ERR_NOT_YOUR_TURN', () => {
    const state = twoPlayerGame();
    const top = state.discardPile[0]!;
    expect(() => applyDrawFromPile(state, 'p2', top.id)).toThrow('ERR_NOT_YOUR_TURN');
  });

  it('meld: ERR_NOT_YOUR_TURN', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    expect(() => applyMeld(state, 'p2', [])).toThrow('ERR_NOT_YOUR_TURN');
  });

  it('layoff: ERR_NOT_YOUR_TURN', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    expect(() => applyLayoff(state, 'p2', 'm', 'c')).toThrow('ERR_NOT_YOUR_TURN');
  });

  it('discard: ERR_NOT_YOUR_TURN', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    expect(() => applyDiscard(state, 'p2', 'x')).toThrow('ERR_NOT_YOUR_TURN');
  });

  it('meld: ERR_UNKNOWN_CARD for unknown cardId', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    expect(() => applyMeld(state, 'p1', ['ghost500'])).toThrow(/ERR_UNKNOWN_CARD/);
  });

  it('layoff: ERR_UNKNOWN_CARD for unknown cardId', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    expect(() => applyLayoff(state, 'p1', 'm', 'phantom500')).toThrow(/ERR_UNKNOWN_CARD/);
  });

  it('discard: ERR_UNKNOWN_CARD for unknown cardId', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    expect(() => applyDiscard(state, 'p1', 'phantom500')).toThrow(/ERR_UNKNOWN_CARD/);
  });
});

// ---- forfeit handling ----

describe('rum500 forfeit handling', () => {
  it('ERR_PLAYER_FORFEITED if turn player is marked forfeited', () => {
    const state = twoPlayerGame();
    state.players[0]!.status = 'forfeited';
    expect(() => applyDraw(state, 'p1', 'stock')).toThrow('ERR_PLAYER_FORFEITED');
  });

  it('advanceTurn skips forfeited players (3P after forfeit of middle)', () => {
    const state = createRum500Game(
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

  it('scoreHand excludes forfeited players entirely', () => {
    const state = createRum500Game(
      'r3',
      [
        { id: 'p1', name: 'A' },
        { id: 'p2', name: 'B' },
        { id: 'p3', name: 'C' },
      ],
      makeSeededRNG(1),
      0,
    );
    state.players[0]!.hand = [];
    state.players[1]!.hand = [];
    state.players[2]!.status = 'forfeited';
    // give p3 (forfeited) a giant 'hand' that should be ignored
    state.players[2]!.hand = [c('A', 'C', 'xA'), c('K', 'D', 'xK')];
    const set = [c('7', 'C', 'q1'), c('7', 'D', 'q2'), c('7', 'H', 'q3')];
    set.forEach((card) => {
      state.cardRegistry.set(card.id, card);
      state.meldedBy.set(card.id, 'p1');
    });
    state.players[0]!.melds.push({ id: 'M', kind: 'set', cardIds: ['q1', 'q2', 'q3'], ownerId: 'p1' });
    const scores = rum500Variant.scoreHand(state);
    expect(scores.get('p1')).toBe(21); // 7+7+7, no hand penalty
    expect(scores.get('p2')).toBe(0);
    expect(scores.get('p3')).toBe(0); // forfeited, not penalised by deadwood
  });
});

// ---- multiple layoffs per turn ----

describe('rum500 multiple layoffs per turn (rules.md A.4.6)', () => {
  it('allows multiple layoff actions in one turn', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const set = [c('5', 'C', 's1'), c('5', 'D', 's2'), c('5', 'H', 's3')];
    set.forEach((card) => state.cardRegistry.set(card.id, card));
    state.players[1]!.melds.push({
      id: 'fiveset',
      kind: 'set',
      cardIds: ['s1', 's2', 's3'],
      ownerId: 'p2',
    });
    const run = [c('6', 'S', 'r6'), c('7', 'S', 'r7'), c('8', 'S', 'r8')];
    run.forEach((card) => state.cardRegistry.set(card.id, card));
    state.players[1]!.melds.push({
      id: 'sRun',
      kind: 'run',
      cardIds: ['r6', 'r7', 'r8'],
      ownerId: 'p2',
    });
    const lo1 = c('5', 'S', 'lo1'); // 4th 5 onto set
    const lo2 = c('9', 'S', 'lo2'); // extend run high end
    [lo1, lo2].forEach((card) => {
      state.players[0]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    });
    applyLayoff(state, 'p1', 'fiveset', 'lo1');
    applyLayoff(state, 'p1', 'sRun', 'lo2');
    expect(state.players[1]!.melds.find((m) => m.id === 'fiveset')!.cardIds).toContain('lo1');
    expect(state.players[1]!.melds.find((m) => m.id === 'sRun')!.cardIds).toContain('lo2');
  });
});

// ---- pile-dive edge cases ----

describe('rum500 pile dive edge cases', () => {
  it('drawFromPile on the TOP card degrades to a plain top-card draw (no must-meld)', () => {
    // rules.md A.4.4 — pile dive is defined as picking BELOW the top. A drawFromPile
    // call that names the top card should behave like applyDraw {from:'discard'}:
    // record drewFromDiscardId, do NOT set mustMeldCardId, and skip preflight.
    const state = twoPlayerGame();
    const bot = c('5', 'C', 'bot');
    const top = c('6', 'D', 'top');
    state.discardPile = [bot, top];
    state.cardRegistry.set(bot.id, bot);
    state.cardRegistry.set(top.id, top);
    const { taken } = applyDrawFromPile(state, 'p1', 'top');
    expect(taken.map((c) => c.id)).toEqual(['top']);
    expect(state.discardPile.map((c) => c.id)).toEqual(['bot']);
    expect(state.variantState.mustMeldCardId).toBeNull();
    expect(state.drewFromDiscardId).toBe('top');
  });

  it('pile dive at the BOTTOM takes the entire pile', () => {
    const state = twoPlayerGame();
    const cards = [c('2', 'C', 'p0'), c('5', 'D', 'p1'), c('9', 'H', 'p2')];
    state.discardPile = [...cards];
    cards.forEach((card) => state.cardRegistry.set(card.id, card));
    // Preflight needs partners for the dived bottom card 2-C.
    const partners = [c('2', 'D', 'partD'), c('2', 'H', 'partH')];
    partners.forEach((card) => {
      state.players[0]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    });
    const { taken } = applyDrawFromPile(state, 'p1', 'p0');
    expect(taken.map((c) => c.id)).toEqual(['p0', 'p1', 'p2']);
    expect(state.discardPile).toHaveLength(0);
    expect(state.variantState.mustMeldCardId).toBe('p0');
  });

  it('preflight rejects a dive whose selected card has no legal placement', () => {
    // rules.md A.4.4 — refuse rather than create an unsatisfiable must-use state.
    const state = twoPlayerGame();
    // Clear p1's hand so nothing can pair with the dived card.
    state.players[0]!.hand = [];
    const target = c('7', 'H', 'noLegal');
    const filler = c('K', 'C', 'noLegalFiller');
    state.discardPile = [target, filler];
    state.cardRegistry.set(target.id, target);
    state.cardRegistry.set(filler.id, filler);
    expect(() => applyDrawFromPile(state, 'p1', 'noLegal')).toThrow('ERR_NO_LEGAL_DIVE');
    // State unchanged.
    expect(state.discardPile.map((c) => c.id)).toEqual(['noLegal', 'noLegalFiller']);
    expect(state.variantState.mustMeldCardId).toBeNull();
  });
});

// ---- isGameOver ----

describe('rum500Variant.isGameOver', () => {
  it('game over when cumulative ≥ 500', () => {
    const sheet = new Map([
      ['p1', [200, 310]],
      ['p2', [100, 50]],
    ]);
    expect(rum500Variant.isGameOver(sheet)).toBe(true);
  });

  it('not over below 500', () => {
    const sheet = new Map([
      ['p1', [200, 100]],
      ['p2', [150, 150]],
    ]);
    expect(rum500Variant.isGameOver(sheet)).toBe(false);
  });
});
