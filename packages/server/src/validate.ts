// Ingress validation for client → server messages.
//
// JSON.parse yields `unknown`; every C2S shape is checked here before dispatch so the
// handlers can trust their fields. A wrong-typed field is answered with ERR_INVALID_MSG
// instead of surfacing as a TypeError inside a handler — which, uncaught, would take the
// whole process (and every room in it) down.

import type { C2S } from '@online-rummy/shared';

type Fields = Record<string, unknown>;
type Check = (v: unknown) => boolean;

const isStr: Check = (v) => typeof v === 'string';
const isObj = (v: unknown): v is Fields => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStrArr: Check = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isStrArr2: Check = (v) => Array.isArray(v) && v.every(isStrArr);
const optional =
  (check: Check): Check =>
  (v) =>
    v === undefined || check(v);

// One entry per message type, so adding a C2S shape fails the type-check until it is
// covered here. Fields not listed are ignored.
const SHAPES: { [T in C2S['t']]: Record<string, Check> } = {
  create: { variant: isStr, name: isStr, houseRules: optional(isObj) },
  setHouseRules: { houseRules: isObj },
  join: { roomCode: isStr, name: isStr, sessionId: optional(isStr) },
  start: {},
  draw: { from: (v) => v === 'stock' || v === 'discard' },
  drawFromPile: { cardId: isStr },
  meld: { cardIds: isStrArr },
  layoff: { meldId: isStr, cardId: isStr },
  discard: { cardId: isStr },
  // discardId stays optional here so the engine's ERR_KNOCK_REQUIRES_DISCARD is reachable.
  knock: { melds: optional(isStrArr2), discardId: optional(isStr) },
  ginLayoff: {
    ownMelds: optional(isStrArr2),
    layoffs: (v) => Array.isArray(v) && v.every((l) => isObj(l) && isStr(l['cardId']) && isStr(l['meldId'])),
  },
  passUpcard: {},
  keepalive: {},
  leave: {},
  chat: { text: isStr },
};

export type ValidationResult = { ok: true; msg: C2S } | { ok: false; reason: string };

export function validateC2S(parsed: unknown): ValidationResult {
  if (!isObj(parsed)) return { ok: false, reason: 'Message must be an object with field t' };
  const t = parsed['t'];
  if (typeof t !== 'string' || !Object.hasOwn(SHAPES, t)) return { ok: false, reason: 'Unknown message type' };
  for (const [field, check] of Object.entries(SHAPES[t as C2S['t']])) {
    if (!check(parsed[field])) return { ok: false, reason: `Invalid field: ${field}` };
  }
  return { ok: true, msg: parsed as unknown as C2S };
}
