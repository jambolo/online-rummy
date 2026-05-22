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
import {
  applyDiscard,
  applyDraw,
  applyLayoff,
  applyMeld,
} from './variants/basic.js';

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
  // Determine acting player from action context (most actions implicitly apply to turnPlayerId)
  const pid = state.turnPlayerId;

  switch (action.t) {
    case 'draw':
      applyDraw(state, pid, action.from);
      break;
    case 'meld':
      applyMeld(state, pid, action.cardIds);
      break;
    case 'layoff':
      applyLayoff(state, pid, action.meldId, action.cardId);
      break;
    case 'discard':
      applyDiscard(state, pid, action.cardId);
      break;
    // Non-engine actions (no-op in scripted context)
    case 'create':
    case 'join':
    case 'start':
    case 'chat':
    case 'knock':
    case 'drawFromPile':
      break;
    default: {
      const _exhaustive: never = action;
      throw new Error(`Unhandled action: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
