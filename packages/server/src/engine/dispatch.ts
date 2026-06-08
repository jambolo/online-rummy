// Unified C2S action dispatcher.
//
// Single function applyAction routes any engine-affecting C2S message to the right
// VariantEngine method. Both ws.ts (real socket) and scripted-player.ts (test harness)
// call this — previously each maintained its own table.

import type { C2S } from '@online-rummy/shared';
import type { GameState } from './types.js';
import { getVariant } from './variants/index.js';

export type DispatchResult =
  | { kind: 'state' }          // broadcast public state to all; private to acting player
  | { kind: 'stateAll' }       // broadcast state (public + private) to every connected player
  | { kind: 'handEnded' }      // hand finished — caller invokes handleHandEnd
  | { kind: 'handCancelled' }  // gin stock-depletion — caller invokes handleHandCancelled
  | { kind: 'noop' };          // non-engine action (create/join/start/chat) — caller handles

// Apply a C2S action against `state`, mutating in place. Throws engine errors
// (ERR_*) on validation failure; caller translates to WS error frames.
export function applyAction(state: GameState, playerId: string, action: C2S): DispatchResult {
  const engine = getVariant(state.variant);
  switch (action.t) {
    case 'draw':
      engine.applyDraw(state, playerId, action.from);
      return { kind: 'state' };
    case 'drawFromPile': {
      if (engine.applyDrawFromPile === undefined) {
        throw new Error('ERR_NOT_IMPLEMENTED:drawFromPile');
      }
      engine.applyDrawFromPile(state, playerId, action.cardId);
      return { kind: 'state' };
    }
    case 'meld': {
      const r = engine.applyMeld(state, playerId, action.cardIds);
      if (r.handEnded) return { kind: 'handEnded' };
      return { kind: 'state' };
    }
    case 'layoff': {
      const r = engine.applyLayoff(state, playerId, action.meldId, action.cardId);
      if (r.handEnded) return { kind: 'handEnded' };
      return { kind: 'state' };
    }
    case 'discard': {
      const r = engine.applyDiscard(state, playerId, action.cardId);
      if (r.cancelled === true) return { kind: 'handCancelled' };
      if (r.handEnded) return { kind: 'handEnded' };
      return { kind: 'state' };
    }
    case 'passUpcard': {
      if (engine.applyPassUpcard === undefined) {
        throw new Error('ERR_NOT_IMPLEMENTED:passUpcard');
      }
      engine.applyPassUpcard(state, playerId);
      return { kind: 'stateAll' };
    }
    case 'knock': {
      if (engine.applyKnock === undefined) {
        throw new Error('ERR_NOT_IMPLEMENTED:knock');
      }
      engine.applyKnock(state, playerId, action.melds, action.discardId);
      // Gin (0 deadwood) advances directly to 'ended' — hand ends now.
      // Non-gin knock advances to 'layoff' — defender turn, broadcast both hands.
      return state.phase === 'ended' ? { kind: 'handEnded' } : { kind: 'stateAll' };
    }
    case 'ginLayoff': {
      if (engine.applyGinLayoff === undefined) {
        throw new Error('ERR_NOT_IMPLEMENTED:ginLayoff');
      }
      engine.applyGinLayoff(state, playerId, action.layoffs, action.ownMelds);
      return { kind: 'handEnded' };
    }
    case 'create':
    case 'join':
    case 'start':
    case 'chat':
    case 'keepalive':
    case 'leave':
      return { kind: 'noop' };
  }
}
