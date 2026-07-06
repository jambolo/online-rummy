import { describe, expect, it } from 'vitest';
import type { Card, HouseRules } from '@online-rummy/shared';
import { makeSeededRNG } from '../../rng.js';
import { applyDiscard, applyDraw, applyLayoff, applyMeld, basicVariant, createBasicGame } from '../variants/basic.js';
import { createRum500Game } from '../variants/rum500.js';

// rules.md A.1.4 (aceEitherEnd / roundTheCorner run validation) and A.1.8 (P1/D1
// unmelded-ace scoring). Golden tests for canonical AND house-rule-enabled behavior.
// Canonical (no houseRules) coverage here must stay consistent with basic.test.ts.

function c(rank: Card['rank'], suit: Card['suit'], id?: string): Card {
  return { id: id ?? `${rank}${suit}`, rank, suit };
}

function twoPlayerGame(houseRules?: HouseRules, seed = 1) {
  return createBasicGame(
    'room1',
    [
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ],
    makeSeededRNG(seed),
    0, // p1 always goes first in unit tests
    houseRules,
  );
}

// ---- run validation: canonical (ace low only) ----

describe('canonical run validation (no house rules)', () => {
  it('rejects Q-K-A (ace low only)', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const cards = [c('Q', 'H', 'qka1'), c('K', 'H', 'qka2'), c('A', 'H', 'qka3')];
    cards.forEach((card) => {
      state.players[0]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    });
    expect(() => applyMeld(state, 'p1', ['qka1', 'qka2', 'qka3'])).toThrow('ERR_INVALID_MELD');
  });

  it('accepts A-2-3 (ace low)', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const cards = [c('A', 'H', 'a231'), c('2', 'H', 'a232'), c('3', 'H', 'a233')];
    cards.forEach((card) => {
      state.players[0]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    });
    expect(() => applyMeld(state, 'p1', ['a231', 'a232', 'a233'])).not.toThrow();
    expect(state.players[0]!.melds).toHaveLength(1);
  });
});

// ---- run validation: aceEitherEnd ----

describe('aceEitherEnd house rule (rules.md A.1.4)', () => {
  it('accepts Q-K-A', () => {
    const state = twoPlayerGame({ aceEitherEnd: true });
    applyDraw(state, 'p1', 'stock');
    const cards = [c('Q', 'H', 'qka1'), c('K', 'H', 'qka2'), c('A', 'H', 'qka3')];
    cards.forEach((card) => {
      state.players[0]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    });
    expect(() => applyMeld(state, 'p1', ['qka1', 'qka2', 'qka3'])).not.toThrow();
  });

  it('still rejects K-A-2 (round-the-corner not implied)', () => {
    const state = twoPlayerGame({ aceEitherEnd: true });
    applyDraw(state, 'p1', 'stock');
    const cards = [c('K', 'H', 'ka21'), c('A', 'H', 'ka22'), c('2', 'H', 'ka23')];
    cards.forEach((card) => {
      state.players[0]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    });
    expect(() => applyMeld(state, 'p1', ['ka21', 'ka22', 'ka23'])).toThrow('ERR_INVALID_MELD');
  });
});

// ---- run validation: roundTheCorner (implies aceEitherEnd — decision D4) ----

describe('roundTheCorner house rule (rules.md A.1.4, decision D4)', () => {
  it('accepts K-A-2 (wraps)', () => {
    const state = twoPlayerGame({ roundTheCorner: true });
    applyDraw(state, 'p1', 'stock');
    const cards = [c('K', 'H', 'ka21'), c('A', 'H', 'ka22'), c('2', 'H', 'ka23')];
    cards.forEach((card) => {
      state.players[0]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    });
    expect(() => applyMeld(state, 'p1', ['ka21', 'ka22', 'ka23'])).not.toThrow();
  });

  it('accepts Q-K-A (implied aceEitherEnd) without normalizing houseRules', () => {
    const state = twoPlayerGame({ roundTheCorner: true });
    applyDraw(state, 'p1', 'stock');
    const cards = [c('Q', 'D', 'qka1'), c('K', 'D', 'qka2'), c('A', 'D', 'qka3')];
    cards.forEach((card) => {
      state.players[0]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    });
    expect(() => applyMeld(state, 'p1', ['qka1', 'qka2', 'qka3'])).not.toThrow();
    // Decision D4: the implication (roundTheCorner ⇒ aceEitherEnd) is applied only at
    // the opts-building site — state.houseRules itself records only what was toggled.
    expect(state.houseRules.aceEitherEnd).toBeUndefined();
  });
});

// ---- run display order: wrap and ace-high runs sort in sequence order ----

describe('run cardId display order under house rules (rules.md A.1.4)', () => {
  it('roundTheCorner: K-A-2 melds in K,A,2 order (not A,2,K)', () => {
    const state = twoPlayerGame({ roundTheCorner: true });
    applyDraw(state, 'p1', 'stock');
    const cards = [c('A', 'H', 'ka22'), c('2', 'H', 'ka23'), c('K', 'H', 'ka21')];
    cards.forEach((card) => {
      state.players[0]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    });
    applyMeld(state, 'p1', ['ka22', 'ka23', 'ka21']);
    expect(state.players[0]!.melds[0]!.cardIds).toEqual(['ka21', 'ka22', 'ka23']);
  });

  it('aceEitherEnd: Q-K-A melds in Q,K,A order (not A,Q,K)', () => {
    const state = twoPlayerGame({ aceEitherEnd: true });
    applyDraw(state, 'p1', 'stock');
    const cards = [c('A', 'H', 'qka3'), c('Q', 'H', 'qka1'), c('K', 'H', 'qka2')];
    cards.forEach((card) => {
      state.players[0]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    });
    applyMeld(state, 'p1', ['qka3', 'qka1', 'qka2']);
    expect(state.players[0]!.melds[0]!.cardIds).toEqual(['qka1', 'qka2', 'qka3']);
  });

  it('roundTheCorner: Q-K-A melds in Q,K,A order (not A,Q,K)', () => {
    const state = twoPlayerGame({ roundTheCorner: true });
    applyDraw(state, 'p1', 'stock');
    const cards = [c('A', 'H', 'qka3'), c('Q', 'H', 'qka1'), c('K', 'H', 'qka2')];
    cards.forEach((card) => {
      state.players[0]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    });
    applyMeld(state, 'p1', ['qka3', 'qka1', 'qka2']);
    expect(state.players[0]!.melds[0]!.cardIds).toEqual(['qka1', 'qka2', 'qka3']);
  });

  it('roundTheCorner: laying off Q onto K-A-2 yields Q,K,A,2 order', () => {
    const state = twoPlayerGame({ roundTheCorner: true });
    applyDraw(state, 'p1', 'stock');
    const cards = [c('K', 'H', 'ka21'), c('A', 'H', 'ka22'), c('2', 'H', 'ka23')];
    cards.forEach((card) => {
      state.players[0]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    });
    applyMeld(state, 'p1', ['ka21', 'ka22', 'ka23']);
    const meldId = state.players[0]!.melds[0]!.id;

    const q = c('Q', 'H', 'layoffQ');
    state.players[0]!.hand.push(q);
    state.cardRegistry.set(q.id, q);

    applyLayoff(state, 'p1', meldId, 'layoffQ');
    expect(state.players[0]!.melds[0]!.cardIds).toEqual(['layoffQ', 'ka21', 'ka22', 'ka23']);
  });

  it('canonical contiguous run keeps ascending order unchanged', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const cards = [c('6', 'H', 'r6'), c('4', 'H', 'r4'), c('5', 'H', 'r5')];
    cards.forEach((card) => {
      state.players[0]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    });
    applyMeld(state, 'p1', ['r6', 'r4', 'r5']);
    expect(state.players[0]!.melds[0]!.cardIds).toEqual(['r4', 'r5', 'r6']);
  });
});

// ---- layoff: house rule widens which cards may extend an existing run ----

describe('layoff under house rules (rules.md A.1.6 step 3)', () => {
  it('aceEitherEnd: ace lays off onto J-Q-K', () => {
    const state = twoPlayerGame({ aceEitherEnd: true });
    applyDraw(state, 'p1', 'stock');
    const meldCards = [c('J', 'H', 'jqk1'), c('Q', 'H', 'jqk2'), c('K', 'H', 'jqk3')];
    meldCards.forEach((card) => {
      state.players[0]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    });
    applyMeld(state, 'p1', ['jqk1', 'jqk2', 'jqk3']);
    const meldId = state.players[0]!.melds[0]!.id;

    const ace = c('A', 'H', 'layoffAce');
    state.players[0]!.hand.push(ace);
    state.cardRegistry.set(ace.id, ace);

    expect(() => applyLayoff(state, 'p1', meldId, 'layoffAce')).not.toThrow();
    expect(state.players[0]!.melds[0]!.cardIds).toContain('layoffAce');
  });

  it('canonical: the same ace layoff onto J-Q-K throws ERR_INVALID_LAYOFF', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    const meldCards = [c('J', 'H', 'jqk1'), c('Q', 'H', 'jqk2'), c('K', 'H', 'jqk3')];
    meldCards.forEach((card) => {
      state.players[0]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    });
    applyMeld(state, 'p1', ['jqk1', 'jqk2', 'jqk3']);
    const meldId = state.players[0]!.melds[0]!.id;

    const ace = c('A', 'H', 'layoffAce');
    state.players[0]!.hand.push(ace);
    state.cardRegistry.set(ace.id, ace);

    expect(() => applyLayoff(state, 'p1', meldId, 'layoffAce')).toThrow(/^ERR_INVALID_LAYOFF/);
  });
});

// ---- scoring: unmelded ace scores 15 under aceEitherEnd/roundTheCorner (rules.md A.1.8, D1) ----

describe('scoreHand + handEndPayload unmelded-ace scoring (rules.md A.1.8, decision D1)', () => {
  function rigWinner(state: ReturnType<typeof twoPlayerGame>): void {
    state.players[0]!.hand = []; // p1 wins (empties hand)
    const p2hand = [c('A', 'S'), c('5', 'D')];
    state.players[1]!.hand = p2hand;
    p2hand.forEach((card) => state.cardRegistry.set(card.id, card));
    state.meldedBy.set('marker', 'p1'); // p1 placed a card earlier — suppresses going-rummy doubling
  }

  it('canonical: ace scores 1 (total 6)', () => {
    const state = twoPlayerGame();
    rigWinner(state);
    expect(basicVariant.scoreHand(state).get('p1')).toBe(6);
    expect(basicVariant.handEndPayload(state, new Map()).handDeadwood['p2']).toBe(6);
  });

  it('aceEitherEnd: ace scores 15 (total 20)', () => {
    const state = twoPlayerGame({ aceEitherEnd: true });
    rigWinner(state);
    expect(basicVariant.scoreHand(state).get('p1')).toBe(20);
    expect(basicVariant.handEndPayload(state, new Map()).handDeadwood['p2']).toBe(20);
  });

  it('roundTheCorner: ace scores 15 (total 20)', () => {
    const state = twoPlayerGame({ roundTheCorner: true });
    rigWinner(state);
    expect(basicVariant.scoreHand(state).get('p1')).toBe(20);
    expect(basicVariant.handEndPayload(state, new Map()).handDeadwood['p2']).toBe(20);
  });
});

// ---- maxOneMeldPerTurn: per-turn meld cap (rules.md A.1.6 step 2 [PG-R]) ----

describe('maxOneMeldPerTurn house rule (rules.md A.1.6 step 2, [PG-R])', () => {
  function rigSet(state: ReturnType<typeof twoPlayerGame>, playerIdx: 0 | 1, cards: Card[]): void {
    cards.forEach((card) => {
      state.players[playerIdx]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    });
  }

  it('canonical (no flag): a player may place two melds in the same turn', () => {
    const state = twoPlayerGame();
    applyDraw(state, 'p1', 'stock');
    rigSet(state, 0, [c('9', 'C', 'x1'), c('9', 'D', 'x2'), c('9', 'H', 'x3')]);
    rigSet(state, 0, [c('8', 'C', 't1'), c('8', 'D', 't2'), c('8', 'H', 't3')]);

    expect(() => applyMeld(state, 'p1', ['x1', 'x2', 'x3'])).not.toThrow();
    expect(() => applyMeld(state, 'p1', ['t1', 't2', 't3'])).not.toThrow();
    expect(state.players[0]!.melds).toHaveLength(2);
  });

  it('{ maxOneMeldPerTurn: true }: a second meld in the same turn throws ERR_MAX_ONE_MELD', () => {
    const state = twoPlayerGame({ maxOneMeldPerTurn: true });
    applyDraw(state, 'p1', 'stock');
    rigSet(state, 0, [c('9', 'C', 'x1'), c('9', 'D', 'x2'), c('9', 'H', 'x3')]);
    rigSet(state, 0, [c('8', 'C', 't1'), c('8', 'D', 't2'), c('8', 'H', 't3')]);

    expect(() => applyMeld(state, 'p1', ['x1', 'x2', 'x3'])).not.toThrow();
    expect(() => applyMeld(state, 'p1', ['t1', 't2', 't3'])).toThrow('ERR_MAX_ONE_MELD');
  });

  it('flag on: layoff after a meld is unaffected by the one-meld-per-turn cap', () => {
    const state = twoPlayerGame({ maxOneMeldPerTurn: true });
    applyDraw(state, 'p1', 'stock');
    rigSet(state, 0, [c('9', 'C', 'x1'), c('9', 'D', 'x2'), c('9', 'H', 'x3')]);
    applyMeld(state, 'p1', ['x1', 'x2', 'x3']);
    const meldId = state.players[0]!.melds[0]!.id;

    rigSet(state, 0, [c('9', 'S', 'x4')]);
    expect(() => applyLayoff(state, 'p1', meldId, 'x4')).not.toThrow();
    expect(state.players[0]!.melds[0]!.cardIds).toContain('x4');
  });

  it('flag on: meldedThisTurn resets when the turn advances to the next player', () => {
    const state = twoPlayerGame({ maxOneMeldPerTurn: true });
    applyDraw(state, 'p1', 'stock');
    rigSet(state, 0, [c('9', 'C', 'x1'), c('9', 'D', 'x2'), c('9', 'H', 'x3')]);
    applyMeld(state, 'p1', ['x1', 'x2', 'x3']);

    // p1 discards a spare card to end the turn.
    rigSet(state, 0, [c('2', 'S', 'spare1')]);
    applyDiscard(state, 'p1', 'spare1');
    expect(state.turnPlayerId).toBe('p2');

    rigSet(state, 1, [c('7', 'C', 'y1'), c('7', 'D', 'y2'), c('7', 'H', 'y3')]);
    applyDraw(state, 'p2', 'stock');
    expect(() => applyMeld(state, 'p2', ['y1', 'y2', 'y3'])).not.toThrow();
  });

  it('variant-mismatch guard: applyMeld on a non-basic state throws ERR_VARIANT_MISMATCH:basic', () => {
    const s500 = createRum500Game(
      'r',
      [
        { id: 'p1', name: 'A' },
        { id: 'p2', name: 'B' },
      ],
      makeSeededRNG(1),
      0,
      { maxOneMeldPerTurn: true },
    );
    s500.phase = 'meld';
    expect(() => applyMeld(s500, 'p1', ['x', 'y', 'z'])).toThrow('ERR_VARIANT_MISMATCH:basic');
  });
});

// ---- layoffRequiresPriorMeld: layoff gated on player's own prior meld (rules.md A.1.6 step 3, [WP]) ----

describe('layoffRequiresPriorMeld', () => {
  function rigP2JackMeld(state: ReturnType<typeof twoPlayerGame>): void {
    const m = [c('J', 'C', 'm1'), c('J', 'D', 'm2'), c('J', 'H', 'm3')];
    m.forEach((card) => state.cardRegistry.set(card.id, card));
    state.players[1]!.melds.push({ id: 'meldX', kind: 'set', cardIds: ['m1', 'm2', 'm3'], ownerId: 'p2' });
    m.forEach((card) => state.meldedBy.set(card.id, 'p2'));
  }

  it('canonical (no flag): p1 may lay off with no melds of their own', () => {
    const state = twoPlayerGame();
    rigP2JackMeld(state);
    const js = c('J', 'S', 'js');
    state.players[0]!.hand.push(js);
    state.cardRegistry.set(js.id, js);

    applyDraw(state, 'p1', 'stock');
    expect(applyLayoff(state, 'p1', 'meldX', 'js')).toBe(false);
    expect(state.players[1]!.melds[0]!.cardIds).toContain('js');
  });

  it('{ layoffRequiresPriorMeld: true }: p1 with no melds of their own throws ERR_LAYOFF_REQUIRES_MELD', () => {
    const state = twoPlayerGame({ layoffRequiresPriorMeld: true });
    rigP2JackMeld(state);
    const js = c('J', 'S', 'js');
    state.players[0]!.hand.push(js);
    state.cardRegistry.set(js.id, js);

    applyDraw(state, 'p1', 'stock');
    expect(() => applyLayoff(state, 'p1', 'meldX', 'js')).toThrow('ERR_LAYOFF_REQUIRES_MELD');
  });

  it('flag on: satisfied by a meld p1 places earlier the same turn', () => {
    const state = twoPlayerGame({ layoffRequiresPriorMeld: true });
    rigP2JackMeld(state);
    const js = c('J', 'S', 'js');
    state.players[0]!.hand.push(js);
    state.cardRegistry.set(js.id, js);
    const nines = [c('9', 'C', 'n1'), c('9', 'D', 'n2'), c('9', 'H', 'n3')];
    nines.forEach((card) => {
      state.players[0]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    });

    applyDraw(state, 'p1', 'stock');
    applyMeld(state, 'p1', ['n1', 'n2', 'n3']);
    expect(() => applyLayoff(state, 'p1', 'meldX', 'js')).not.toThrow();
    expect(state.players[1]!.melds[0]!.cardIds).toContain('js');
  });
});

// ---- goingRummyFlat10: flat +10 bonus instead of doubling (rules.md A.1.7, [PG-R]) ----

describe('goingRummyFlat10', () => {
  function rigRummyWinner(state: ReturnType<typeof twoPlayerGame>): void {
    state.players[0]!.hand = []; // p1 wins (empties hand)
    const p2hand = [c('5', 'D'), c('6', 'D')];
    state.players[1]!.hand = p2hand;
    p2hand.forEach((card) => state.cardRegistry.set(card.id, card));
    // No 'p1' entry in state.meldedBy: p1 placed no card all hand → went rummy.
  }

  it('canonical: going-rummy bonus doubles the earned total (22)', () => {
    const state = twoPlayerGame();
    rigRummyWinner(state);
    expect(basicVariant.scoreHand(state).get('p1')).toBe(22);
  });

  it('{ goingRummyFlat10: true }: going-rummy bonus is a flat +10 (21)', () => {
    const state = twoPlayerGame({ goingRummyFlat10: true });
    rigRummyWinner(state);
    expect(basicVariant.scoreHand(state).get('p1')).toBe(21);
  });

  it('flag on but not going rummy: normal score only (11), flat bonus does not apply', () => {
    const state = twoPlayerGame({ goingRummyFlat10: true });
    rigRummyWinner(state);
    state.meldedBy.set('marker', 'p1'); // p1 placed a card earlier — not going rummy
    expect(basicVariant.scoreHand(state).get('p1')).toBe(11);
  });
});
