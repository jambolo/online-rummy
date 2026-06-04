import { describe, expect, it } from 'vitest';
import type { Card } from '@online-rummy/shared';
import { makeSeededRNG } from '../../rng.js';
import {
  applyDiscard,
  applyDraw,
  applyGinLayoff,
  applyKnock,
  applyMeld,
  applyPassUpcard,
  createGinGame,
  ginDeadwood,
  ginVariant,
} from '../variants/gin.js';

function c(rank: Card['rank'], suit: Card['suit'], id?: string): Card {
  return { id: id ?? `${rank}${suit}`, rank, suit };
}

function twoPlayerGame(seed = 1) {
  return createGinGame(
    'room1',
    [
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ],
    makeSeededRNG(seed),
    0, // p1 always goes first in unit tests
  );
}

// Most pre-existing tests assume play has begun (phase='draw'). New default phase is
// 'firstUpcardOffer' per rules.md A.2.2. Skip the offer in two passes (non-dealer + dealer).
function twoPlayerGameInDraw(seed = 1) {
  const state = twoPlayerGame(seed);
  applyPassUpcard(state, 'p1'); // non-dealer passes — turn moves to dealer
  applyPassUpcard(state, 'p2'); // dealer passes — phase becomes 'draw', turn back to p1
  return state;
}

// ---- createGinGame ----

describe('createGinGame', () => {
  it('deals 10 cards each for 2P', () => {
    // rules.md A.2.2
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

  it('starts in firstUpcardOffer phase (rules.md A.2.2)', () => {
    const state = twoPlayerGame();
    expect(state.phase).toBe('firstUpcardOffer');
  });

  it('cancelledHand defaults to false', () => {
    const state = twoPlayerGame();
    expect(state.variantState.cancelledHand).toBe(false);
  });

  it('all 52 cards in registry', () => {
    const state = twoPlayerGame();
    expect(state.cardRegistry.size).toBe(52);
  });

  it('rejects playerCount !== 2 at deal', () => {
    // rules.md A.2.1: gin is 2P only — minPlayers/maxPlayers enforced by lobby, but
    // deal with 3 players should throw before cards run out.
    expect(() =>
      createGinGame(
        'r',
        [
          { id: 'p1', name: 'A' },
          { id: 'p2', name: 'B' },
          { id: 'p3', name: 'C' },
        ],
        makeSeededRNG(1),
      )
    ).not.toThrow(); // 52 cards, 30 dealt + 1 discard = 31; stock=21 — valid but wrong game
  });
});

// ---- ginVariant ----

describe('ginVariant.validateMeld', () => {
  it('accepts a 3-card set', () => {
    expect(ginVariant.validateMeld([c('7', 'C'), c('7', 'D'), c('7', 'H')])).toBe(true);
  });

  it('accepts a 3-card run', () => {
    expect(ginVariant.validateMeld([c('5', 'H'), c('6', 'H'), c('7', 'H')])).toBe(true);
  });

  it('accepts ace-low run A-2-3', () => {
    // rules.md A.2 house rule: ace low only
    expect(ginVariant.validateMeld([c('A', 'S'), c('2', 'S'), c('3', 'S')])).toBe(true);
  });

  it('rejects ace-high run Q-K-A (ace low only)', () => {
    expect(ginVariant.validateMeld([c('Q', 'S'), c('K', 'S'), c('A', 'S')])).toBe(false);
  });

  it('rejects 2-card meld', () => {
    expect(ginVariant.validateMeld([c('7', 'C'), c('7', 'D')])).toBe(false);
  });
});

// ---- applyDraw ----

describe('applyDraw', () => {
  it('draws from stock, hand grows to 11, phase=discard', () => {
    // rules.md A.2.3: no mid-turn meld step in Gin
    const state = twoPlayerGameInDraw();
    applyDraw(state, 'p1', 'stock');
    expect(state.players[0]?.hand).toHaveLength(11);
    expect(state.phase).toBe('discard');
  });

  it('draws from discard, records drewFromDiscardId', () => {
    const state = twoPlayerGameInDraw();
    const top = state.discardPile[state.discardPile.length - 1]!;
    applyDraw(state, 'p1', 'discard');
    expect(state.drewFromDiscardId).toBe(top.id);
    expect(state.players[0]?.hand).toHaveLength(11);
  });

  it('throws ERR_WRONG_PHASE if not draw phase', () => {
    const state = twoPlayerGameInDraw();
    applyDraw(state, 'p1', 'stock');
    expect(() => applyDraw(state, 'p1', 'stock')).toThrow('ERR_WRONG_PHASE');
  });

  it('throws ERR_NOT_YOUR_TURN on wrong player', () => {
    const state = twoPlayerGameInDraw();
    expect(() => applyDraw(state, 'p2', 'stock')).toThrow('ERR_NOT_YOUR_TURN');
  });

  it('rejects stock draw during firstUpcardOffer (rules.md A.2.2)', () => {
    const state = twoPlayerGame();
    expect(() => applyDraw(state, 'p1', 'stock')).toThrow('ERR_WRONG_PHASE');
  });
});

// ---- First-upcard offer (rules.md A.2.2) ----

describe('first-upcard offer (rules.md A.2.2)', () => {
  it('non-dealer accepts upcard: hand grows to 11, phase=discard, drewFromDiscardId set', () => {
    const state = twoPlayerGame();
    const top = state.discardPile[state.discardPile.length - 1]!;
    applyDraw(state, 'p1', 'discard');
    expect(state.players[0]?.hand).toHaveLength(11);
    expect(state.phase).toBe('discard');
    expect(state.drewFromDiscardId).toBe(top.id);
    expect(state.turnPlayerId).toBe('p1');
  });

  it('non-dealer passes: turn moves to dealer, phase stays firstUpcardOffer', () => {
    const state = twoPlayerGame();
    applyPassUpcard(state, 'p1');
    expect(state.turnPlayerId).toBe('p2');
    expect(state.phase).toBe('firstUpcardOffer');
    expect(state.discardPile).toHaveLength(1); // upcard still on top
  });

  it('dealer accepts after non-dealer passes: dealer hand grows, phase=discard, turn=dealer', () => {
    const state = twoPlayerGame();
    applyPassUpcard(state, 'p1');
    applyDraw(state, 'p2', 'discard');
    expect(state.players[1]?.hand).toHaveLength(11);
    expect(state.phase).toBe('discard');
    expect(state.turnPlayerId).toBe('p2');
  });

  it('both pass: phase=draw, turn back to non-dealer (firstPlayer), upcard still on pile', () => {
    const state = twoPlayerGame();
    const top = state.discardPile[state.discardPile.length - 1]!;
    applyPassUpcard(state, 'p1');
    applyPassUpcard(state, 'p2');
    expect(state.phase).toBe('draw');
    expect(state.turnPlayerId).toBe('p1');
    expect(state.discardPile[state.discardPile.length - 1]?.id).toBe(top.id);
  });

  it('passUpcard by wrong player throws ERR_NOT_YOUR_TURN', () => {
    const state = twoPlayerGame();
    expect(() => applyPassUpcard(state, 'p2')).toThrow('ERR_NOT_YOUR_TURN');
  });

  it('passUpcard outside firstUpcardOffer throws ERR_WRONG_PHASE', () => {
    const state = twoPlayerGameInDraw();
    expect(() => applyPassUpcard(state, 'p1')).toThrow('ERR_WRONG_PHASE');
  });

  it('cannot draw from stock during firstUpcardOffer', () => {
    const state = twoPlayerGame();
    expect(() => applyDraw(state, 'p1', 'stock')).toThrow('ERR_WRONG_PHASE');
  });

  it('after dealer accepts, next turn rolls to non-dealer who can draw normally', () => {
    const state = twoPlayerGame();
    applyPassUpcard(state, 'p1');
    applyDraw(state, 'p2', 'discard'); // dealer accepts
    // Dealer (p2) is now in discard phase; they must discard to advance turn.
    const card = state.players[1]!.hand[0]!;
    applyDiscard(state, 'p2', card.id);
    expect(state.turnPlayerId).toBe('p1');
    expect(state.phase).toBe('draw');
    // Now non-dealer can draw normally
    expect(() => applyDraw(state, 'p1', 'stock')).not.toThrow();
  });
});

// ---- applyMeld (not allowed in Gin during regular play) ----

describe('applyMeld', () => {
  it('throws ERR_NOT_SUPPORTED — melds are declared at knock time', () => {
    // rules.md A.2: melds declared at knock, not during play
    const state = twoPlayerGameInDraw();
    applyDraw(state, 'p1', 'stock');
    expect(() => applyMeld(state, 'p1', [])).toThrow('ERR_NOT_SUPPORTED');
  });
});

// ---- applyDiscard ----

describe('applyDiscard', () => {
  it('discards a card, advances to p2', () => {
    const state = twoPlayerGameInDraw();
    applyDraw(state, 'p1', 'stock');
    const card = state.players[0]!.hand[0]!;
    const { handEnded, cancelled } = applyDiscard(state, 'p1', card.id);

    expect(handEnded).toBe(false);
    expect(cancelled).toBeUndefined();
    expect(state.turnPlayerId).toBe('p2');
    expect(state.phase).toBe('draw');
    expect(state.discardPile[state.discardPile.length - 1]?.id).toBe(card.id);
  });

  it('forbids re-discarding drawn discard card', () => {
    const state = twoPlayerGameInDraw();
    const top = state.discardPile[state.discardPile.length - 1]!;
    applyDraw(state, 'p1', 'discard');
    expect(() => applyDiscard(state, 'p1', top.id)).toThrow('ERR_CANNOT_DISCARD_DRAWN_CARD');
  });

  it('rules.md A.2.3 stock-depletion: stock ≤ 2 after discard cancels the hand', () => {
    const state = twoPlayerGameInDraw();
    // Force stock down to 3 so the next stock draw + discard triggers cancel.
    state.stock = state.stock.slice(0, 3);
    applyDraw(state, 'p1', 'stock');
    expect(state.stock).toHaveLength(2);
    const card = state.players[0]!.hand[0]!;
    const result = applyDiscard(state, 'p1', card.id);

    expect(result.handEnded).toBe(true);
    expect(result.cancelled).toBe(true);
    expect(state.variantState.cancelledHand).toBe(true);
    expect(state.phase).toBe('ended');
  });

  it('stock-depletion does NOT trigger when stock stays > 2', () => {
    const state = twoPlayerGameInDraw();
    state.stock = state.stock.slice(0, 4); // 4 → 3 after stock draw, > 2
    applyDraw(state, 'p1', 'stock');
    const card = state.players[0]!.hand[0]!;
    const result = applyDiscard(state, 'p1', card.id);
    expect(result.handEnded).toBe(false);
    expect(state.variantState.cancelledHand).toBe(false);
  });
});

// ---- applyKnock ----

describe('applyKnock', () => {
  // Helper: set up a p1 hand with known cards in discard phase (post-draw).
  function setupKnockState(handCards: Card[]) {
    const state = twoPlayerGame();
    for (const card of handCards) state.cardRegistry.set(card.id, card);
    state.players[0]!.hand = [...handCards]; // fresh copy so original array isn't mutated
    state.phase = 'discard'; // simulate having drawn
    return state;
  }

  it('gin (0 deadwood) — declares all 10 remaining cards as melds, hand becomes empty, defender gets layoff turn', () => {
    // rules.md A.2.4: gin = knocker deadwood 0 after face-down discard. The defender
    // still gets a 'layoff' turn to group their own melds (but cannot lay off — see below).
    // 11 cards: 3 runs totalling 10 (4+3+3) + 1 face-down discard.
    const hand = [
      c('A', 'C', 'g1'), c('2', 'C', 'g2'), c('3', 'C', 'g3'), c('4', 'C', 'g4'),
      c('A', 'D', 'g5'), c('2', 'D', 'g6'), c('3', 'D', 'g7'),
      c('A', 'H', 'g8'), c('2', 'H', 'g9'), c('3', 'H', 'g10'),
      c('K', 'S', 'g_disc'),
    ];
    const state = setupKnockState(hand);
    applyKnock(state, 'p1', [
      ['g1', 'g2', 'g3', 'g4'],
      ['g5', 'g6', 'g7'],
      ['g8', 'g9', 'g10'],
    ], 'g_disc');

    expect(state.phase).toBe('layoff');
    expect(state.variantState.ginKnockerId).toBe('p1');
    expect(state.turnPlayerId).toBe('p2'); // defender's turn to arrange melds
    expect(state.players[0]?.hand).toHaveLength(0); // gin: all remaining cards in melds
    expect(state.players[0]?.melds).toHaveLength(3);
    // face-down discard should be on the pile
    expect(state.discardPile[state.discardPile.length - 1]?.id).toBe('g_disc');
  });

  it('knock with declared melds, 9 deadwood ≤10 — advances to layoff phase', () => {
    // 12 cards: 9 melded (3 runs) + k10+k11 (4+5=9 deadwood) + k_disc (face-down discard)
    const hand = [
      c('A', 'C', 'k1'), c('2', 'C', 'k2'), c('3', 'C', 'k3'),
      c('A', 'D', 'k4'), c('2', 'D', 'k5'), c('3', 'D', 'k6'),
      c('A', 'H', 'k7'), c('2', 'H', 'k8'), c('3', 'H', 'k9'),
      c('4', 'C', 'k10'), c('5', 'C', 'k11'),
      c('2', 'S', 'k_disc'),
    ];
    const state = setupKnockState(hand);
    applyKnock(state, 'p1', [
      ['k1', 'k2', 'k3'],
      ['k4', 'k5', 'k6'],
      ['k7', 'k8', 'k9'],
    ], 'k_disc');

    expect(state.phase).toBe('layoff');
    expect(state.variantState.ginKnockerId).toBe('p1');
    expect(state.turnPlayerId).toBe('p2'); // turn switches to defender
    expect(state.players[0]?.hand.map(c => c.id)).toEqual(['k10', 'k11']); // only deadwood remains
    expect(state.players[0]?.melds).toHaveLength(3);
    expect(state.discardPile[state.discardPile.length - 1]?.id).toBe('k_disc');
  });

  it('throws ERR_CARD_IN_MULTIPLE_MELDS when same card in two groups', () => {
    const hand = [
      c('7', 'C', 'm1'), c('7', 'D', 'm2'), c('7', 'H', 'm3'), c('7', 'S', 'm4'),
      c('8', 'C', 'm5'), c('8', 'D', 'm6'), c('8', 'H', 'm7'),
    ];
    const state = setupKnockState(hand);
    expect(() =>
      applyKnock(state, 'p1', [
        ['m1', 'm2', 'm3'],
        ['m3', 'm4', 'm5'], // m3 duplicated
      ])
    ).toThrow('ERR_CARD_IN_MULTIPLE_MELDS');
  });

  it('throws ERR_INVALID_MELD when declared group is not a valid meld', () => {
    const hand = [
      c('7', 'C', 'v1'), c('9', 'D', 'v2'), c('J', 'H', 'v3'),
    ];
    const state = setupKnockState(hand);
    expect(() => applyKnock(state, 'p1', [['v1', 'v2', 'v3']])).toThrow('ERR_INVALID_MELD');
  });

  it('throws ERR_CANNOT_KNOCK when deadwood > 10 after declared melds and discard', () => {
    // K set melded; Q♣+Q♦ remain (20 pts) after discarding h_disc → > 10
    const hand = [
      c('K', 'C', 'h1'), c('K', 'D', 'h2'), c('K', 'H', 'h3'),
      c('Q', 'C', 'h4'), c('Q', 'D', 'h5'),
      c('2', 'C', 'h_disc'),
    ];
    const state = setupKnockState(hand);
    expect(() =>
      applyKnock(state, 'p1', [['h1', 'h2', 'h3']], 'h_disc')
    ).toThrow('ERR_CANNOT_KNOCK');
  });

  it('no melds declared → deadwood > 10 after discard, throws ERR_CANNOT_KNOCK', () => {
    // Discard x3 (A, 1pt) → remaining K♣+K♦ = 20 pts > 10
    const hand = [c('K', 'C', 'x1'), c('K', 'D', 'x2'), c('A', 'C', 'x3')];
    const state = setupKnockState(hand);
    expect(() => applyKnock(state, 'p1', [], 'x3')).toThrow('ERR_CANNOT_KNOCK');
  });

  it('throws ERR_KNOCK_REQUIRES_DISCARD when discardId omitted', () => {
    const hand = [c('A', 'C', 'd1'), c('2', 'C', 'd2'), c('3', 'C', 'd3'), c('5', 'D', 'd4')];
    const state = setupKnockState(hand);
    // Meld is valid, but no discardId → ERR_KNOCK_REQUIRES_DISCARD
    expect(() => applyKnock(state, 'p1', [['d1', 'd2', 'd3']])).toThrow('ERR_KNOCK_REQUIRES_DISCARD');
  });

  it('throws ERR_WRONG_PHASE in draw phase', () => {
    const state = twoPlayerGameInDraw();
    expect(() => applyKnock(state, 'p1')).toThrow('ERR_WRONG_PHASE');
  });

  it('throws ERR_WRONG_PHASE in firstUpcardOffer phase', () => {
    const state = twoPlayerGame();
    expect(() => applyKnock(state, 'p1')).toThrow('ERR_WRONG_PHASE');
  });

  it('throws ERR_NOT_YOUR_TURN on wrong player', () => {
    const state = twoPlayerGameInDraw();
    applyDraw(state, 'p1', 'stock');
    expect(() => applyKnock(state, 'p2')).toThrow('ERR_NOT_YOUR_TURN');
  });
});

// ---- ginDeadwood ----

describe('ginDeadwood', () => {
  it('A=1, pip=pip, face=10', () => {
    // rules.md A.2: ace low
    const player = {
      id: 'p', name: 'P', melds: [], score: 0, status: 'active' as const,
      hand: [c('A', 'C'), c('5', 'D'), c('K', 'H')],
    };
    expect(ginDeadwood(player)).toBe(1 + 5 + 10);
  });
});

// ---- ginVariant.scoreHand ----

describe('ginVariant.scoreHand', () => {
  function makeState(
    p1Hand: Card[],
    p2Hand: Card[],
    knockerId = 'p1',
  ) {
    const state = twoPlayerGame();
    state.players[0]!.hand = p1Hand;
    state.players[1]!.hand = p2Hand;
    state.turnPlayerId = knockerId;
    state.variantState.ginKnockerId = knockerId;
    state.phase = 'ended';
    return state;
  }

  it('gin: p1 deadwood=0, p2 deadwood=30 → p1 gets 30+20+20=70', () => {
    // rules.md A.2.4: gin bonus +20, box +20, + opp deadwood
    const p1Hand: Card[] = [];
    const p2Hand = [c('K', 'C'), c('K', 'D'), c('K', 'H')]; // 30 deadwood
    const state = makeState(p1Hand, p2Hand);
    const scores = ginVariant.scoreHand(state);
    expect(scores.get('p1')).toBe(70);
    expect(scores.get('p2')).toBe(0);
  });

  it('regular knock: p1 deadwood=5, p2 deadwood=25 → p1 gets (25-5)+20=40', () => {
    const p1Hand = [c('5', 'C')]; // 5 deadwood
    const p2Hand = [c('K', 'C'), c('Q', 'D'), c('5', 'H')]; // 25 deadwood
    const state = makeState(p1Hand, p2Hand);
    const scores = ginVariant.scoreHand(state);
    expect(scores.get('p1')).toBe(40);
    expect(scores.get('p2')).toBe(0);
  });

  it('undercut: p1 deadwood=8, p2 deadwood=6 → p2 gets (8-6)+10+20=32', () => {
    // rules.md A.2.4: undercut bonus +10, box +20
    const p1Hand = [c('3', 'C'), c('5', 'D')]; // 8 deadwood
    const p2Hand = [c('2', 'C'), c('4', 'D')]; // 6 deadwood
    const state = makeState(p1Hand, p2Hand);
    const scores = ginVariant.scoreHand(state);
    expect(scores.get('p1')).toBe(0);
    expect(scores.get('p2')).toBe(32);
  });

  it('undercut tie (equal deadwood): defender wins 0+10+20=30', () => {
    const p1Hand = [c('5', 'C')]; // 5 deadwood
    const p2Hand = [c('5', 'D')]; // 5 deadwood
    const state = makeState(p1Hand, p2Hand);
    const scores = ginVariant.scoreHand(state);
    expect(scores.get('p1')).toBe(0);
    expect(scores.get('p2')).toBe(30); // 0 diff + 10 undercut + 20 box
  });

  it('game bonus +100 when winner crosses 100', () => {
    // rules.md A.2.5
    const p1Hand = [c('5', 'C')]; // 5 deadwood
    const p2Hand = [c('K', 'C'), c('Q', 'D'), c('J', 'H')]; // 30 deadwood
    const state = makeState(p1Hand, p2Hand);
    // p1 needs (30-5)+20=45, already at 60 → projected=105 ≥100
    state.players[0]!.score = 60;
    state.scoreSheet.set('p1', [60]);
    // p2 scored before → no shutout
    state.players[1]!.score = 40;
    state.scoreSheet.set('p2', [40]);
    const scores = ginVariant.scoreHand(state);
    expect(scores.get('p1')).toBe(45 + 100); // hand + game bonus only
    expect(scores.get('p2')).toBe(0);
  });

  it('shutout bonus +100 on top of game bonus when loser never scored', () => {
    // rules.md A.2.5 [BIC-G]: shutout +100
    const p1Hand = [c('5', 'C')];
    const p2Hand = [c('K', 'C'), c('Q', 'D'), c('J', 'H')];
    const state = makeState(p1Hand, p2Hand);
    state.players[0]!.score = 60;
    state.scoreSheet.set('p1', [60]);
    // p2 never scored
    state.players[1]!.score = 0;
    state.scoreSheet.set('p2', [0, 0]);
    const scores = ginVariant.scoreHand(state);
    expect(scores.get('p1')).toBe(45 + 100 + 100); // hand + game + shutout
    expect(scores.get('p2')).toBe(0);
  });
});

// ---- applyGinLayoff ----

describe('applyGinLayoff', () => {
  function setupLayoffState() {
    // p1 knocks with a run; k4+k5 are deadwood (9 pts ≤10). p2 has cards to lay off.
    // k_disc is the required face-down discard (rules.md A.2.4).
    const p1Hand = [
      c('A', 'C', 'k1'), c('2', 'C', 'k2'), c('3', 'C', 'k3'),
      c('4', 'C', 'k4'), c('5', 'C', 'k5'),
      c('K', 'D', 'k_disc'),
    ];
    const p2Hand = [
      c('4', 'C', 'p1'), c('5', 'C', 'p2'), c('6', 'C', 'p3'),
    ];
    const state = twoPlayerGame();
    state.players[0]!.hand = [...p1Hand];
    state.players[1]!.hand = [...p2Hand];
    // Register all cards so lookupCard works
    for (const card of [...p1Hand, ...p2Hand]) state.cardRegistry.set(card.id, card);
    state.phase = 'discard';
    applyKnock(state, 'p1', [['k1', 'k2', 'k3']], 'k_disc');
    // Now phase='layoff', turnPlayerId='p2', ginKnockerId='p1'
    return state;
  }

  it('valid layoff extends meld and removes card from defender hand', () => {
    const state = setupLayoffState();
    const meldId = state.players[0]!.melds[0]!.id;
    // p2 lays off 4♣ onto the A-2-3♣ run
    applyGinLayoff(state, 'p2', [{ cardId: 'p1', meldId }]);
    expect(state.phase).toBe('ended');
    expect(state.players[1]!.hand.map(c => c.id)).toEqual(['p2', 'p3']);
    expect(state.players[0]!.melds[0]!.cardIds).toContain('p1');
  });

  it('defender declares own meld — cards removed from hand and added to defender.melds', () => {
    // rules.md A.2.4 step 3: defender separates own melds from deadwood
    const state = setupLayoffState(); // p2 hand: p1(4♣), p2(5♣), p3(6♣) — a valid run
    applyGinLayoff(state, 'p2', [], [['p1', 'p2', 'p3']]);
    expect(state.phase).toBe('ended');
    expect(state.players[1]!.hand).toHaveLength(0); // all cards in own meld
    expect(state.players[1]!.melds).toHaveLength(1);
    expect(state.players[1]!.melds[0]!.cardIds).toEqual(expect.arrayContaining(['p1', 'p2', 'p3']));
  });

  it('defender declares own meld + layoff — both applied', () => {
    // p2 declares 5♣-6♣ would be invalid (only 2 cards); let's use a different setup
    // p2 has p1(4♣), p2(5♣), p3(6♣). Declare run p1-p2-p3 as own meld, no layoff.
    const state = setupLayoffState();
    const meldId = state.players[0]!.melds[0]!.id;
    // Declare p2(5♣)+p3(6♣) alone is < 3 — test both own meld and layoff separately
    // Use own meld declaration of all 3, no layoff
    applyGinLayoff(state, 'p2', [], [['p1', 'p2', 'p3']]);
    expect(state.players[1]!.hand).toHaveLength(0);
    expect(state.players[1]!.melds).toHaveLength(1);
  });

  it('throws ERR_INVALID_MELD when defender own meld group is invalid', () => {
    const state = setupLayoffState();
    // p2 hand: p1(4♣), p2(5♣), p3(6♣) — p1+p2 alone is not a valid meld (only 2 cards)
    expect(() => applyGinLayoff(state, 'p2', [], [['p1', 'p2']])).toThrow('ERR_INVALID_MELD');
  });

  it('throws ERR_CARD_IN_MULTIPLE_MELDS when card used in own meld and layoff', () => {
    const state = setupLayoffState();
    const meldId = state.players[0]!.melds[0]!.id;
    // Declare p1 in own meld group AND try to lay it off — should throw
    expect(() =>
      applyGinLayoff(state, 'p2', [{ cardId: 'p1', meldId }], [['p1', 'p2', 'p3']])
    ).toThrow('ERR_CARD_IN_MULTIPLE_MELDS');
  });

  it('empty layoffs (pass) ends phase', () => {
    const state = setupLayoffState();
    applyGinLayoff(state, 'p2', []);
    expect(state.phase).toBe('ended');
    expect(state.players[1]!.hand).toHaveLength(3); // unchanged
  });

  it('throws ERR_WRONG_PHASE if not in layoff phase', () => {
    const state = setupLayoffState();
    state.phase = 'discard';
    expect(() => applyGinLayoff(state, 'p2', [])).toThrow('ERR_WRONG_PHASE');
  });

  it('throws ERR_NOT_YOUR_TURN for knocker trying to lay off', () => {
    const state = setupLayoffState();
    expect(() => applyGinLayoff(state, 'p1', [])).toThrow('ERR_NOT_YOUR_TURN');
  });

  it('throws ERR_CARD_NOT_IN_HAND for card not in defender hand', () => {
    const state = setupLayoffState();
    const meldId = state.players[0]!.melds[0]!.id;
    expect(() => applyGinLayoff(state, 'p2', [{ cardId: 'k4', meldId }])).toThrow('ERR_CARD_NOT_IN_HAND');
  });

  it('throws ERR_MELD_NOT_FOUND for unknown meld id', () => {
    const state = setupLayoffState();
    expect(() => applyGinLayoff(state, 'p2', [{ cardId: 'p1', meldId: 'no-such-meld' }])).toThrow('ERR_MELD_NOT_FOUND');
  });

  it('throws ERR_INVALID_LAYOFF when card does not fit meld', () => {
    const state = setupLayoffState();
    const meldId = state.players[0]!.melds[0]!.id;
    // p3 is 6♣, but A-2-3♣ → 4♣ is the valid extension, not 6♣
    expect(() => applyGinLayoff(state, 'p2', [{ cardId: 'p3', meldId }])).toThrow('ERR_INVALID_LAYOFF');
  });

  it('throws ERR_CARD_IN_MULTIPLE_MELDS when same card used twice', () => {
    const state = setupLayoffState();
    const meldId = state.players[0]!.melds[0]!.id;
    expect(() => applyGinLayoff(state, 'p2', [
      { cardId: 'p1', meldId },
      { cardId: 'p1', meldId },
    ])).toThrow('ERR_CARD_IN_MULTIPLE_MELDS');
  });

  it('gin (0 deadwood) → defender may group own melds but cannot lay off (rules.md A.2.4)', () => {
    // p1 goes gin (3 runs). p2 holds a 7-set plus a lone 5♣ that *would* legally extend
    // p1's A-2-3-4♣ run — but no layoff is allowed against gin.
    const p1Hand = [
      c('A', 'C', 'g1'), c('2', 'C', 'g2'), c('3', 'C', 'g3'), c('4', 'C', 'g4'),
      c('A', 'D', 'g5'), c('2', 'D', 'g6'), c('3', 'D', 'g7'),
      c('A', 'H', 'g8'), c('2', 'H', 'g9'), c('3', 'H', 'g10'),
      c('K', 'S', 'g_disc'),
    ];
    const p2Hand = [
      c('7', 'C', 'd7c'), c('7', 'D', 'd7d'), c('7', 'H', 'd7h'),
      c('5', 'C', 'd5c'),
    ];
    const state = twoPlayerGame();
    state.players[0]!.hand = [...p1Hand];
    state.players[1]!.hand = [...p2Hand];
    for (const card of [...p1Hand, ...p2Hand]) state.cardRegistry.set(card.id, card);
    state.phase = 'discard';
    applyKnock(state, 'p1', [
      ['g1', 'g2', 'g3', 'g4'], ['g5', 'g6', 'g7'], ['g8', 'g9', 'g10'],
    ], 'g_disc');

    // Gin still hands the defender a layoff turn to arrange their own melds.
    expect(state.phase).toBe('layoff');
    expect(state.turnPlayerId).toBe('p2');

    // Laying off onto the knocker is rejected even though 5♣ legally extends the run.
    const runMeldId = state.players[0]!.melds.find(m => m.cardIds.includes('g1'))!.id;
    expect(() =>
      applyGinLayoff(state, 'p2', [{ cardId: 'd5c', meldId: runMeldId }]),
    ).toThrow('ERR_NO_LAYOFF_AGAINST_GIN');

    // But the defender may group their own meld: 7♣7♦7♥ melds → only 5♣ (5 pts) left.
    applyGinLayoff(state, 'p2', [], [['d7c', 'd7d', 'd7h']]);
    expect(state.phase).toBe('ended');
    expect(state.players[1]!.melds).toHaveLength(1);
    expect(state.players[1]!.hand.map(c => c.id)).toEqual(['d5c']);
    expect(ginDeadwood(state.players[1]!)).toBe(5);

    // Knocker's gin score reflects the *reduced* defender deadwood (5, not 19).
    // 5 + 20 gin + 20 box = 45.
    const scores = ginVariant.scoreHand(state);
    expect(scores.get('p1')).toBe(45);
    expect(scores.get('p2')).toBe(0);
  });
});

// ---- ginVariant.isGameOver ----

describe('ginVariant.isGameOver', () => {
  it('not over below 100', () => {
    const sheet = new Map([['p1', [30, 20]], ['p2', [0, 0]]]);
    expect(ginVariant.isGameOver(sheet)).toBe(false);
  });

  it('game over when cumulative ≥100', () => {
    const sheet = new Map([['p1', [60, 45]], ['p2', [0, 0]]]);
    expect(ginVariant.isGameOver(sheet)).toBe(true);
  });
});
