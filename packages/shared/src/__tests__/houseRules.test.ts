import { describe, it, expect } from 'vitest';
import type { Variant } from '../cards.js';
import { HOUSE_RULE_DEFS, canonicalHouseRules, isDeviation, supportedDefs, type HouseRuleId } from '../houseRules.js';

describe('HOUSE_RULE_DEFS', () => {
  it('lists the v1 basic ids in order', () => {
    expect(HOUSE_RULE_DEFS.basic.map((d) => d.id)).toEqual([
      'aceEitherEnd',
      'roundTheCorner',
      'maxOneMeldPerTurn',
      'layoffRequiresPriorMeld',
      'goingRummyFlat10',
    ]);
  });

  it('lists the v1 rum500 ids in order', () => {
    expect(HOUSE_RULE_DEFS.rum500.map((d) => d.id)).toEqual([
      'acesAlways15',
      'low5Scoring',
      'unifiedObligation',
      'setsRequireDistinctSuits',
      'deal10For2P',
      'jokers',
    ]);
  });

  it('gives gin an empty registry in v1', () => {
    expect(HOUSE_RULE_DEFS.gin).toEqual([]);
  });

  it('every def is canonical:false, kind:toggle with non-empty prose; the 10 engine-honored defs are supported and jokers is not', () => {
    const all = [...HOUSE_RULE_DEFS.basic, ...HOUSE_RULE_DEFS.rum500];
    expect(all).toHaveLength(11);
    for (const def of all) {
      expect(def.canonical).toBe(false);
      expect(def.kind).toBe('toggle');
      expect(def.supported).toBe(def.id !== 'jokers');
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
      expect(def.rulesRef.length).toBeGreaterThan(0);
    }
  });

  it('maps each id to its rules.md section', () => {
    const ref = (v: Variant, id: HouseRuleId): string | undefined => HOUSE_RULE_DEFS[v].find((d) => d.id === id)?.rulesRef;
    expect(ref('basic', 'aceEitherEnd')).toBe('A.1.4');
    expect(ref('basic', 'roundTheCorner')).toBe('A.1.4');
    expect(ref('basic', 'maxOneMeldPerTurn')).toBe('A.1.6');
    expect(ref('basic', 'layoffRequiresPriorMeld')).toBe('A.1.6');
    expect(ref('basic', 'goingRummyFlat10')).toBe('A.1.7');
    expect(ref('rum500', 'acesAlways15')).toBe('A.4.2');
    expect(ref('rum500', 'low5Scoring')).toBe('A.4.2');
    expect(ref('rum500', 'unifiedObligation')).toBe('A.4.4');
    expect(ref('rum500', 'setsRequireDistinctSuits')).toBe('A.4.3');
    expect(ref('rum500', 'deal10For2P')).toBe('A.4.1');
    expect(ref('rum500', 'jokers')).toBe('A.4.5');
  });

  it('discloses the Ace-either-end implication in the roundTheCorner description', () => {
    const rtc = HOUSE_RULE_DEFS.basic.find((d) => d.id === 'roundTheCorner');
    expect(rtc?.description.toLowerCase()).toContain('ace either end');
  });

  it('uses no "variant" wording in any label or description', () => {
    const all = [...HOUSE_RULE_DEFS.basic, ...HOUSE_RULE_DEFS.rum500];
    for (const def of all) {
      expect(def.label.toLowerCase()).not.toContain('variant');
      expect(def.description.toLowerCase()).not.toContain('variant');
    }
  });
});

describe('canonicalHouseRules', () => {
  it('maps every basic id to its canonical value', () => {
    expect(canonicalHouseRules('basic')).toEqual({
      aceEitherEnd: false,
      roundTheCorner: false,
      maxOneMeldPerTurn: false,
      layoffRequiresPriorMeld: false,
      goingRummyFlat10: false,
    });
  });

  it('maps every rum500 id to its canonical value', () => {
    expect(canonicalHouseRules('rum500')).toEqual({
      acesAlways15: false,
      low5Scoring: false,
      unifiedObligation: false,
      setsRequireDistinctSuits: false,
      deal10For2P: false,
      jokers: false,
    });
  });

  it('returns an empty object for gin', () => {
    expect(canonicalHouseRules('gin')).toEqual({});
  });
});

describe('isDeviation', () => {
  it('is false when the value equals canonical', () => {
    expect(isDeviation('basic', 'aceEitherEnd', false)).toBe(false);
  });

  it('is true when the value differs from canonical', () => {
    expect(isDeviation('basic', 'aceEitherEnd', true)).toBe(true);
  });

  it('is false for an id absent from the variation registry', () => {
    expect(isDeviation('gin', 'aceEitherEnd', true)).toBe(false);
  });
});

describe('supportedDefs', () => {
  it('returns the 5 engine-honored basic defs', () => {
    expect(supportedDefs('basic').map((d) => d.id)).toEqual([
      'aceEitherEnd',
      'roundTheCorner',
      'maxOneMeldPerTurn',
      'layoffRequiresPriorMeld',
      'goingRummyFlat10',
    ]);
  });

  it('returns the 5 engine-honored rum500 defs, excluding jokers', () => {
    expect(supportedDefs('rum500').map((d) => d.id)).toEqual([
      'acesAlways15',
      'low5Scoring',
      'unifiedObligation',
      'setsRequireDistinctSuits',
      'deal10For2P',
    ]);
  });

  it('returns empty for gin', () => {
    expect(supportedDefs('gin')).toEqual([]);
  });
});
