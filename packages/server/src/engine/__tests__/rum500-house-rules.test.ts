// NS-8 (T-NS8-2 / p3-5): golden tests for the 500 Rummy `deal10For2P` (rules.md A.4.1
// [PR]) and `unifiedObligation` (rules.md A.4.4) house rules. Canonical (flag absent)
// behavior is pinned alongside each flagged behavior to guard against regressions.
import { describe, expect, it } from 'vitest';
import type { Card, HouseRules } from '@online-rummy/shared';
import { makeSeededRNG } from '../../rng.js';
import { applyDiscard, applyDraw, applyDrawFromPile, applyMeld, createRum500Game } from '../variants/rum500.js';

function c(rank: Card['rank'], suit: Card['suit'], id?: string): Card {
  return { id: id ?? `${rank}${suit}`, rank, suit };
}

function twoPlayerGame(houseRules?: HouseRules, seed = 1) {
  return createRum500Game(
    'room1',
    [
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ],
    makeSeededRNG(seed),
    0,
    houseRules,
  );
}

// ---- deal10For2P (rules.md A.4.1 [PR]) ----

describe('deal10For2P', () => {
  it('canonical 2P deals 13 each; stock 25 (52 - 26 - 1)', () => {
    const state = twoPlayerGame();
    expect(state.players[0]?.hand).toHaveLength(13);
    expect(state.players[1]?.hand).toHaveLength(13);
    expect(state.stock).toHaveLength(52 - 26 - 1);
  });

  it('{ deal10For2P: true } deals 10 each for 2P; stock 31 (52 - 20 - 1)', () => {
    const state = twoPlayerGame({ deal10For2P: true });
    expect(state.players[0]?.hand).toHaveLength(10);
    expect(state.players[1]?.hand).toHaveLength(10);
    expect(state.stock).toHaveLength(52 - 20 - 1);
  });

  it('{ deal10For2P: true } does not affect 3P (still 7 each)', () => {
    const state = createRum500Game(
      'room3',
      [
        { id: 'p1', name: 'A' },
        { id: 'p2', name: 'B' },
        { id: 'p3', name: 'C' },
      ],
      makeSeededRNG(1),
      0,
      { deal10For2P: true },
    );
    for (const p of state.players) expect(p.hand).toHaveLength(7);
  });
});

// ---- unifiedObligation (rules.md A.4.4) ----

describe('unifiedObligation', () => {
  it('canonical: top-card draw sets drewFromDiscardId only, no obligation', () => {
    const state = twoPlayerGame();
    const top = c('9', 'S', 'top9');
    state.discardPile.push(top);
    state.cardRegistry.set(top.id, top);
    const h9d = c('9', 'D', 'h9d');
    const h9h = c('9', 'H', 'h9h');
    for (const card of [h9d, h9h]) {
      state.players[0]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    }

    applyDraw(state, 'p1', 'discard');

    expect(state.drewFromDiscardId).toBe('top9');
    expect(state.variantState.mustMeldCardId).toBeNull();
  });

  it('flag on + usable top card: sets both fields; enforced then clearable via meld', () => {
    const state = twoPlayerGame({ unifiedObligation: true });
    const top = c('9', 'S', 'top9');
    state.discardPile.push(top);
    state.cardRegistry.set(top.id, top);
    const h9d = c('9', 'D', 'h9d');
    const h9h = c('9', 'H', 'h9h');
    for (const card of [h9d, h9h]) {
      state.players[0]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    }

    applyDraw(state, 'p1', 'discard');

    expect(state.drewFromDiscardId).toBe('top9');
    expect(state.variantState.mustMeldCardId).toBe('top9');

    expect(() => applyDiscard(state, 'p1', 'top9')).toThrow('ERR_MUST_USE_PILE_CARD');

    applyMeld(state, 'p1', ['top9', 'h9d', 'h9h']);
    expect(state.variantState.mustMeldCardId).toBeNull();

    // Obligation cleared — discarding a different rigged card now succeeds.
    const nextDiscardId = state.players[0]!.hand[0]!.id;
    expect(() => applyDiscard(state, 'p1', nextDiscardId)).not.toThrow();
  });

  it('flag on + unusable top card: draw refused, pile and hand unchanged', () => {
    const state = twoPlayerGame({ unifiedObligation: true });
    const u1 = c('7', 'H', 'u1');
    const u2 = c('9', 'H', 'u2');
    const u3 = c('J', 'H', 'u3');
    const u4 = c('K', 'D', 'u4');
    state.players[0]!.hand = [u1, u2, u3, u4];
    for (const card of [u1, u2, u3, u4]) state.cardRegistry.set(card.id, card);

    const top = c('2', 'S', 'top2');
    state.discardPile.push(top);
    state.cardRegistry.set(top.id, top);

    expect(() => applyDraw(state, 'p1', 'discard')).toThrow('ERR_NO_LEGAL_DIVE');

    expect(state.discardPile[state.discardPile.length - 1]?.id).toBe('top2');
    expect(state.players[0]!.hand).toHaveLength(4);
  });

  it('flag on + applyDrawFromPile top-card pick, usable: sets both fields', () => {
    const state = twoPlayerGame({ unifiedObligation: true });
    const top = c('9', 'S', 'top9');
    state.discardPile.push(top);
    state.cardRegistry.set(top.id, top);
    const h9d = c('9', 'D', 'h9d');
    const h9h = c('9', 'H', 'h9h');
    for (const card of [h9d, h9h]) {
      state.players[0]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    }

    const { taken } = applyDrawFromPile(state, 'p1', 'top9');

    expect(taken).toHaveLength(1);
    expect(state.drewFromDiscardId).toBe('top9');
    expect(state.variantState.mustMeldCardId).toBe('top9');
  });

  it('flag on + applyDrawFromPile top-card pick, unusable: throws ERR_NO_LEGAL_DIVE', () => {
    const state = twoPlayerGame({ unifiedObligation: true });
    const u1 = c('7', 'H', 'u1');
    const u2 = c('9', 'H', 'u2');
    const u3 = c('J', 'H', 'u3');
    const u4 = c('K', 'D', 'u4');
    state.players[0]!.hand = [u1, u2, u3, u4];
    for (const card of [u1, u2, u3, u4]) state.cardRegistry.set(card.id, card);

    const top = c('2', 'S', 'top2');
    state.discardPile.push(top);
    state.cardRegistry.set(top.id, top);

    expect(() => applyDrawFromPile(state, 'p1', 'top2')).toThrow('ERR_NO_LEGAL_DIVE');
  });

  it('canonical applyDrawFromPile top-card pick: drewFromDiscardId set, mustMeldCardId null (regression pin)', () => {
    const state = twoPlayerGame();
    const top = c('9', 'S', 'top9');
    state.discardPile.push(top);
    state.cardRegistry.set(top.id, top);
    const h9d = c('9', 'D', 'h9d');
    const h9h = c('9', 'H', 'h9h');
    for (const card of [h9d, h9h]) {
      state.players[0]!.hand.push(card);
      state.cardRegistry.set(card.id, card);
    }

    const { taken } = applyDrawFromPile(state, 'p1', 'top9');

    expect(taken).toHaveLength(1);
    expect(state.drewFromDiscardId).toBe('top9');
    expect(state.variantState.mustMeldCardId).toBeNull();
  });
});

// NS8 (T-NS8-2 / p3-6): golden tests for the 500 Rummy `setsRequireDistinctSuits`
// (rules.md A.4.3 [PG-5]) and `acesAlways15`/`low5Scoring` (rules.md A.4.2) house
// rules. Appended import: the p3-5 import block above only pulled in the action
// helpers it needed; these tests also exercise applyLayoff/canUseSelectedInMeldOrLayoff
// and the rum500Variant scoring entry points directly.
import { applyLayoff, canUseSelectedInMeldOrLayoff, rum500Variant } from '../variants/rum500.js';

// ---- setsRequireDistinctSuits (rules.md A.4.3 [PG-5]) ----

describe('setsRequireDistinctSuits', () => {
  it('canonical: set with duplicate suits (7H7H7D) melds successfully', () => {
    const state = twoPlayerGame();
    const d1 = c('7', 'H', 'd1');
    const d2 = c('7', 'H', 'd2');
    const d3 = c('7', 'D', 'd3');
    const spare = c('4', 'C', 'spare');
    state.players[0]!.hand = [d1, d2, d3, spare];
    for (const card of [d1, d2, d3, spare]) state.cardRegistry.set(card.id, card);
    state.phase = 'meld';

    expect(() => applyMeld(state, 'p1', ['d1', 'd2', 'd3'])).not.toThrow();
  });

  it('{ setsRequireDistinctSuits: true }: duplicate-suit set rejected; all-distinct-suit set succeeds', () => {
    const state = twoPlayerGame({ setsRequireDistinctSuits: true });
    const d1 = c('7', 'H', 'd1');
    const d2 = c('7', 'H', 'd2');
    const d3 = c('7', 'D', 'd3');
    const spare = c('4', 'C', 'spare');
    state.players[0]!.hand = [d1, d2, d3, spare];
    for (const card of [d1, d2, d3, spare]) state.cardRegistry.set(card.id, card);
    state.phase = 'meld';

    expect(() => applyMeld(state, 'p1', ['d1', 'd2', 'd3'])).toThrow('ERR_INVALID_MELD');

    const d4 = c('7', 'S', 'd4');
    state.players[0]!.hand.push(d4);
    state.cardRegistry.set(d4.id, d4);

    expect(() => applyMeld(state, 'p1', ['d1', 'd3', 'd4'])).not.toThrow();
  });

  it('layoff: flag rejects a duplicate-suit card onto an existing distinct-suit set; canonical accepts it', () => {
    const s1 = c('7', 'H', 's1');
    const s2 = c('7', 'D', 's2');
    const s3 = c('7', 'S', 's3');

    const flagState = twoPlayerGame({ setsRequireDistinctSuits: true });
    for (const card of [s1, s2, s3]) flagState.cardRegistry.set(card.id, card);
    flagState.players[0]!.melds.push({ id: 'mSet', kind: 'set', cardIds: ['s1', 's2', 's3'], ownerId: 'p1' });
    for (const card of [s1, s2, s3]) flagState.meldedBy.set(card.id, 'p1');
    const dup = c('7', 'H', 'dup');
    const spare = c('4', 'C', 'spare2');
    flagState.players[0]!.hand = [dup, spare];
    for (const card of [dup, spare]) flagState.cardRegistry.set(card.id, card);
    flagState.phase = 'meld';

    expect(() => applyLayoff(flagState, 'p1', 'mSet', 'dup')).toThrow(/^ERR_INVALID_LAYOFF/);

    const canonState = twoPlayerGame();
    for (const card of [s1, s2, s3]) canonState.cardRegistry.set(card.id, card);
    canonState.players[0]!.melds.push({ id: 'mSet', kind: 'set', cardIds: ['s1', 's2', 's3'], ownerId: 'p1' });
    for (const card of [s1, s2, s3]) canonState.meldedBy.set(card.id, 'p1');
    const dup2 = c('7', 'H', 'dup2');
    const spare2 = c('4', 'C', 'spare3');
    canonState.players[0]!.hand = [dup2, spare2];
    for (const card of [dup2, spare2]) canonState.cardRegistry.set(card.id, card);
    canonState.phase = 'meld';

    expect(() => applyLayoff(canonState, 'p1', 'mSet', 'dup2')).not.toThrow();
  });

  it('preflight (canUseSelectedInMeldOrLayoff): flag requires 2 suits distinct from selected; canonical only needs 2 same-rank cards', () => {
    const q1 = c('7', 'H', 'q1');
    const q2 = c('7', 'H', 'q2');
    const q3 = c('7', 'D', 'q3');

    const flagState = twoPlayerGame({ setsRequireDistinctSuits: true });
    expect(canUseSelectedInMeldOrLayoff(flagState, [q1, q2, q3], q1)).toBe(false);

    const canonState = twoPlayerGame();
    expect(canUseSelectedInMeldOrLayoff(canonState, [q1, q2, q3], q1)).toBe(true);
  });
});

// ---- acesAlways15 / low5Scoring (rules.md A.4.2) ----

// Rigs the A♥2♥3♥ run directly onto p1's melds (context pattern — bypasses turn-driven
// applyMeld so scoring can be tested against a fixed, known meld).
function placeAce123Run(state: ReturnType<typeof twoPlayerGame>): void {
  const run = [c('A', 'H', 'a1'), c('2', 'H', 'a2'), c('3', 'H', 'a3')];
  run.forEach((card) => state.cardRegistry.set(card.id, card));
  state.players[0]!.melds.push({ id: 'mRun', kind: 'run', cardIds: ['a1', 'a2', 'a3'], ownerId: 'p1' });
  run.forEach((card) => state.meldedBy.set(card.id, 'p1'));
}

describe('acesAlways15 / low5Scoring scoring', () => {
  it('canonical: A-2-3 run credits ace=1 (net -3)', () => {
    const state = twoPlayerGame();
    placeAce123Run(state);
    const h1 = c('9', 'S', 'h1');
    state.players[0]!.hand = [h1];
    state.cardRegistry.set(h1.id, h1);
    state.players[1]!.hand = [];

    expect(rum500Variant.scoreHand(state).get('p1')).toBe(-3);
  });

  it('{ acesAlways15: true }: A-2-3 ace credits 15 (net 11)', () => {
    const state = twoPlayerGame({ acesAlways15: true });
    placeAce123Run(state);
    const h1 = c('9', 'S', 'h1');
    state.players[0]!.hand = [h1];
    state.cardRegistry.set(h1.id, h1);
    state.players[1]!.hand = [];

    expect(rum500Variant.scoreHand(state).get('p1')).toBe(11);
  });

  it('{ low5Scoring: true }: A-2-3 run all credit 5, hand 9 scores 5 (net 10)', () => {
    const state = twoPlayerGame({ low5Scoring: true });
    placeAce123Run(state);
    const h1 = c('9', 'S', 'h1');
    state.players[0]!.hand = [h1];
    state.cardRegistry.set(h1.id, h1);
    state.players[1]!.hand = [];

    expect(rum500Variant.scoreHand(state).get('p1')).toBe(10);
  });

  it('{ acesAlways15: true, low5Scoring: true }: acesAlways15 governs the ace (D2 precedence, net 20)', () => {
    const state = twoPlayerGame({ acesAlways15: true, low5Scoring: true });
    placeAce123Run(state);
    const h1 = c('9', 'S', 'h1');
    state.players[0]!.hand = [h1];
    state.cardRegistry.set(h1.id, h1);
    state.players[1]!.hand = [];

    expect(rum500Variant.scoreHand(state).get('p1')).toBe(20);
  });

  it('{ low5Scoring: true }: hand ace stays 15 (only the A-2-3 meld ace is scoped to 5)', () => {
    const state = twoPlayerGame({ low5Scoring: true });
    const ha = c('A', 'D', 'ha');
    state.players[0]!.hand = [ha];
    state.cardRegistry.set(ha.id, ha);
    state.players[1]!.hand = [];

    expect(rum500Variant.scoreHand(state).get('p1')).toBe(-15);
  });

  it('handEndPayload: low5Scoring scores handDeadwood at 5 and the A-2-3 ace meld credit at 5', () => {
    const state = twoPlayerGame({ low5Scoring: true });
    placeAce123Run(state);
    const h1 = c('9', 'S', 'h1');
    state.players[0]!.hand = [h1];
    state.cardRegistry.set(h1.id, h1);
    state.players[1]!.hand = [];

    const payload = rum500Variant.handEndPayload(state, new Map());
    expect(payload.handDeadwood['p1']).toBe(5);
    const acePts = payload.meldCredits['p1']!.find((mc) => mc.card.id === 'a1')!.pts;
    expect(acePts).toBe(5);
  });
});
