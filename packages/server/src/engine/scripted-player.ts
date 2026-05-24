/**
 * Scripted-player test helper.
 *
 * Feeds a canned sequence of C2S actions into the engine and captures the resulting
 * GameState snapshots + any errors thrown. Used for golden-path integration tests and
 * regression snapshots in M3+.
 *
 * No network, no WebSocket — pure in-process engine calls via the shared dispatcher.
 */
import type { C2S } from '@online-rummy/shared';
import type { GameState } from './types.js';
import { applyAction } from './dispatch.js';

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
      applyAction(state, state.turnPlayerId, action);
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
