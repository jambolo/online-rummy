/**
 * Scripted-player test helper.
 *
 * Feeds a canned sequence of C2S actions into the engine and captures the resulting
 * GameState snapshots + any errors thrown. Used for golden-path integration tests and
 * regression snapshots in M3+.
 *
 * No network, no WebSocket — pure in-process engine calls.
 */
import type { C2S } from '@online-rummy/shared';
import type { GameState } from './types.js';
import * as basic from './variants/basic.js';
import * as rum500 from './variants/rum500.js';
import * as gin from './variants/gin.js';

type VariantFns = {
  applyDraw: typeof basic.applyDraw;
  applyMeld: typeof basic.applyMeld;
  applyLayoff: typeof basic.applyLayoff;
  applyDiscard: typeof gin.applyDiscard;
  applyDrawFromPile?: typeof rum500.applyDrawFromPile;
  applyKnock?: typeof gin.applyKnock;
  applyGinLayoff?: typeof gin.applyGinLayoff;
  applyPassUpcard?: typeof gin.applyPassUpcard;
};

function fnsFor(state: GameState): VariantFns {
  if (state.variant === 'rum500') return rum500;
  if (state.variant === 'gin') return gin;
  return basic;
}

export type ActionResult =
  | { ok: true; action: C2S; stateBefore: GameState; stateAfter: GameState }
  | { ok: false; action: C2S; stateBefore: GameState; error: string };

export type ScriptedResult = {
  results: ActionResult[];
  finalState: GameState;
};

// Deep-clone a GameState for snapshot capture (strips Map → plain object for JSON comparison)
function cloneState(state: GameState): GameState {
  return JSON.parse(
    JSON.stringify(state, (_key, value) => {
      if (value instanceof Map) return Object.fromEntries(value);
      return value as unknown;
    }),
  ) as GameState;
}

/**
 * Run a canned sequence of C2S actions against a pre-built GameState.
 *
 * @param state  A mutable GameState (created via createBasicGame etc.)
 * @param script Array of C2S messages to replay in order
 * @returns      Per-action results + final state
 */
export function runScript(state: GameState, script: C2S[]): ScriptedResult {
  const results: ActionResult[] = [];

  for (const action of script) {
    const stateBefore = cloneState(state);
    try {
      dispatchAction(state, action);
      results.push({ ok: true, action, stateBefore, stateAfter: cloneState(state) });
    } catch (err) {
      results.push({
        ok: false,
        action,
        stateBefore,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { results, finalState: cloneState(state) };
}

function dispatchAction(state: GameState, action: C2S): void {
  const pid = state.turnPlayerId;
  const fns = fnsFor(state);

  switch (action.t) {
    case 'draw':
      fns.applyDraw(state, pid, action.from);
      break;
    case 'drawFromPile':
      if (fns.applyDrawFromPile === undefined) {
        throw new Error('ERR_NOT_IMPLEMENTED:drawFromPile');
      }
      fns.applyDrawFromPile(state, pid, action.cardId);
      break;
    case 'meld':
      fns.applyMeld(state, pid, action.cardIds);
      break;
    case 'layoff':
      fns.applyLayoff(state, pid, action.meldId, action.cardId);
      break;
    case 'discard':
      fns.applyDiscard(state, pid, action.cardId);
      break;
    case 'knock':
      if (fns.applyKnock !== undefined) {
        fns.applyKnock(state, pid, action.melds, action.discardId);
      }
      break;
    case 'ginLayoff':
      if (fns.applyGinLayoff !== undefined) {
        fns.applyGinLayoff(state, pid, action.layoffs, action.ownMelds);
      }
      break;
    case 'passUpcard':
      if (fns.applyPassUpcard !== undefined) {
        fns.applyPassUpcard(state, pid);
      }
      break;
    // Non-engine actions (no-op in scripted context)
    case 'create':
    case 'join':
    case 'start':
    case 'chat':
      break;
    default: {
      const _exhaustive: never = action;
      throw new Error(`Unhandled action: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
