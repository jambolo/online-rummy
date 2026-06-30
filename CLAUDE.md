# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Terminology (strict)

Use this vocabulary in **all documentation and user-facing UI strings**:

- **Game variation** — a distinct game in the suite (Classic Rummy, Gin Rummy, 500 Rummy, Knock Rummy, …). Never call one a "variant".
- **House rule** — a configurable rule option within a game variation (e.g. "Maximum one meld per turn", "Layoff requires prior meld", "Going Rummy bonus"). Never call one a "variant".

This convention governs prose and UI copy only. **Code identifiers keep their existing names** — `Variant` type, `variant` field, `VariantEngine`, `variantPublic`, `variantFns`, `variantLimits`, etc. — do not rename them. When prose names such an identifier, keep the identifier's spelling; describe the concept around it as a "game variation".

## Commands

```sh
# Install all packages (run from repo root)
pnpm install

# Build all packages
pnpm build

# Run all tests
pnpm test

# Run tests for a single package
pnpm --filter @online-rummy/server test
pnpm --filter @online-rummy/shared test

# Run a single test file
pnpm --filter @online-rummy/server exec vitest run src/engine/__tests__/basic.test.ts

# Run tests with coverage (server engine: 90% line/function, 85% branch thresholds)
pnpm --filter @online-rummy/server exec vitest run --coverage

# Type-check without emitting
pnpm --filter @online-rummy/server exec tsc --noEmit
pnpm --filter @online-rummy/client exec tsc --noEmit

# Start server (after build)
cd packages/server && node dist/index.js
# Required env vars: SESSION_SECRET (≥32 chars), ALLOWED_ORIGINS (comma-separated)
# Example (dev): SESSION_SECRET="dev-secret-32-chars-minimum-here" ALLOWED_ORIGINS="http://localhost:5173" node packages/server/dist/index.js

# Client dev server (connects directly to server on :8080)
pnpm --filter @online-rummy/client dev
# Optional: VITE_WS_URL=ws://localhost:8080 (default when env var absent)
```

## Architecture

pnpm monorepo with three packages: `shared`, `server`, `client`.

### `packages/shared`

Types + one runtime module (`meld.ts`). Consumed by both server and client.

- `cards.ts` — `Suit`, `Rank`, `Card`, `Meld`, `Phase`, `Variant`, `PublicState` (with discriminated `variantPublic`), `PrivateState`, `RANKS`, `RANK_INDEX`
- `protocol.ts` — `C2S` and `S2C` discriminated unions (field `t` is the tag). `PileSlice` for 500 Rummy pile-dive data.
- `meld.ts` — `validateMeld(cards, opts)` (`aceHigh`, `roundTheCorner`, `aceEitherEnd`), `cardPoints`, `MeldOptions`. Single runtime source for client + server; replaces the old `engine/meld.ts` and the three client-side mirrors deleted in the Phase 6 refactor.

### `packages/server`

Node.js 22 + native `ws`. No ORM, no DB — all state in memory.

**Engine** (`src/engine/`) is purely functional — no I/O, no sockets. Tests cover it directly.

| File | Purpose |
| --- | --- |
| `engine/types.ts` | `GameState` (discriminated union by `variant` with `variantState` pocket: `BasicState`, `Rum500State`, `GinState`), `GamePlayer`, `VariantEngine` interface (action handlers + lifecycle hooks), `ScoreSheet`, `WonHandData` |
| `engine/deck.ts` | `buildDeck`, `shuffle` (Fisher-Yates), `buildShuffledDeck`, `dealN` |
| `engine/util.ts` | Shared helpers: `requireTurn`, `lookupCard`, `advanceTurn`, `detectMeldKind`, `makeMeldId`, `buildBaseState` |
| `engine/layoff-error.ts` | `formatLayoffError(targetMeld, existingCards, incoming)` — detailed `ERR_INVALID_LAYOFF` builder used by every variant |
| `engine/dispatch.ts` | `applyAction(state, playerId, action): DispatchResult` — unified C2S → engine dispatcher used by both `ws.ts` and `scripted-player.ts` |
| `engine/scoring.ts` | Reusable scoring primitives: `deadwood(player, aceValue)`, `validateKnockMelds(state, player, groups, validate)` |
| `engine/variants/index.ts` | `VARIANTS: Record<Variant, VariantEngine>` registry + `isVariant`, `getVariant` |
| `engine/variants/basic.ts` | `basicVariant: VariantEngine`, `createBasicGame`, `applyDraw`, `applyMeld`, `applyLayoff`, `applyDiscard` |
| `engine/variants/rum500.ts` | `rum500Variant: VariantEngine`, `createRum500Game`, `applyDraw`, `applyDrawFromPile`, `applyMeld`, `applyLayoff`, `applyDiscard`, plus `r500(state)` narrowing helper. Also owns `runAceDirection`, `score500MeldCard`. |
| `engine/variants/gin.ts` | `ginVariant: VariantEngine`, `createGinGame`, `applyDraw`, `applyPassUpcard`, `applyDiscard`, `applyKnock(state, pid, melds?, discardId)`, `applyGinLayoff(state, pid, layoffs, ownMelds?)`, `ginDeadwood`, plus `gs(state)` narrowing helper. `applyMeld`/`applyLayoff` throw `ERR_NOT_SUPPORTED` (Gin declares melds at knock time only). |
| `engine/scripted-player.ts` | `runScript(state, C2S[])` — replay canned action sequences via `applyAction` |
| `rng.ts` | `RNG` type alias; wraps `node:crypto` `randomInt` |
| `session.ts` | `makeSessionId`, `signSessionId`, `verifySessionId` — HMAC-SHA256 session tokens |
| `room.ts` | `Room`/`Player` types (Room carries `gameState: GameState \| null`), Crockford base32 room codes, in-memory registry, `variantLimits` |
| `ws.ts` | `initWS(server, secret, origins)` — WS server, origin allowlist, per-IP cap (10), per-socket rate limit (20/s), `create`/`join`/`start`/`chat`/`keepalive`/`leave` handlers + a unified action case that routes every game action (`draw`, `drawFromPile`, `meld`, `layoff`, `discard`, `knock`, `ginLayoff`, `passUpcard`) through `applyAction` (`engine/dispatch.ts`). `buildVariantPublic(state)` projects the variant-specific public pocket; `handleHandEnd` calls `engine.winnerForHand` + `engine.handEndPayload` (no per-variation branching). `handleHandCancelled` handles Gin stock-depletion (no scoring, same dealer re-deals). `keepalive` is relayed to the **other** room players (sender excluded) so their sockets stay warm. `leave` cancels the game: broadcasts `playerLeft`, detaches every player's socket context, clears timers, and deletes the room. **Disconnect grace:** a socket close mid-game does **not** forfeit immediately — `handleDisconnect` broadcasts `playerDisconnected` and arms a `GAME_RECONNECT_MS` (60s) timer; `forfeitPlayer` (extracted; runs only on expiry, guarded against re-deal/hand-end races) drops the hand/melds, advances the turn, and ends the game if ≤1 active player remains. Within the window a `join`+`sessionId` rebinds the socket: server sends `lobby` (identity) + `playerReconnected` (to others) + `broadcastStateAll`. Reconnect is rejected once the player is forfeited or the room ended. Lobby drops still use the separate `LOBBY_RECONNECT_MS` (60s) removal timer. A stale-socket guard (`player.socket !== ws`) makes a superseded close a no-op so it can't clobber a live reconnect. |
| `index.ts` | HTTP server, `SESSION_SECRET`/`ALLOWED_ORIGINS`/`PORT` env validation, startup |

**`GameState` is mutated in place** by all `apply*` functions. Clone before passing to `runScript` if you need snapshot comparison.

The `VariantEngine` interface is the extension point for new game variations. Each variation owns `createGame`, `deal`, `validateMeld`, `canDrawFromDiscard`, `onDrawFromDiscard`, `canDiscard`, `scoreHand`, `isGameOver`, the full set of `apply*` action handlers (with optional `applyDrawFromPile`/`applyKnock`/`applyGinLayoff`/`applyPassUpcard`), and the lifecycle hooks `nextFirstPlayerIndex`, `winnerForHand`, `handEndPayload`. Adding a variation = new file under `variants/` + entry in `variants/index.ts`. `ws.ts` and `scripted-player.ts` reach the engine only through `applyAction` + the `VARIANTS` registry — no per-variation `if` ladders.

`vitest.config.ts` aliases `@online-rummy/shared` → `../shared/src/index.ts` so tests run without building shared first.

**Session delivery:** signed `sessionId` is sent in every `{ t: 'lobby' }` broadcast (not via HTTP cookie). Client stores it and passes in `join.sessionId` for lobby **or mid-game** reconnect. A mid-game reconnect also receives a `lobby` message (so a reloaded tab can resolve "me") followed by full state.

**State broadcast pattern:** `broadcastStateAll` (game start, post-forfeit, mid-game reconnect) sends `{ t: 'state', public, private }` to every connected player. `broadcastState` (per-action) sends `public` to all but `private` only to the acting player — other players' hands are unchanged mid-action.

### `packages/client`

React 19 + Vite + Zustand 5 + dnd-kit. Entry: `src/main.tsx` → `src/App.tsx`.

| File / dir | Purpose |
| --- | --- |
| `src/net/ws.ts` | `connect(url, callbacks)`, `send(msg)`, `disconnect()`. Callbacks are `{ onStatus(ConnStatus), onMessage(S2C) }` where `ConnStatus = 'connecting' \| 'connected' \| 'reconnecting' \| 'disconnected'`. **Auto-reconnect:** an unexpected close/error schedules a capped-backoff retry (`BACKOFFS_MS`, `MAX_RECONNECT_ATTEMPTS = 8` ≈ 60s to match the server grace), emitting `reconnecting` then `disconnected` once it gives up; `disconnect()` sets `manualClose` to suppress retries. Epoch counter prevents stale socket events from React StrictMode double-mount **and** dedupes the onerror+onclose pair fired for a single drop (`handleDrop` bumps it). Keep-alive: emits `{ t: 'keepalive' }` when nothing has been **sent** for 30s (keyed off last-sent, not last-received — so a receive-only player still emits, which the other side needs for silent-drop detection). |
| `src/store.ts` | Zustand store — all app state. `handleMessage(S2C)` is the single entry point for server messages. `cardCache` holds Card objects by id so melded cards (removed from hand) can still be rendered. Gin staging: `knockMelds`, `ginDefenderMelds`, `ginLayoffs` accumulate client-side declarations before submission; each has add/remove-by-index/clear actions. All three cleared on `draw` phase and `gameStarted`. `meldHighlights` + `meldHighlightOwnerId` track cards just placed (melded or laid off) in basic/rum500 mid-turn play and persist them through the **next** player's pre-draw window — cleared the moment that player draws, or whenever the hand starts/ends, or in Gin (which has no mid-turn melding). `connStatus` (set via `setConnStatus`, which also mirrors the legacy `connected` boolean for Home's form gating) holds the socket lifecycle from `ws.onStatus`. `opponentConn` holds an opponent who dropped mid-game within the server grace window — set on `playerDisconnected`, cleared on `playerReconnected`/`forfeit`/`gameOver`/leave. `playerLastSeen` tracks each player's last-heard time (refreshed by keepalive/event/chat and by every `state` broadcast for all non-self players); `checkDisconnects` (run every 30s from App) flags a non-forfeited player silent for >5min via `disconnectWarning`, cleared on the player's `forfeit`/`gameOver` or by dismiss — this is a slow backstop for the server's faster 60s grace path. `leaveGame` sends `{ t: 'leave' }` and resets to the start page. `sessionStorage` persists `sessionId`, `roomCode`, **and `playerName`** (the last is restored on first load so the create/join form re-populates across sessions). |
| `src/routes/Home.tsx` | Create/join forms. Shows error banner for pre-join errors. |
| `src/routes/Room.tsx` | Lobby view (while `publicState === null`) or game view. Contains `ScoreOverlay` (hand-end modal with per-player card breakdown) and `ConnectionBanner` (fixed banner, rendered in both views): `reconnecting` (amber) / `disconnected` + Reload button (red) from own `connStatus`, or "{opponent} disconnected — waiting…" (amber) from `opponentConn`. |
| `src/components/Card.tsx` | Playing card. `compact` prop hides center symbol and bottom corner for small meld-zone cards. `highlighted` prop draws an amber (`#e3a33b`) border + glow used by `MeldZone` to flag cards placed since the previous draw (basic/rum500 only). Always sets `textAlign: left` to override inherited centering from Table wrappers. |
| `src/components/Modal.tsx` | Shared modal primitive (NS-6 baseline): `position:fixed; inset:0; var(--scrim) backdrop; role="dialog"; aria-modal`. Focus trap (Tab/Shift+Tab cycle within), Esc-to-close, backdrop click closes, focus restoration on unmount. Consumed by `ConfirmModal`, `ScoreOverlay`, `HowToPlayModal`, `PileDiveModal`, `DisconnectWarningModal`. |
| `src/components/Hand.tsx` | dnd-kit sortable hand. `PointerSensor` with `distance: 6` activation so taps toggle selection without triggering drag. |
| `src/components/Table.tsx` | Stock pile + discard top. In 500 Rummy, clicking discard opens `PileDiveModal`; otherwise sends `draw {from:'discard'}`. |
| `src/components/PileDiveModal.tsx` | 500 Rummy pile-dive picker (rules.md A.4.4). Shows full discard pile top-first; hovering a card highlights every card that will be taken. |
| `src/components/MeldZone.tsx` | All players' melds. Uses `meld.cards[]` from public state. Layoff button shown when allowed: basic requires own meld, 500 Rummy does not. Reads `meldHighlights` and renders matching cards via `<Card highlighted>` so the just-placed cards visibly persist until the next player draws (basic/rum500 only). In 500 Rummy, displays meld point total per player. During Gin `layoff` phase: staged `ginDefenderMelds` render as dashed-border pending piles; staged `ginLayoffs` render as semi-transparent cards appended to their target knocker meld. Internally uses shared `validateMeld` (from `@online-rummy/shared`) with Gin opts (`aceHigh:false, roundTheCorner:false`) to gate the layoff `+` button during Gin layoff phase. |
| `src/components/ActionBar.tsx` | Phase-aware action buttons. 500 Rummy: multiple melds per turn; discard disabled when `mustMeldCardId` is set. Gin: `firstUpcardOffer` take/pass, knock meld-group builder (chips with × per group, live deadwood indicator, knock button when deadwood ≤ 10), defender layoff-phase UI (own-meld chips with ×, staged layoff chips with ×, submit sends one `ginLayoff` message). **Discard layoff guard** (non-gin): if the selected card could be laid off onto a meld on the table at that point (`canLayoffCard` — basic needs an own meld, 500 Rummy any meld, validated with the variant's meld opts), discarding opens a confirmation modal ("…can be laid off on a meld. Discard it anyway?") before sending `discard`; Cancel aborts. Gin discards (the knock card) bypass the guard. |
| `src/components/Chat.tsx` | Chat message list + send form. Title and placeholder copy ("The Backroom", thematic empty-state) read from `src/content/copy.ts`. On `mobile` breakpoint (`useBreakpoint`) collapses into a bottom-sheet drawer with a header toggle; desktop keeps the 220-wide side panel. |
| `src/theme/tokens.ts` | Typed `t.*` map of `var(--token)` strings (colors, text-ramp, surfaces, radii, z-index). All inline styles consume this map; raw hex/magic-number literals stay in `index.html` `:root` or `tokens.ts` itself. NS-1 foundation. |
| `src/theme/variations.ts` | Per-game-variation identity: `variationAccent(variant)` (cyan/orange/amber), `variationLabel(variant)` (friendly display name). NS-7. |
| `src/theme/useBreakpoint.ts` | Scalar `useBreakpoint() → 'mobile' \| 'tablet' \| 'desktop'` via `matchMedia` (≤640 / ≤900 / >900). NS-4. |
| `src/theme/useReducedMotion.ts` | Scalar `useReducedMotion() → boolean` for `prefers-reduced-motion`. NS-6; contract surface for NS-3 PixiJS work. |
| `src/content/copy.ts` | Central thematic-copy module (T-GAP-2). Single source of truth for Home/Chat/banner prose ("Enter the High-Stakes Room", "The Backroom", …) and the reserved NS-5 rank ladder array. |
| `src/components/HowToPlayModal.tsx` | Game-variation-keyed modal. Renders `src/content/howToPlay/{basic,gin,rum500}.tsx`. All three game variations have full content. |
| `src/content/howToPlay/basic.tsx` | Static Basic Rummy rules fragment — objective, turn flow, melds, scoring, locked house rules. |
| `src/content/howToPlay/rum500.tsx` | Static 500 Rummy rules fragment — pile dive, ace-either-end, multi-meld turns, layoff credit. |
| `src/content/howToPlay/gin.tsx` | Static Gin Rummy rules fragment — upcard offer, knock/gin/undercut scoring, layoff after knock, stock-depletion cancel, locked house rules. |

**Selector rule:** never pass an object literal to `useAppStore` — it creates a new ref every render and causes an infinite loop with React 18's `useSyncExternalStore`. Use one hook call per value.

**WS URL:** `App.tsx` derives it as `VITE_WS_URL` if set, else `wss://<hostname>` when the page is served over HTTPS, otherwise `ws://<hostname>:8080`. No Vite proxy — client connects directly to the server port; `ALLOWED_ORIGINS` on the server permits the Vite dev origin.

## Docs

| File | Purpose |
| --- | --- |
| `docs/rules.md` | Canonical game rules for all game variations, with section IDs used in code comments |
| `docs/plan.md` | Architecture decisions, house rule picks, milestone scope, open items |
| `docs/client-server-protocol.md` | Complete WS protocol reference for client developers — all C2S/S2C messages, error codes, session management, turn flow examples |
| `docs/branding.md` | Brand guidelines — colors, typography, logo usage |

## Assets

Source art lives in `assets/` (not served directly). Deployed copies in `packages/client/public/`.

| Path | Purpose |
| --- | --- |
| `assets/rum-runner-banner.png` | Wide landscape banner — used at top of Home page |
| `assets/rum-runner-logo.png` | Circular logo — used in Home card header, Lobby card, game header |
| `assets/rum-runner-icon.png` | Square icon — source for favicon generation |
| `assets/favicon/` | Generated favicon package (ico, svg, png 96px, apple-touch 180px, web-app-manifest 192/512px, site.webmanifest) |

Favicon files are copied verbatim to `packages/client/public/` and linked in `packages/client/index.html`. When regenerating favicons, copy new files to both `assets/favicon/` and `packages/client/public/`.

## Key constraints

- **Build order:** `pnpm --filter @online-rummy/shared build` must run before `tsc --noEmit` on server or client. Server imports from `@online-rummy/shared` dist, not source; stale or missing dist causes `TS2353` "property does not exist" errors on types that exist in source but not yet compiled output. `vitest` bypasses this via path alias in `vitest.config.ts`.
- `strict: true` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` everywhere. No `any` without a comment.
- All imports within the monorepo use `.js` extensions (NodeNext resolution).
- Server shuffles with `node:crypto` only — never `Math.random`.
- All rule citations in code use `// rules.md A.x.y` section IDs.
- Engine errors are thrown as `Error` with `ERR_*` prefixed messages (e.g. `ERR_NOT_YOUR_TURN`, `ERR_WRONG_PHASE`). The WS layer translates these to `{ t: 'error', code, msg }`.
- **Disconnect grace, not instant forfeit.** A mid-game socket drop opens a 60s server grace window (`playerDisconnected` event + `reconnectTimers` entry) during which a `join`+`sessionId` resumes the same hand; only on expiry does `forfeitPlayer` apply the rules.md disconnect penalty (hand + melds removed from play, NOT returned to stock). The client auto-reconnects through this window and shows a `ConnectionBanner`. Lobby drops keep their own 60s removal timer. Pre-existing tests that closed a socket mid-game and expected an immediate `forfeit` no longer hold — closing now yields `playerDisconnected` first.
- `GameState.drewFromDiscardId` enforces the basic-rummy rule "no re-discard of drawn discard card" (rules.md A.1.6 step 4; 500 Rummy behavior differs — see below).
- **Going Rummy detection** (rules.md A.1.7) uses `state.meldedBy` — if no entry maps to the winner's id, the winner placed no card all hand → score × 2. The previous `hasMeldedEver` flag has been removed (Phase 0 refactor). The "layoff-requires-prior-meld" house rule (rules.md A.1.6 step 3) is documented but not scaffolded; add it when first needed.
- Going-rummy bonus = doubled per-opponent contribution (basic rules.md A.1.7), implemented as score×2 on the winner's hand-end credit.
- `GameState.firstPlayerId` records who went first each hand; re-deal path in `ws.ts` uses it to rotate the starting player clockwise.
- `createBasicGame` / `createRum500Game` take optional `firstPlayerIndex?: number`. When omitted, calls `rng(0, players.length)` (exclusive hi). Pass it explicitly in tests to skip the RNG call and preserve the pre-existing deck order.
- **Variant state pocket (Phase 5 refactor).** `GameState` is a discriminated union by `variant`, and every per-variation field lives in a typed `variantState` pocket: `BasicState = Record<string, never>`, `Rum500State = { mustMeldCardId }`, `GinState = { ginKnockerId, cancelledHand }`. The variant modules expose narrowing helpers (`r500(state)`, `gs(state)`) to read their pocket and throw `ERR_VARIANT_MISMATCH:<id>` on mismatch. The same pattern lifts to the wire: `PublicState.variantPublic` is a discriminated union (`{ variant: 'basic'; data: {} } | { variant: 'rum500'; data: { mustMeldCardId } } | { variant: 'gin'; data: { ginKnockerId } }`). Clients MUST narrow on `variantPublic.variant` before reading `.data`. Top-level `PublicState` no longer carries `mustMeldCardId` or `ginKnockerId`.
- 500 Rummy (rules.md A.4) — `r500(state).mustMeldCardId` enforces the **pile-dive** must-use restriction (rules.md A.4.4 "Pile dive"). It is set **only** by `applyDrawFromPile` (a true pile dive, ≥2 cards). A simple top-card draw via `applyDraw {from:'discard'}` does NOT set `mustMeldCardId` — it sets only `drewFromDiscardId` (no re-discard same turn). The "unified obligation" house rule (rules.md A.4.4) that would extend must-use to top-card draws is **NOT currently enforced**. `GameState.meldedBy: Map<cardId, PlayerId>` credits layoff points to the placer, not the meld's original owner. Ace direction in runs is derived per meld from `runAceDirection`: A-2-3 → low (1 pt), Q-K-A → high (15 pts). Sets of aces always 15 pt; aces in hand always 15 pt.
- Gin (rules.md A.2) — 2P only, ace low only. Hand opens at phase `firstUpcardOffer` (rules.md A.2.2): non-dealer offered the initial upcard first, then dealer; both decline → phase becomes `draw` with non-dealer playing first. C2S `passUpcard` declines. **No mid-turn melding** — `applyMeld`/`applyLayoff` always throw `ERR_NOT_SUPPORTED`; melds are declared at knock time via `applyKnock(state, pid, melds?, discardId)`. `discardId` is required: the knocked card is removed from hand and pushed to discard pile before deadwood is computed from the remaining 10 cards (rules.md A.2.4). Card must not be in any declared meld (`ERR_CANNOT_DISCARD_MELDED_CARD`). After **any** knock, phase = `layoff` and turn switches to the defender, who submits `ginLayoff` (rules.md A.2.4 step 3). The defender always declares own melds (`ownMelds?: string[][]`) to reduce deadwood; after a **regular** knock they may also lay off onto the knocker's melds. `applyGinLayoff` validates and applies `ownMelds` first, then `layoffs`; `ERR_CARD_IN_MULTIPLE_MELDS` if a card appears in both. **No layoff against gin**: when the knocker went gin (deadwood 0), a non-empty `layoffs` throws `ERR_NO_LAYOFF_AGAINST_GIN` (own melds still allowed — they reduce the defender's counted deadwood). Phase falls back to `ended` directly only when there is no active defender (e.g. forfeit). `gs(state).ginKnockerId` records the knocker (needed because `turnPlayerId` switches to defender). `gs(state).cancelledHand` is set when `applyDiscard` reduces stock to ≤2 without a knock (rules.md A.2.3 stock-depletion); the WS layer emits `handCancelled` and the next `start` re-deals with the same dealer. Re-deal first-player rotation in `ws.ts`: Gin winner deals next hand → loser plays first (rules.md A.2.2); cancelled hand keeps same dealer. Scoring (`ginVariant.scoreHand`) covers gin/regular knock/undercut + box (+20) + game bonus (+100 at cumulative ≥100) + shutout (+100 `[BIC-G]`).
- `PublicState.discardPile: Card[]` is always populated (full visible pile) — basic clients ignore it; 500 Rummy pile-dive UI reads it. The `layoff` phase + score overlay read the knocker from `variantPublic.data.ginKnockerId` (gin pocket).

## Milestones

| # | Status | Scope |
| --- | --- | --- |
| M1 | Done | shared types, engine (deck/meld/basic game variation), scripted-player, tests |
| M2 | Done | WS server, room create/join, lobby, in-memory registry |
| M3 | Done | Wire engine to WS; 2-browser basic rummy |
| M4 | Done | React client: hand fan, drag-drop, discard, meld zone, chat, score overlay |
| M4.5 | Done | Re-deal, first-player rotation, How to Play modal (Basic), bug fixes |
| M5 | Done | 500 Rummy game variation — pile-dive UX, ace-either-end melds, multi-meld turns, layoff credit, How to Play |
| M6 | Done | Gin game variation |
| M7 | Done | Deploy via Cloudflare Tunnel + manual local host (no structured logs, no metrics) |
| M8 | Not started | PixiJS card layer |
