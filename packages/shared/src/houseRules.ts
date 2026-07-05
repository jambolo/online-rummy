import type { Variant } from './cards.js';

// NS-8 house-rule registry (T-NS8-1). Single source of truth for the configurable
// house rules available per game variation, their canonical defaults, and whether the
// engine currently honors each one (`supported`). UI prose uses "house rule" /
// "game variation" wording; the `Variant` type keeps its code-identifier name.
// rules.md section IDs are recorded per def in `rulesRef`.

export type HouseRuleId =
  | 'aceEitherEnd'
  | 'roundTheCorner'
  | 'maxOneMeldPerTurn'
  | 'layoffRequiresPriorMeld'
  | 'goingRummyFlat10'
  | 'acesAlways15'
  | 'low5Scoring'
  | 'jokers'
  | 'unifiedObligation'
  | 'setsRequireDistinctSuits'
  | 'deal10For2P';

export type HouseRuleValue = boolean | number | string;

export type HouseRules = Partial<Record<HouseRuleId, HouseRuleValue>>;

export type HouseRuleChoice = { value: HouseRuleValue; label: string };

export type HouseRuleDef = {
  id: HouseRuleId;
  label: string;
  description: string;
  canonical: HouseRuleValue;
  kind: 'toggle' | 'choice';
  choices?: HouseRuleChoice[];
  rulesRef: string;
  supported: boolean; // supported=false ⇒ engine does not honor yet ⇒ UI hides it [E9]
};

// v1 registry. supported:true = the engine honors the flag under golden tests [E9].
// jokers is registered but deferred (supported:false — hidden from the UI).
// gin is canonical-only in v1 (empty array).
export const HOUSE_RULE_DEFS: Record<Variant, HouseRuleDef[]> = {
  basic: [
    {
      id: 'aceEitherEnd',
      label: 'Ace either end',
      description: 'Aces may end a run high or low, so both A-2-3 and Q-K-A are valid runs. Unmelded aces then score 15.',
      canonical: false,
      kind: 'toggle',
      rulesRef: 'A.1.4', // rules.md A.1.4
      supported: true,
    },
    {
      id: 'roundTheCorner',
      label: 'Round the corner',
      description:
        'Runs may turn the corner past the ace (K-A-2). Implies Ace either end, so A-2-3, Q-K-A, and K-A-2 are all valid. Unmelded aces then score 15.',
      canonical: false,
      kind: 'toggle',
      rulesRef: 'A.1.4', // rules.md A.1.4
      supported: true,
    },
    {
      id: 'maxOneMeldPerTurn',
      label: 'Maximum one meld per turn',
      description: 'A player may lay down at most one new meld each turn.',
      canonical: false,
      kind: 'toggle',
      rulesRef: 'A.1.6', // rules.md A.1.6
      supported: true,
    },
    {
      id: 'layoffRequiresPriorMeld',
      label: 'Layoff requires a prior meld',
      description: 'A player may lay off onto melds only after having placed at least one meld of their own.',
      canonical: false,
      kind: 'toggle',
      rulesRef: 'A.1.6', // rules.md A.1.6
      supported: true,
    },
    {
      id: 'goingRummyFlat10',
      label: 'Going Rummy flat bonus',
      description: 'Going Rummy scores a flat +10 for the winner instead of doubling the value of each losing hand.',
      canonical: false,
      kind: 'toggle',
      rulesRef: 'A.1.7', // rules.md A.1.7
      supported: true,
    },
  ],
  rum500: [
    {
      id: 'acesAlways15',
      label: 'Aces always score 15',
      description: 'Melded aces score 15 even in an A-2-3 run.',
      canonical: false,
      kind: 'toggle',
      rulesRef: 'A.4.2', // rules.md A.4.2
      supported: true,
    },
    {
      id: 'low5Scoring',
      label: 'Low cards score 5',
      description: 'Number cards 2 through 9 score 5 points; an ace melded in A-2-3 scores 5.',
      canonical: false,
      kind: 'toggle',
      rulesRef: 'A.4.2', // rules.md A.4.2
      supported: true,
    },
    {
      id: 'unifiedObligation',
      label: 'Unified draw obligation',
      description: 'Drawing the single top discard also obliges you to use that card in a meld this turn.',
      canonical: false,
      kind: 'toggle',
      rulesRef: 'A.4.4', // rules.md A.4.4
      supported: true,
    },
    {
      id: 'setsRequireDistinctSuits',
      label: 'Sets require distinct suits',
      description: 'Every card in a set must be a different suit.',
      canonical: false,
      kind: 'toggle',
      rulesRef: 'A.4.3', // rules.md A.4.3
      supported: true,
    },
    {
      id: 'deal10For2P',
      label: 'Deal 10 in two-player games',
      description: 'Two-player games deal 10 cards to each player instead of 13.',
      canonical: false,
      kind: 'toggle',
      rulesRef: 'A.4.1', // rules.md A.4.1
      supported: true,
    },
    {
      id: 'jokers',
      label: 'Jokers as wild cards',
      description: 'Adds jokers as wild cards. Not yet available.',
      canonical: false,
      kind: 'toggle',
      rulesRef: 'A.4.5', // rules.md A.4.5
      supported: false,
    },
  ],
  gin: [],
};

// Canonical config for a game variation: every def's id mapped to its canonical value.
export function canonicalHouseRules(variant: Variant): HouseRules {
  const out: HouseRules = {};
  for (const def of HOUSE_RULE_DEFS[variant]) {
    out[def.id] = def.canonical;
  }
  return out;
}

// True when `value` differs from the registry canonical for (variant, id).
// An id not present in the variation's registry is treated as not a deviation.
export function isDeviation(variant: Variant, id: HouseRuleId, value: HouseRuleValue): boolean {
  const def = HOUSE_RULE_DEFS[variant].find((d) => d.id === id);
  return def ? value !== def.canonical : false;
}

// Defs the engine currently honors (supported:true) — the only defs the UI renders.
export function supportedDefs(variant: Variant): HouseRuleDef[] {
  return HOUSE_RULE_DEFS[variant].filter((d) => d.supported);
}
