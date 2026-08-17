# packages/client

React 19 + Vite + Zustand 5 + dnd-kit. Entry: `src/main.tsx` → `src/App.tsx`.

## Gotchas

- **Selector rule:** never pass an object literal to `useAppStore` — it creates a new ref every render and causes an infinite loop with React 18's `useSyncExternalStore`. Use one hook call per value.
- **WS URL:** `App.tsx` derives it as `VITE_WS_URL` if set, else `wss://<hostname>` when the page is served over HTTPS, otherwise `ws://<hostname>:8080`. There is no Vite proxy — the client connects directly to the server port, and `ALLOWED_ORIGINS` on the server is what permits the Vite dev origin.
- **Keep-alive is keyed off last-*sent*, not last-received** (`src/net/ws.ts`). A receive-only player must still emit `{ t: 'keepalive' }`, because the other side needs it for silent-drop detection.
- `src/audio/soundMap.ts` is deliberately free of asset imports so node-env tests can load it. Keep asset URLs in `sounds.ts`.
- `Card.tsx` always sets `textAlign: left` to override inherited centering from the Table wrappers.
- `Hand.tsx` uses `PointerSensor` with `distance: 6` activation so taps toggle selection without triggering a drag.
- `PublicState.variantPublic` is a discriminated union — narrow on `.variant` before reading `.data` (see `packages/server/CLAUDE.md`).

## Client-side state lifecycles

- `handleMessage(S2C)` in `src/store.ts` is the single entry point for server messages. The **first** thing it does — before the switch mutates state — is call `soundForMessage(msg, ctx)` with the genuinely-previous state and `playSound` the result. Keep it first.
- `cardCache` holds Card objects by id so melded cards (removed from hand) can still be rendered.
- Gin staging (`knockMelds`, `ginDefenderMelds`, `ginLayoffs`) accumulates client-side declarations before submission. All three are cleared on the `draw` phase and on `gameStarted`.
- `meldHighlights` / `meldHighlightOwnerId` track just-placed cards in basic/rum500 mid-turn play and persist them through the **next** player's pre-draw window — cleared the moment that player draws, or whenever the hand starts or ends. Gin has no mid-turn melding, so it never sets them.
- `playerLastSeen` + `checkDisconnects` (run every 30s from `App`) flag a non-forfeited player silent for >5min via `disconnectWarning`. This is a slow backstop for the server's faster 60s grace path, not a replacement for it.
- `sessionStorage` persists `sessionId`, `roomCode`, and `playerName` — the last is restored on first load so the create/join form re-populates across sessions.

## Audio

One lazily-created `AudioContext` feeds a master `GainNode` (`gain.value = muted ? 0 : volume * volume`, a perceptual curve) that every `AudioBufferSourceNode` connects through — so a mute or volume change reaches sounds already in flight. Each source also routes through one of two per-category buses chosen by the exhaustive `gainBus()` switch: `action` (draw/pile-dive/meld/layoff/discard/deal) vs `alert` (everything else); `action` cues get a ±4% per-play `playbackRate` jitter so repeats don't sound identical.

`holdPolicy.ts`'s `createHoldGate(schedule)` enforces one-sound-per-moment (branding.md §4): `action` cues hold for 80 ms unless an `outcome` cue arrives first, which cancels every held action and plays itself immediately. The scheduler is injected (real timers from `sounds.ts`, a fake one in tests) so the gate itself is synchronous and unit-testable. `cueFamily()` and `gainBus()` are exhaustive switches with no `default` — adding a `SoundId` must fail the type-check until both are updated.

Assets are 21 wavs sourced from Kenney CC0 packs (provenance: `assets/sounds-src/PROVENANCE.md`). Regenerate with `node packages/client/scripts/process-sounds.mjs`; `scripts/generate-sounds.mjs` is the zero-dep synth fallback for any id lacking a good sourced sample.

## Conventions

- All inline styles consume the typed `t.*` map in `src/theme/tokens.ts`. Raw hex and magic-number literals belong in `index.html`'s `:root` or in `tokens.ts` itself — not in components.
- Thematic prose (Home/Chat/banner copy) has a single source of truth in `src/content/copy.ts`. Don't inline user-facing strings in components.
- House-rule UI renders editors from `supportedDefs` only, and derives every deviation display by diffing against the registry canonicals — never hardcode a canonical value.
- Meld validation uses the shared `validateMeld` from `@online-rummy/shared`. The three former client-side mirrors were deleted in the Phase 6 refactor; don't reintroduce one.
- Tests live next to their module (`src/**/*.test.ts`), node environment.
