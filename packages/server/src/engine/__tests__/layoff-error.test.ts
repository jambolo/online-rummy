import { describe, expect, it } from 'vitest';
import type { Card } from '@online-rummy/shared';
import { formatLayoffError } from '../layoff-error.js';

function c(rank: Card['rank'], suit: Card['suit']): Card {
  return { id: `${rank}${suit}`, rank, suit };
}

describe('formatLayoffError — set', () => {
  it('reports rank mismatch against the set rank', () => {
    const msg = formatLayoffError({ kind: 'set' }, [c('7', 'C'), c('7', 'D')], c('8', 'H'));
    expect(msg).toContain('Set contains 7s');
    expect(msg).toContain("8 doesn't match");
  });

  it('reports a full set when the rank matches', () => {
    const msg = formatLayoffError({ kind: 'set' }, [c('7', 'C'), c('7', 'D'), c('7', 'H'), c('7', 'S')], c('7', 'C'));
    expect(msg).toContain('already full (4 cards)');
  });

  it('falls back to "?" rank when existing cards are empty', () => {
    const msg = formatLayoffError({ kind: 'set' }, [], c('8', 'H'));
    expect(msg).toContain('Set contains ?s');
  });
});

describe('formatLayoffError — run', () => {
  it('reports a suit mismatch with glyphs', () => {
    const msg = formatLayoffError({ kind: 'run' }, [c('5', 'C'), c('6', 'C')], c('7', 'D'));
    expect(msg).toContain('♦'); // incoming suit glyph
    expect(msg).toContain('♣'); // run suit glyph
  });

  it('falls back to "?" run suit (and glyph) when existing cards are empty', () => {
    const msg = formatLayoffError({ kind: 'run' }, [], c('5', 'C'));
    expect(msg).toContain('run suit (?)');
  });

  it('describes the valid ends for a mid-range run (low–high)', () => {
    const msg = formatLayoffError({ kind: 'run' }, [c('5', 'C'), c('6', 'C'), c('7', 'C')], c('9', 'C'));
    expect(msg).toContain('Run is ♣5–7');
    expect(msg).toContain('low end');
    expect(msg).toContain('high end');
  });

  it('uses "the high end" wording when the run starts at ace', () => {
    const msg = formatLayoffError({ kind: 'run' }, [c('A', 'C'), c('2', 'C'), c('3', 'C')], c('9', 'C'));
    expect(msg).toContain('Run is ♣A–3');
    expect(msg).toContain('the high end');
  });

  it('uses "the low end" wording when the run ends at king', () => {
    const msg = formatLayoffError({ kind: 'run' }, [c('J', 'C'), c('Q', 'C'), c('K', 'C')], c('9', 'C'));
    expect(msg).toContain('Run is ♣J–K');
    expect(msg).toContain('the low end');
  });
});
