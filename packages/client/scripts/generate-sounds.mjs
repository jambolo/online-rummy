// Synthesizes the 21 UI sound-effect WAVs for Rum Runner (1920s speakeasy —
// short, soft, unobtrusive). Zero dependencies; deterministic via seeded PRNG.
// Run from repo root: node packages/client/scripts/generate-sounds.mjs
import fs from 'node:fs';
import path from 'node:path';

const SR = 22050;
// Overridable so process-sounds.mjs can render synth-fallback cues to a temp dir
// instead of clobbering the sourced set (docs/sound-effects-sourced-audio-plan.md Phase A.1).
const OUT_DIR = process.env.SOUND_OUT_DIR ?? path.join(import.meta.dirname, '..', 'src', 'assets', 'sounds');

// Seeded PRNG so regeneration is byte-for-byte reproducible (never Math.random).
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(0xc0ffee);

const sec = (d) => Math.round(d * SR);
const buf = (dur) => new Float64Array(sec(dur));

// tau = exponential decay time constant in seconds (Infinity = no decay).
function sine(freq, dur, { gain = 1, tau = Infinity } = {}) {
  const out = buf(dur);
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    out[i] = Math.sin(2 * Math.PI * freq * t) * gain * Math.exp(-t / tau);
  }
  return out;
}

// Linear frequency glide; phase is integrated so the sweep stays click-free.
function glide(f0, f1, dur, { gain = 1, tau = Infinity } = {}) {
  const out = buf(dur);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    phase += (2 * Math.PI * (f0 + ((f1 - f0) * t) / dur)) / SR;
    out[i] = Math.sin(phase) * gain * Math.exp(-t / tau);
  }
  return out;
}

// Repeated 3-point averaging passes stand in for a lowpass filter — more
// passes = duller, softer "card felt" texture.
function smoothInPlace(arr, passes) {
  for (let p = 0; p < passes; p++) {
    let prev = arr[0];
    for (let i = 1; i < arr.length - 1; i++) {
      const cur = arr[i];
      arr[i] = (prev + cur + arr[i + 1]) / 3;
      prev = cur;
    }
  }
}

function noise(dur, { gain = 1, tau = Infinity, smooth = 0 } = {}) {
  const out = buf(dur);
  for (let i = 0; i < out.length; i++) out[i] = rand() * 2 - 1;
  smoothInPlace(out, smooth);
  for (let i = 0; i < out.length; i++) out[i] *= gain * Math.exp(-i / SR / tau);
  return out;
}

// Mix parts ([startSeconds, samples]) into a single buffer of length dur.
function layer(dur, parts) {
  const out = buf(dur);
  for (const [at, src] of parts) {
    const off = sec(at);
    for (let i = 0; i < src.length && off + i < out.length; i++) {
      out[off + i] += src[i];
    }
  }
  return out;
}

// Triangular amplitude swell (up then down), peaking at fraction peakAt.
function swellInPlace(arr, peakAt = 0.5) {
  const apex = Math.max(1, Math.floor(arr.length * peakAt));
  for (let i = 0; i < arr.length; i++) {
    const g = i < apex ? i / apex : (arr.length - i) / (arr.length - apex);
    arr[i] *= g;
  }
}

function normalizeInPlace(arr, peak) {
  let max = 0;
  for (const v of arr) max = Math.max(max, Math.abs(v));
  if (max === 0) return;
  const k = peak / max;
  for (let i = 0; i < arr.length; i++) arr[i] *= k;
}

// Linear fade-in/out to kill edge clicks (contract: >= 3 ms each side).
function fadeInPlace(arr, ms = 4) {
  const n = Math.min(Math.round((ms / 1000) * SR), Math.floor(arr.length / 2));
  for (let i = 0; i < n; i++) {
    const g = i / n;
    arr[i] *= g;
    arr[arr.length - 1 - i] *= g;
  }
}

function writeWav(filePath, samples) {
  const n = samples.length;
  const out = Buffer.alloc(44 + n * 2);
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + n * 2, 4);
  out.write('WAVE', 8);
  out.write('fmt ', 12);
  out.writeUInt32LE(16, 16); // fmt chunk size
  out.writeUInt16LE(1, 20); // PCM
  out.writeUInt16LE(1, 22); // mono
  out.writeUInt32LE(SR, 24);
  out.writeUInt32LE(SR * 2, 28); // byte rate
  out.writeUInt16LE(2, 32); // block align
  out.writeUInt16LE(16, 34); // bits per sample
  out.write('data', 36);
  out.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    out.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  fs.writeFileSync(filePath, out);
  return out.length;
}

// Declarative recipe table. `peak` is the post-normalization amplitude
// (all <= 0.6 per contract); `build` returns raw samples.
const SOUNDS = {
  // Soft card slide off the stock — heavily lowpassed noise.
  'draw-stock': {
    peak: 0.35,
    build: () => noise(0.15, { smooth: 8, tau: 0.05 }),
  },
  // Brighter slide + faint 900 Hz blip.
  'draw-discard': {
    peak: 0.38,
    build: () =>
      layer(0.15, [
        [0, noise(0.15, { smooth: 2, tau: 0.05 })],
        [0.02, sine(900, 0.06, { gain: 0.35, tau: 0.02 })],
      ]),
  },
  // Three staggered ruffle bursts (grabbing a run of discards).
  'pile-dive': {
    peak: 0.4,
    build: () =>
      layer(0.4, [
        [0, noise(0.09, { smooth: 4, tau: 0.03 })],
        [0.13, noise(0.09, { smooth: 4, tau: 0.03, gain: 0.85 })],
        [0.26, noise(0.09, { smooth: 4, tau: 0.03, gain: 0.7 })],
      ]),
  },
  // Card snap: sharp noise + low 180 Hz thump.
  meld: {
    peak: 0.55,
    build: () =>
      layer(0.12, [
        [0, noise(0.05, { smooth: 1, tau: 0.012 })],
        [0, sine(180, 0.12, { gain: 0.8, tau: 0.03 })],
      ]),
  },
  // Lighter, shorter snap than meld.
  layoff: {
    peak: 0.35,
    build: () =>
      layer(0.09, [
        [0, noise(0.04, { smooth: 1, tau: 0.01 })],
        [0, sine(180, 0.09, { gain: 0.7, tau: 0.022 })],
      ]),
  },
  // Card flip: two very short soft ticks ~60 ms apart.
  discard: {
    peak: 0.4,
    build: () =>
      layer(0.12, [
        [0, noise(0.025, { smooth: 3, tau: 0.008 })],
        [0.06, noise(0.025, { smooth: 3, tau: 0.008, gain: 0.8 })],
      ]),
  },
  // Knuckles on wood: two 150 Hz thumps 120 ms apart.
  knock: {
    peak: 0.5,
    build: () =>
      layer(0.2, [
        [0, sine(150, 0.08, { tau: 0.025 })],
        [0.12, sine(150, 0.08, { tau: 0.025 })],
      ]),
  },
  // Dealing ruffle: 8 ticks with decreasing amplitude.
  deal: {
    peak: 0.4,
    build: () =>
      layer(
        0.7,
        Array.from({ length: 8 }, (_, i) => [i * 0.085, noise(0.03, { smooth: 4, tau: 0.01, gain: 1 - i * 0.09 })]),
      ),
  },
  // Gentle two-partial chime.
  'your-turn': {
    peak: 0.45,
    build: () =>
      layer(0.35, [
        [0, sine(880, 0.35, { tau: 0.1 })],
        [0, sine(1320, 0.35, { gain: 0.5, tau: 0.08 })],
      ]),
  },
  // Two-note chime, 660 then 880 Hz.
  'hand-over': {
    peak: 0.45,
    build: () =>
      layer(0.6, [
        [0, sine(660, 0.32, { tau: 0.12 })],
        [0.28, sine(880, 0.32, { tau: 0.12 })],
      ]),
  },
  // Ascending three-note arpeggio (C5-E5-G5).
  'go-out': {
    peak: 0.5,
    build: () =>
      layer(0.8, [
        [0, sine(523, 0.3, { tau: 0.1 })],
        [0.25, sine(659, 0.3, { tau: 0.1 })],
        [0.5, sine(784, 0.3, { tau: 0.1 })],
      ]),
  },
  // Ascending four-note arpeggio with slight overlap (C5-E5-G5-C6).
  gin: {
    peak: 0.5,
    build: () =>
      layer(1.2, [
        [0, sine(523, 0.36, { tau: 0.12 })],
        [0.28, sine(659, 0.36, { tau: 0.12 })],
        [0.56, sine(784, 0.36, { tau: 0.12 })],
        [0.84, sine(1047, 0.36, { tau: 0.12 })],
      ]),
  },
  // Descending sting; 622 Hz under the second note gives the minor feel.
  undercut: {
    peak: 0.5,
    build: () =>
      layer(0.7, [
        [0, sine(784, 0.3, { tau: 0.1 })],
        [0.3, sine(523, 0.4, { tau: 0.15 })],
        [0.3, sine(622, 0.4, { gain: 0.6, tau: 0.15 })],
      ]),
  },
  // Fanfare arpeggio ending on a sustained C6.
  'game-over': {
    peak: 0.55,
    build: () =>
      layer(2.0, [
        [0, sine(392, 0.28, { tau: 0.1 })],
        [0.2, sine(523, 0.28, { tau: 0.1 })],
        [0.4, sine(659, 0.28, { tau: 0.1 })],
        [0.6, sine(784, 0.28, { tau: 0.1 })],
        [0.8, sine(1047, 1.2, { tau: 0.45 })],
      ]),
  },
  // Neutral whoosh: noise swelling up then down.
  'hand-cancelled': {
    peak: 0.35,
    build: () => {
      const s = noise(0.5, { smooth: 5 });
      swellInPlace(s, 0.45);
      return s;
    },
  },
  // Quiet low buzz: 110 Hz with odd harmonics (square-ish).
  error: {
    peak: 0.25,
    build: () =>
      layer(0.2, [
        [0, sine(110, 0.2, { tau: 0.15 })],
        [0, sine(330, 0.2, { gain: 1 / 3, tau: 0.15 })],
        [0, sine(550, 0.2, { gain: 1 / 5, tau: 0.15 })],
      ]),
  },
  // Tiny pop, very fast decay.
  chat: {
    peak: 0.4,
    build: () => sine(1200, 0.12, { tau: 0.015 }),
  },
  // Single soft ding.
  'player-joined': {
    peak: 0.4,
    build: () => sine(990, 0.3, { tau: 0.09 }),
  },
  // Descending glide.
  disconnect: {
    peak: 0.4,
    build: () => glide(440, 330, 0.4, { tau: 0.25 }),
  },
  // Ascending glide (mirror of disconnect).
  reconnect: {
    peak: 0.4,
    build: () => glide(330, 440, 0.4, { tau: 0.25 }),
  },
  // Descending three-note (C5-A4-F4).
  forfeit: {
    peak: 0.45,
    build: () =>
      layer(0.6, [
        [0, sine(523, 0.25, { tau: 0.09 })],
        [0.2, sine(440, 0.25, { tau: 0.09 })],
        [0.4, sine(349, 0.25, { tau: 0.09 })],
      ]),
  },
};

const names = Object.keys(SOUNDS);
if (names.length !== 21) {
  throw new Error(`expected 21 sounds, table has ${names.length}`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const name of names) {
  const { peak, build } = SOUNDS[name];
  const samples = build();
  normalizeInPlace(samples, peak);
  fadeInPlace(samples, 4);
  const bytes = writeWav(path.join(OUT_DIR, `${name}.wav`), samples);
  console.log(`${name}.wav\t${bytes} bytes`);
}
console.log(`wrote ${names.length} files to ${OUT_DIR}`);
