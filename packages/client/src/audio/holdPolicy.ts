import type { SoundId } from './soundMap';

// branding.md §4 "one sound per moment": when a single action ends the hand,
// the server emits the action event and the outcome event back-to-back (final
// discard -> 'discard' + 'hand-over'; gin layoff -> 'layoff' + 'gin'). Playing
// both reads as a pile-up, not a moment. Action-family cues are therefore held
// for a short window; if an outcome cue lands inside it, the outcome wins and
// the held action is dropped silently. Nothing supersedes a held action, it
// plays once the window elapses — Web Audio's precise scheduling keeps that
// case inaudible.
export const ACTION_HOLD_MS = 80;

export type CueFamily = 'action' | 'outcome' | 'other';

// Exhaustive over every SoundId — a switch with no default and no missing case
// so adding an id without extending this function is a compile error, not a
// silent fallthrough into 'other'.
export function cueFamily(id: SoundId): CueFamily {
  switch (id) {
    case 'draw-stock':
    case 'draw-discard':
    case 'pile-dive':
    case 'meld':
    case 'layoff':
    case 'discard':
      return 'action';
    case 'hand-over':
    case 'go-out':
    case 'gin':
    case 'undercut':
    case 'game-over':
    case 'hand-cancelled':
      return 'outcome';
    case 'knock':
    case 'deal':
    case 'your-turn':
    case 'error':
    case 'chat':
    case 'player-joined':
    case 'disconnect':
    case 'reconnect':
    case 'forfeit':
      return 'other';
  }
}

export function createHoldGate(schedule: (fn: () => void, ms: number) => () => void): {
  submit(id: SoundId, play: (id: SoundId) => void): void;
} {
  // Cancellers for held actions still waiting out their hold window.
  const pending = new Set<() => void>();

  return {
    submit(id, play) {
      const family = cueFamily(id);
      if (family === 'other') {
        play(id);
        return;
      }
      if (family === 'outcome') {
        // This moment belongs to the outcome: drop every action still on hold
        // (its play() never runs) before playing the outcome itself.
        for (const cancel of pending) cancel();
        pending.clear();
        play(id);
        return;
      }
      // family === 'action': hold briefly so a same-moment outcome can cancel it.
      const cancel = schedule(() => {
        pending.delete(cancel);
        play(id);
      }, ACTION_HOLD_MS);
      pending.add(cancel);
    },
  };
}
