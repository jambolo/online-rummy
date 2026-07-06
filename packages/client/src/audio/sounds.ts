import type { SoundId } from './soundMap';
import { createHoldGate } from './holdPolicy';
import drawStockUrl from '../assets/sounds/draw-stock.wav';
import drawDiscardUrl from '../assets/sounds/draw-discard.wav';
import pileDiveUrl from '../assets/sounds/pile-dive.wav';
import meldUrl from '../assets/sounds/meld.wav';
import layoffUrl from '../assets/sounds/layoff.wav';
import discardUrl from '../assets/sounds/discard.wav';
import knockUrl from '../assets/sounds/knock.wav';
import dealUrl from '../assets/sounds/deal.wav';
import yourTurnUrl from '../assets/sounds/your-turn.wav';
import handOverUrl from '../assets/sounds/hand-over.wav';
import goOutUrl from '../assets/sounds/go-out.wav';
import ginUrl from '../assets/sounds/gin.wav';
import undercutUrl from '../assets/sounds/undercut.wav';
import gameOverUrl from '../assets/sounds/game-over.wav';
import handCancelledUrl from '../assets/sounds/hand-cancelled.wav';
import errorUrl from '../assets/sounds/error.wav';
import chatUrl from '../assets/sounds/chat.wav';
import playerJoinedUrl from '../assets/sounds/player-joined.wav';
import disconnectUrl from '../assets/sounds/disconnect.wav';
import reconnectUrl from '../assets/sounds/reconnect.wav';
import forfeitUrl from '../assets/sounds/forfeit.wav';

const SOUND_URLS: Record<SoundId, string> = {
  'draw-stock': drawStockUrl,
  'draw-discard': drawDiscardUrl,
  'pile-dive': pileDiveUrl,
  meld: meldUrl,
  layoff: layoffUrl,
  discard: discardUrl,
  knock: knockUrl,
  deal: dealUrl,
  'your-turn': yourTurnUrl,
  'hand-over': handOverUrl,
  'go-out': goOutUrl,
  gin: ginUrl,
  undercut: undercutUrl,
  'game-over': gameOverUrl,
  'hand-cancelled': handCancelledUrl,
  error: errorUrl,
  chat: chatUrl,
  'player-joined': playerJoinedUrl,
  disconnect: disconnectUrl,
  reconnect: reconnectUrl,
  forfeit: forfeitUrl,
};

const MUTED_KEY = 'rumrunner.soundMuted';
const VOLUME_KEY = 'rumrunner.soundVolume';
// Rapid repeats of the same action shouldn't stack into a wall of sound.
const MAX_CONCURRENT_PER_ID = 2;
// branding.md §4: card-handling cues get slight per-play pitch variation so
// repeated draws/discards/melds don't sound identical; ±4% around unity.
const PLAYBACK_JITTER_PCT = 0.04;

let muted = false;
let volume = 0.5;
// localStorage can throw (privacy modes) or be absent (node tests) — keep defaults.
try {
  muted = localStorage.getItem(MUTED_KEY) === '1';
  const storedVolume = localStorage.getItem(VOLUME_KEY);
  if (storedVolume !== null) {
    const v = Number.parseFloat(storedVolume);
    if (Number.isFinite(v)) volume = Math.min(1, Math.max(0, v));
  }
} catch {
  // ignore — defaults stand
}

// Every source node fans into this one master gain instead of carrying its own
// volume, so a mute/volume change reaches sounds already in flight — the old
// per-clone `.volume` only ever applied to plays that hadn't started yet.
let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let actionGain: GainNode | null = null;
let alertGain: GainNode | null = null;
let buffers: Map<SoundId, AudioBuffer> | null = null;
const playingCounts = new Map<SoundId, number>();
const mutedListeners = new Set<() => void>();

function applyGain(): void {
  if (masterGain === null) return;
  // Perceived loudness is roughly logarithmic; squaring the linear 0..1 slider
  // value spreads it more evenly across the control's travel than volume alone.
  masterGain.gain.value = muted ? 0 : volume * volume;
}

// Loudness bus: 'action' = felt/paper/wood card-handling cues (branding.md §4
// "actions are blinks"); 'alert' = everything else (UI chirps, jingles, the
// basement-hum trouble family) — mirrors the two-bucket LUFS split from the
// sourced-audio plan (actions vs alerts+jingles). Exhaustive switch, no
// default: adding a SoundId without extending this is a compile error.
function gainBus(id: SoundId): 'action' | 'alert' {
  switch (id) {
    case 'draw-stock':
    case 'draw-discard':
    case 'pile-dive':
    case 'meld':
    case 'layoff':
    case 'discard':
    case 'deal':
      return 'action';
    case 'knock':
    case 'your-turn':
    case 'hand-over':
    case 'go-out':
    case 'gin':
    case 'undercut':
    case 'game-over':
    case 'hand-cancelled':
    case 'error':
    case 'chat':
    case 'player-joined':
    case 'disconnect':
    case 'reconnect':
    case 'forfeit':
      return 'alert';
  }
}

export function initAudio(): void {
  // No-op outside a browser (node-env tests) and idempotent across calls.
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined' || ctx !== null) return;
  const audioCtx = new AudioContext({ latencyHint: 'interactive' });
  const gain = audioCtx.createGain();
  gain.connect(audioCtx.destination);
  // Two category buses feed the master gain so mute/volume still governs
  // everything downstream; each bus defaults to unity — the RMS-normalize
  // step in process-sounds.mjs already sets the relative loudness per id.
  const aGain = audioCtx.createGain();
  const alGain = audioCtx.createGain();
  aGain.connect(gain);
  alGain.connect(gain);
  ctx = audioCtx;
  masterGain = gain;
  actionGain = aGain;
  alertGain = alGain;
  buffers = new Map();
  applyGain();

  // Autoplay policy: the context boots 'suspended' until a genuine user gesture.
  // Resume on the first pointer/key press, then stop listening for either.
  const resume = () => {
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => undefined);
    window.removeEventListener('pointerdown', resume);
    window.removeEventListener('keydown', resume);
  };
  window.addEventListener('pointerdown', resume);
  window.addEventListener('keydown', resume);

  for (const [id, url] of Object.entries(SOUND_URLS) as [SoundId, string][]) {
    // Per-file fetch/decode failure is swallowed — that id just never plays.
    fetch(url)
      .then((res) => res.arrayBuffer())
      .then((data) => audioCtx.decodeAudioData(data))
      .then((buffer) => {
        buffers?.set(id, buffer);
      })
      .catch(() => undefined);
  }
}

// The actual buffer lookup/cap-check/source-start work, run either immediately
// or after holdGate's hold window — see holdPolicy.ts. Guards (mute/init) live
// here rather than in playSound so a cue that unmutes mid-hold is judged at the
// moment it would actually play, not at submit time.
function actuallyPlay(id: SoundId): void {
  const audioCtx = ctx;
  const gain = masterGain;
  const bufferMap = buffers;
  const aGain = actionGain;
  const alGain = alertGain;
  if (muted || audioCtx === null || gain === null || bufferMap === null || aGain === null || alGain === null) return;
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => undefined);
  const buffer = bufferMap.get(id);
  if (buffer === undefined) return;
  if ((playingCounts.get(id) ?? 0) >= MAX_CONCURRENT_PER_ID) return;
  playingCounts.set(id, (playingCounts.get(id) ?? 0) + 1);
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  const bus = gainBus(id);
  if (bus === 'action') {
    source.playbackRate.value = 1 + (Math.random() * 2 - 1) * PLAYBACK_JITTER_PCT;
  }
  source.connect(bus === 'action' ? aGain : alGain);
  // Buffer sources always fire 'ended' (no HTMLAudioElement-style rejected
  // play() to also guard against), so the counter can never leak.
  source.onended = () => {
    playingCounts.set(id, Math.max(0, (playingCounts.get(id) ?? 1) - 1));
  };
  source.start();
}

// branding.md §4 "one sound per moment" (holdPolicy.ts): the real scheduler is
// a plain setTimeout/clearTimeout pair — node tests inject a fake one instead.
const holdGate = createHoldGate((fn, ms) => {
  const t = setTimeout(fn, ms);
  return () => clearTimeout(t);
});

export function playSound(id: SoundId): void {
  // Called from the WS message path — nothing in here may ever throw.
  try {
    holdGate.submit(id, actuallyPlay);
  } catch {
    // ignore — see comment above
  }
}

export function getMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  muted = m;
  applyGain();
  try {
    localStorage.setItem(MUTED_KEY, m ? '1' : '0');
  } catch {
    // ignore — in-memory state still applies for this session
  }
  for (const cb of mutedListeners) cb();
}

export function getVolume(): number {
  return volume;
}

export function setVolume(v: number): void {
  volume = Math.min(1, Math.max(0, v));
  applyGain();
  try {
    localStorage.setItem(VOLUME_KEY, String(volume));
  } catch {
    // ignore — in-memory state still applies for this session
  }
}

// Minimal external store so React components can useSyncExternalStore on mute state.
export function subscribeMuted(cb: () => void): () => void {
  mutedListeners.add(cb);
  return () => {
    mutedListeners.delete(cb);
  };
}
