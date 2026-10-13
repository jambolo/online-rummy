// Central registry of all variant engines.
//
// Single source of truth used by room.ts (variantLimits), ws.ts (action dispatch
// + variant validation), and tests. Adding a new variant ⇒ implement
// VariantEngine, import below, add one entry to VARIANTS.

import type { Variant } from '@online-rummy/shared';
import type { VariantEngine } from '../types.js';
import { basicVariant } from './basic.js';
import { rum500Variant } from './rum500.js';
import { ginVariant } from './gin.js';

export const VARIANTS: Record<Variant, VariantEngine> = {
  basic: basicVariant,
  rum500: rum500Variant,
  gin: ginVariant,
};

export function isVariant(v: unknown): v is Variant {
  // hasOwn, not `in`: `in` walks the prototype chain, so 'toString' would pass.
  return typeof v === 'string' && Object.hasOwn(VARIANTS, v);
}

export function getVariant(v: Variant): VariantEngine {
  return VARIANTS[v];
}
