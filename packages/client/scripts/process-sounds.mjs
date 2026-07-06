// Processes the sourced CC0 originals in assets/sounds-src/ into the 21 UI
// sound-effect WAVs (mono 32 kHz 16-bit PCM) consumed by src/audio/sounds.ts.
// Mapping + parameters live in sound-manifest.mjs; provenance in
// assets/sounds-src/PROVENANCE.md. Run from repo root:
//   node packages/client/scripts/process-sounds.mjs
//
// ffmpeg (via the ffmpeg-static dev dependency) is used only to DECODE the
// oggs; trims, loudness normalization, fades and WAV encoding happen here so
// the pipeline behaves identically across ffmpeg builds. RMS-based
// normalization (per-category target, true-peak ceiling) is used instead of
// ffmpeg loudnorm because EBU R128 integrated loudness is unreliable on
// sub-second samples.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CATEGORY_RMS_DB, MANIFEST } from './sound-manifest.mjs';

const require = createRequire(import.meta.url);
const FFMPEG = require('ffmpeg-static');

const SR = 32000;
const PEAK_CEILING_DB = -1.5;
const AUTO_TRIM_DB = -50; // leading/trailing silence threshold
const FADE_MS = 4;

const REPO_ROOT = path.join(import.meta.dirname, '..', '..', '..');
const SRC_DIR = path.join(REPO_ROOT, 'assets', 'sounds-src');
const OUT_DIR = path.join(import.meta.dirname, '..', 'src', 'assets', 'sounds');

function decode(file) {
  const buf = execFileSync(FFMPEG, ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], {
    maxBuffer: 1 << 28,
  });
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

const db = (gain) => 20 * Math.log10(gain + 1e-12);
const gain = (dB) => Math.pow(10, dB / 20);

function rmsDb(samples) {
  let acc = 0;
  for (const v of samples) acc += v * v;
  return 10 * Math.log10(acc / samples.length + 1e-12);
}

function peakDb(samples) {
  let m = 0;
  for (const v of samples) m = Math.max(m, Math.abs(v));
  return db(m);
}

function hardTrim(samples, trimStart, trimEnd) {
  const a = trimStart !== undefined ? Math.min(samples.length, Math.round(trimStart * SR)) : 0;
  const b = trimEnd !== undefined ? Math.min(samples.length, Math.round(trimEnd * SR)) : samples.length;
  return samples.subarray(a, Math.max(a, b));
}

// Strip leading/trailing silence so playback onset is immediate (the latency
// goal): keep everything above AUTO_TRIM_DB, plus a hair of natural tail.
function autoTrim(samples) {
  const thresh = gain(AUTO_TRIM_DB);
  let a = 0;
  let b = samples.length - 1;
  while (a < samples.length && Math.abs(samples[a]) < thresh) a++;
  while (b > a && Math.abs(samples[b]) < thresh) b--;
  const tailPad = Math.min(samples.length - 1 - b, Math.round(0.02 * SR));
  return samples.subarray(a, b + 1 + tailPad);
}

// Layer the sample onto itself `times` times, `gapMs` apart (knock).
function repeatSample(samples, { times, gapMs }) {
  const gapN = Math.round((gapMs / 1000) * SR);
  const out = new Float32Array(gapN * (times - 1) + samples.length);
  for (let r = 0; r < times; r++) {
    const off = r * gapN;
    for (let i = 0; i < samples.length; i++) out[off + i] += samples[i];
  }
  return out;
}

// Normalize to the category RMS target, then rescale if the true peak would
// exceed the ceiling (short transients otherwise clip after RMS matching).
function normalize(samples, targetRmsDb, extraGainDb) {
  let g = gain(targetRmsDb - rmsDb(samples)) * gain(extraGainDb);
  const peakAfter = peakDb(samples) + db(g);
  if (peakAfter > PEAK_CEILING_DB) g *= gain(PEAK_CEILING_DB - peakAfter);
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * g;
  return out;
}

function fadeInPlace(samples, ms) {
  const n = Math.min(Math.round((ms / 1000) * SR), Math.floor(samples.length / 2));
  for (let i = 0; i < n; i++) {
    const g = i / n;
    samples[i] *= g;
    samples[samples.length - 1 - i] *= g;
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

const ids = Object.keys(MANIFEST);
if (ids.length !== 21) {
  throw new Error(`expected 21 manifest entries, found ${ids.length}`);
}
if (FFMPEG === null || !fs.existsSync(FFMPEG)) {
  throw new Error('ffmpeg-static binary missing — run pnpm install (allowBuilds covers its postinstall)');
}

fs.mkdirSync(OUT_DIR, { recursive: true });

// synth: true entries have no CC0 source — they're covered by the generator
// instead. Run it once up front into a scratch dir rather than per-entry.
const synthIds = ids.filter((id) => MANIFEST[id].synth === true);
let synthDir = null;
if (synthIds.length > 0) {
  synthDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-synth-'));
  execFileSync(process.execPath, [path.join(import.meta.dirname, 'generate-sounds.mjs')], {
    env: { ...process.env, SOUND_OUT_DIR: synthDir },
  });
}

let total = 0;
for (const id of ids) {
  const entry = MANIFEST[id];

  if (entry.synth) {
    const synthPath = path.join(synthDir, `${id}.wav`);
    const bytes = fs.statSync(synthPath).size;
    fs.copyFileSync(synthPath, path.join(OUT_DIR, `${id}.wav`));
    total += bytes;
    console.log(`${id}.wav\t(synth)\t${bytes} bytes\t<- generate-sounds.mjs`);
    continue;
  }

  const srcPath = path.join(SRC_DIR, entry.src);
  if (!fs.existsSync(srcPath)) throw new Error(`${id}: source missing: ${srcPath}`);

  let samples = decode(srcPath);
  samples = hardTrim(samples, entry.trimStart, entry.trimEnd);
  samples = autoTrim(samples);
  if (entry.repeat !== undefined) samples = repeatSample(samples, entry.repeat);
  // maxDurS truncates post-trim, pre-normalize/fade so the fade lands on the
  // (now final) tail instead of clicking at the cut point.
  if (entry.maxDurS !== undefined) {
    samples = samples.subarray(0, Math.min(samples.length, Math.round(entry.maxDurS * SR)));
  }
  samples = normalize(samples, CATEGORY_RMS_DB[entry.category], entry.gainDb ?? 0);
  fadeInPlace(samples, FADE_MS);

  const bytes = writeWav(path.join(OUT_DIR, `${id}.wav`), samples);
  total += bytes;
  console.log(`${id}.wav\t${(samples.length / SR).toFixed(2)}s\t${bytes} bytes\t<- ${entry.src}`);
}
if (synthDir) fs.rmSync(synthDir, { recursive: true, force: true });
console.log(`wrote ${ids.length} files, ${(total / 1024).toFixed(0)} kB total, to ${OUT_DIR}`);
