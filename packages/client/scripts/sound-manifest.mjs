// Sourced-audio manifest: maps each SoundId to a CC0 original under
// assets/sounds-src/ plus its processing parameters. Consumed by
// process-sounds.mjs. Provenance/licensing: assets/sounds-src/PROVENANCE.md.
//
// Selections were curated programmatically (duration, RMS, head/tail pitch
// trend — see docs/sound-effects-sourced-audio-plan.md); swap any entry's
// `src` and re-run the processor if a choice doesn't sound right.
//
// Fields:
//   src        path relative to <repo>/assets/sounds-src/
//   category   loudness bucket: action | alert | jingle (RMS target per bucket)
//   gainDb     optional by-ear trim applied after normalization
//   trimStart / trimEnd   optional hard trim (seconds, applied before auto-trim)
//   repeat     optional { times, gapMs } — layer the sample repeatedly (knock)
//   maxDurS    optional cap (seconds) on post-trim duration, applied before normalize/fade
//   synth      true — skip src entirely; copy this id's cue from generate-sounds.mjs instead

export const CATEGORY_RMS_DB = {
  action: -22, // card handling — frequent, must sit in the background
  alert: -19, // UI chirps — audible over table noise
  jingle: -16, // musical outcomes — the loudest tier
};

export const MANIFEST = {
  // Card actions — Kenney Casino Audio (real card recordings).
  // Real recordings ran 0.6-0.8s of felt tail past the onset; branding.md §4
  // "actions are blinks" wants card cues well under 0.5s, so cap, don't just trim.
  'draw-stock': { src: 'kenney-casino-audio/card-slide-6.ogg', category: 'action', maxDurS: 0.45 },
  'draw-discard': { src: 'kenney-casino-audio/card-shove-4.ogg', category: 'action', maxDurS: 0.45 },
  'pile-dive': { src: 'kenney-casino-audio/card-fan-1.ogg', category: 'action', maxDurS: 0.45 },
  meld: { src: 'kenney-casino-audio/card-place-1.ogg', category: 'action', maxDurS: 0.45 },
  layoff: { src: 'kenney-casino-audio/card-place-2.ogg', category: 'action', gainDb: -2 },
  discard: { src: 'kenney-casino-audio/card-slide-4.ogg', category: 'action' },
  // Real shuffle is ~3 s; capped (not hard-trimmed at a fixed point) to the
  // ~0.9s "hand begins" ruffle — branding.md §4 was over the letter at 1.2s.
  deal: { src: 'kenney-casino-audio/card-shuffle.ogg', category: 'action', maxDurS: 0.9 },
  // Real knuckles on wood (self-recorded single knock), doubled 120 ms apart —
  // branding.md §3: the speakeasy's own password, never a tone.
  knock: { src: 'custom/knock-source.wav', category: 'alert', repeat: { times: 2, gapMs: 120 } },

  // UI alerts — Kenney Interface Sounds.
  // Confirmation/pluck chirps read as phone-OS notifications, not a club —
  // branding.md §3 wants attention/social cues to be glassware.
  'your-turn': { src: 'kenney-interface-sounds/glass_004.ogg', category: 'alert' }, // bartender taps a glass once, not a doorbell
  'player-joined': { src: 'kenney-interface-sounds/glass_005.ogg', category: 'alert', gainDb: -2 }, // soft ding as someone steps through the door
  chat: { src: 'kenney-interface-sounds/glass_002.ogg', category: 'alert', gainDb: -3 }, // tiny clink for another player's message
  // Basement-hum family (branding.md §2/§3): trouble is a low, quiet, rounded
  // tone, never a phone-OS buzzer or notification sweep. The synth generator's
  // takes on these four are already on-brand, so copy them instead of sourcing.
  error: { synth: true }, // ~110 Hz rounded hum — "the dealer shaking his head," not a buzzer
  'hand-cancelled': { src: 'kenney-interface-sounds/scroll_001.ogg', category: 'alert', trimEnd: 0.6, gainDb: -3 },
  disconnect: { synth: true }, // descending glide
  reconnect: { synth: true }, // ascending glide — exact mirror of disconnect

  // Musical outcomes — Kenney Music Jingles, sax set (fits the speakeasy brand).
  // Trend analysis: wins ascend, losses descend, game-over is the long cadence.
  'hand-over': { src: 'kenney-music-jingles/jingles_SAX06.ogg', category: 'jingle', gainDb: -2 }, // flat/neutral
  'go-out': { src: 'kenney-music-jingles/jingles_SAX10.ogg', category: 'jingle' }, // short ascent
  gin: { src: 'kenney-music-jingles/jingles_SAX02.ogg', category: 'jingle' }, // bigger ascent, ends high
  undercut: { src: 'kenney-music-jingles/jingles_SAX14.ogg', category: 'jingle' }, // descending sting
  'game-over': { src: 'kenney-music-jingles/jingles_SAX07.ogg', category: 'jingle' }, // longest, conclusive cadence
  // forfeit is a trouble cue, not a triumph one — branding.md §3 puts it in the
  // basement-hum family (out of the sax ladder); the synth's somber descending
  // figure is already on-brand, so copy it instead of sourcing.
  forfeit: { synth: true },
};
