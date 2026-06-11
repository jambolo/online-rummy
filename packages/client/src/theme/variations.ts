import type { Variant } from '@online-rummy/shared';
import { t } from './tokens';

// NS-7: per-game-variation identity. Single source of truth for the accent +
// friendly label of each game variation. Code keys stay 'basic'|'rum500'|'gin'
// (CLAUDE.md — identifiers keep their names); label strings use friendly prose.
//
// DECISION (resolved): each game variation has its own distinct identity accent,
// decoupled from the semantic accent tokens — basic cyan, rum500 orange, gin amber.
export const VARIATION_ACCENT: Record<Variant, { accent: string; label: string }> = {
  basic: { accent: t.variationBasic, label: 'Classic Rummy' },
  rum500: { accent: t.variationRum500, label: '500 Rummy' },
  gin: { accent: t.variationGin, label: 'Gin Rummy' },
};

export function variationAccent(variant: Variant): string {
  return VARIATION_ACCENT[variant].accent;
}

export function variationLabel(variant: Variant): string {
  return VARIATION_ACCENT[variant].label;
}
