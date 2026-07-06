# Sound Source Provenance

Originals for the 21 UI sound effects, kept per the source-policy in `docs/sound-effects-sourced-audio-plan.md`. Only the selected files are stored here; the full packs are freely redownloadable from the URLs below. Processing (trim, RMS normalization, fades, WAV encode) is defined in `packages/client/scripts/sound-manifest.mjs` + `process-sounds.mjs`.

All sources are **CC0 1.0 Universal** (public domain dedication) by Kenney (kenney.nl). License verified on each pack page, 2026-07-05.

| Directory | Pack | Source URL | License | Files used |
| --- | --- | --- | --- | --- |
| `kenney-casino-audio/` | Kenney — Casino Audio | https://kenney.nl/assets/casino-audio | CC0 1.0 | card-slide-4/6, card-shove-4, card-fan-1, card-place-1/2, card-shuffle |
| `kenney-interface-sounds/` | Kenney — Interface Sounds | https://kenney.nl/assets/interface-sounds | CC0 1.0 | scroll_001 (hand-cancelled), glass_002/004/005 |
| `custom/` | Self-recorded (repo owner) | — | owner-granted CC0-equivalent | knock-source.wav (single knuckle knock on wood, recorded 2026-07-05; doubled via the manifest `repeat` param) |
| `kenney-music-jingles/` | Kenney — Music Jingles | https://kenney.nl/assets/music-jingles | CC0 1.0 | jingles_SAX02/06/07/10/14 (sax set) |

CC0 requires no attribution; recorded anyway for auditability. If a future sound is sourced from anywhere other than a Kenney pack (e.g. freesound.org), add a row here with the exact file URL, the license shown on the file page, and the verification date.

Retained on disk but no longer mapped in `sound-manifest.mjs`, per the branding audit (`docs/branding.md` § Sonic Branding): `kenney-interface-sounds/bong_001.ogg` (interim knock tone, replaced by the self-recorded `custom/knock-source.wav`), `kenney-interface-sounds/confirmation_001.ogg`, `confirmation_003.ogg`, `pluck_002.ogg`, `error_003.ogg`, `minimize_006.ogg`, `maximize_006.ogg` (`your-turn`/`player-joined`/`chat` moved to glassware, `error`/`disconnect`/`reconnect` moved to the synth basement-hum family) and `kenney-music-jingles/jingles_SAX01.ogg` (`forfeit` moved to the synth basement-hum family, out of the sax ladder). Left in place for provenance/history.

## Selection method

Curated programmatically (no listening pass): per-file duration, RMS, and head/tail fundamental-frequency trend classified jingles as ascending (wins), descending (losses), or flat (neutral); card sounds were matched by recorded action semantics (slide/place/shove/fan/shuffle). The mapping rationale is commented per entry in `sound-manifest.mjs`. Swap any `src` there and re-run `node packages/client/scripts/process-sounds.mjs` to override a choice by ear.
