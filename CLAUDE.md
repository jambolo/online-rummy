# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

Types only — no runtime logic. Consumed by both server and client.

- `cards.ts` — `Suit`, `Rank`, `Card`, `Meld`, `Phase`, `Variant`, `PublicState`, `PrivateState`, `RANKS`, `RANK_INDEX`
- `protocol.ts` — `C2S` and `S2C` discriminated unions (field `t` is the tag). `PileSlice` for 500 Rum pile-dive data.

### `packages/server`

Node.js 22 + native `ws`. No ORM, no DB — all state in memory.

**Engine** (`src/engine/`) is purely functional — no I/O, no sockets. Tests cover it directly.

| File | Purpose |
| --- | --- |
| `engine/types.ts` | `GameState`, `GamePlayer`, `VariantEngine` interface, `ScoreSheet` |
| `engine/deck.ts` | `buildDeck`, `shuffle` (Fisher-Yates), `buildShuffledDeck`, `dealN` |
| `engine/meld.ts` | `validateMeld(cards, opts)` (`aceEitherEnd` for 500 Rum runs), `cardPoints`, `runAceDirection`, `score500MeldCard` |
| `engine/variants/basic.ts` | `basicVariant: VariantEngine`, `createBasicGame`, `applyDraw`, `applyMeld`, `applyLayoff`, `applyDiscard` |
| `engine/variants/rum500.ts` | `rum500Variant: VariantEngine`, `createRum500Game`, `applyDraw`, `applyDrawFromPile`, `applyMeld`, `applyLayoff`, `applyDiscard` |
| `engine/variants/gin.ts` | `ginVariant: VariantEngine`, `createGinGame`, `applyDraw`, `applyPassUpcard`, `applyDiscard`, `applyKnock(state, pid, melds?, discardId)`, `applyGinLayoff(state, pid, layoffs, ownMelds?)`, `ginDeadwood`. `applyMeld`/`applyLayoff` throw `ERR_NOT_SUPPORTED` (Gin declares melds at knock time only). |
| `engine/scripted-player.ts` | `runScript(state, C2S[])` — replay canned action sequences; dispatches per-variant via `state.variant` |
| `rng.ts` | `RNG` type alias; wraps `node:crypto` `randomInt` |
| `session.ts` | `makeSessionId`, `signSessionId`, `verifySessionId` — HMAC-SHA256 session tokens |
| `room.ts` | `Room`/`Player` types (Room carries `gameState: GameState \| null`), Crockford base32 room codes, in-memory registry, `variantLimits` |
| `ws.ts` | `initWS(server, secret, origins)` — WS server, origin allowlist, per-IP cap (10), per-socket rate limit (20/s), `create`/`join`/`start`/`chat`/`keepalive`/`leave`/`draw`/`drawFromPile`/`meld`/`layoff`/`discard`/`knock`/`ginLayoff`/`passUpcard`/disconnect handlers. `variantFns(v)` routes engine calls per variant. `handleHandCancelled` handles Gin stock-depletion (no scoring, same dealer re-deals). `keepalive` is relayed to the **other** room players (sender excluded) so their sockets stay warm. `leave` cancels the game: broadcasts `playerLeft`, detaches every player's socket context, clears timers, and deletes the room. |
| `index.ts` | HTTP server, `SESSION_SECRET`/`ALLOWED_ORIGINS`/`PORT` env validation, startup |

**`GameState` is mutated in place** by all `apply*` functions. Clone before passing to `runScript` if you need snapshot comparison.

The `VariantEngine` interface is the extension point for Gin and 500 Rum. Each variant owns `deal`, `validateMeld`, `canDrawFromDiscard`, `onDrawFromDiscard`, `canDiscard`, `scoreHand`, `isGameOver`.

`vitest.config.ts` aliases `@online-rummy/shared` → `../shared/src/index.ts` so tests run without building shared first.

**Session delivery:** signed `sessionId` is sent in every `{ t: 'lobby' }` broadcast (not via HTTP cookie). Client stores it and passes in `join.sessionId` for lobby reconnect.

**State broadcast pattern:** `broadcastStateAll` (game start, post-forfeit) sends `{ t: 'state', public, private }` to every connected player. `broadcastState` (per-action) sends `public` to all but `private` only to the acting player — other players' hands are unchanged mid-action.

### `packages/client`

React 19 + Vite + Zustand 5 + dnd-kit. Entry: `src/main.tsx` → `src/App.tsx`.

| File / dir | Purpose |
| --- | --- |
| `src/net/ws.ts` | `connect(url, callbacks)`, `send(msg)`, `disconnect()`. Epoch counter prevents stale socket events from React StrictMode double-mount. Keep-alive: emits `{ t: 'keepalive' }` when nothing has been **sent** for 30s (keyed off last-sent, not last-received — so a receive-only player still emits, which the other side needs for silent-drop detection). |
| `src/store.ts` | Zustand store — all app state. `handleMessage(S2C)` is the single entry point for server messages. `cardCache` holds Card objects by id so melded cards (removed from hand) can still be rendered. Gin staging: `knockMelds`, `ginDefenderMelds`, `ginLayoffs` accumulate client-side declarations before submission; each has add/remove-by-index/clear actions. All three cleared on `draw` phase and `gameStarted`. `playerLastSeen` tracks each player's last-heard time (refreshed by keepalive/event/chat and by every `state` broadcast for all non-self players); `checkDisconnects` (run every 30s from App) flags a non-forfeited player silent for >5min via `disconnectWarning`, cleared on the player's `forfeit`/`gameOver` or by dismiss. `leaveGame` sends `{ t: 'leave' }` and resets to the start page. |
| `src/routes/Home.tsx` | Create/join forms. Shows error banner for pre-join errors. |
| `src/routes/Room.tsx` | Lobby view (while `publicState === null`) or game view. Contains `ScoreOverlay` (hand-end modal with per-player card breakdown). |
| `src/components/Card.tsx` | Playing card. `compact` prop hides center symbol and bottom corner for small meld-zone cards. Always sets `textAlign: left` to override inherited centering from Table wrappers. |
| `src/components/Hand.tsx` | dnd-kit sortable hand. `PointerSensor` with `distance: 6` activation so taps toggle selection without triggering drag. |
| `src/components/Table.tsx` | Stock pile + discard top. In 500 Rum, clicking discard opens `PileDiveModal`; otherwise sends `draw {from:'discard'}`. |
| `src/components/PileDiveModal.tsx` | 500 Rum pile-dive picker (rules.md A.4.4). Shows full discard pile top-first; hovering a card highlights every card that will be taken. |
| `src/components/MeldZone.tsx` | All players' melds. Uses `meld.cards[]` from public state. Layoff button shown when allowed: basic requires own meld, 500 Rum does not. During Gin `layoff` phase: staged `ginDefenderMelds` render as dashed-border pending piles; staged `ginLayoffs` render as semi-transparent cards appended to their target knocker meld. |
| `src/components/ActionBar.tsx` | Phase-aware action buttons. 500 Rum: multiple melds per turn; discard disabled when `mustMeldCardId` is set. Gin: `firstUpcardOffer` take/pass, knock meld-group builder (chips with × per group, live deadwood indicator, knock button when deadwood ≤ 10), defender layoff-phase UI (own-meld chips with ×, staged layoff chips with ×, submit sends one `ginLayoff` message). |
| `src/components/Chat.tsx` | Chat message list + send form. |
| `src/components/HowToPlayModal.tsx` | Variant-keyed modal. Renders `src/content/howToPlay/{basic,gin,rum500}.tsx`. All three variants have full content. |
| `src/content/howToPlay/basic.tsx` | Static Basic Rummy rules fragment — objective, turn flow, melds, scoring, locked house rules. |
| `src/content/howToPlay/rum500.tsx` | Static 500 Rum rules fragment — pile dive, ace-either-end, multi-meld turns, layoff credit. |
| `src/content/howToPlay/gin.tsx` | Static Gin Rummy rules fragment — upcard offer, knock/gin/undercut scoring, layoff after knock, stock-depletion cancel, locked house rules. |

**Selector rule:** never pass an object literal to `useAppStore` — it creates a new ref every render and causes an infinite loop with React 18's `useSyncExternalStore`. Use one hook call per value.

**WS URL:** `App.tsx` derives it as `VITE_WS_URL` if set, else `wss://<hostname>` when the page is served over HTTPS, otherwise `ws://<hostname>:8080`. No Vite proxy — client connects directly to the server port; `ALLOWED_ORIGINS` on the server permits the Vite dev origin.

## Docs

| File | Purpose |
| --- | --- |
| `docs/rules.md` | Canonical game rules for all variants, with section IDs used in code comments |
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
- `GameState.drewFromDiscardId` enforces the basic-rummy rule "no re-discard of drawn discard card" (rules.md A.1.6 step 4; 500 Rum behavior differs — see below).
- **Going Rummy detection** (rules.md A.1.7) uses `state.meldedBy` — if no entry maps to the winner's id, the winner placed no card all hand → score × 2. The previous `hasMeldedEver` flag has been removed (Phase 0 refactor). The "layoff-requires-prior-meld" house rule (rules.md A.1.6 step 3) is documented but not scaffolded; add it when first needed.
- Going-rummy bonus = doubled per-opponent contribution (basic rules.md A.1.7), implemented as score×2 on the winner's hand-end credit.
- `GameState.firstPlayerId` records who went first each hand; re-deal path in `ws.ts` uses it to rotate the starting player clockwise.
- `createBasicGame` / `createRum500Game` take optional `firstPlayerIndex?: number`. When omitted, calls `rng(0, players.length)` (exclusive hi). Pass it explicitly in tests to skip the RNG call and preserve the pre-existing deck order.
- 500 Rum (rules.md A.4) — `GameState.mustMeldCardId` enforces the **pile-dive** must-use restriction (rules.md A.4.4 "Pile dive"). It is set **only** by `applyDrawFromPile` (a true pile dive, ≥2 cards). A simple top-card draw via `applyDraw {from:'discard'}` does NOT set `mustMeldCardId` — it sets only `drewFromDiscardId` (no re-discard same turn). The "unified obligation" house rule (rules.md A.4.4) that would extend must-use to top-card draws is **NOT currently enforced**. `GameState.meldedBy: Map<cardId, PlayerId>` credits layoff points to the placer, not the meld's original owner. Ace direction in runs is derived per meld from `runAceDirection`: A-2-3 → low (1 pt), Q-K-A → high (15 pts). Sets of aces always 15 pt; aces in hand always 15 pt.
- Gin (rules.md A.2) — 2P only, ace low only. Hand opens at phase `firstUpcardOffer` (rules.md A.2.2): non-dealer offered the initial upcard first, then dealer; both decline → phase becomes `draw` with non-dealer playing first. C2S `passUpcard` declines. **No mid-turn melding** — `applyMeld`/`applyLayoff` always throw `ERR_NOT_SUPPORTED`; melds are declared at knock time via `applyKnock(state, pid, melds?, discardId)`. `discardId` is required: the knocked card is removed from hand and pushed to discard pile before deadwood is computed from the remaining 10 cards (rules.md A.2.4). Card must not be in any declared meld (`ERR_CANNOT_DISCARD_MELDED_CARD`). After a non-gin knock, phase = `layoff` and turn switches to the defender, who submits `ginLayoff` to declare own melds (`ownMelds?: string[][]`) and lay off onto knocker's melds (rules.md A.2.4 step 3). `applyGinLayoff` validates and applies `ownMelds` first, then `layoffs`; `ERR_CARD_IN_MULTIPLE_MELDS` if a card appears in both. Gin (0 deadwood) skips the layoff phase. `GameState.ginKnockerId` records the knocker (needed because `turnPlayerId` switches to defender). `GameState.cancelledHand` is set when `applyDiscard` reduces stock to ≤2 without a knock (rules.md A.2.3 stock-depletion); the WS layer emits `handCancelled` and the next `start` re-deals with the same dealer. Re-deal first-player rotation in `ws.ts`: Gin winner deals next hand → loser plays first (rules.md A.2.2); cancelled hand keeps same dealer. Scoring (`ginVariant.scoreHand`) covers gin/regular knock/undercut + box (+20) + game bonus (+100 at cumulative ≥100) + shutout (+100 `[BIC-G]`).
- `PublicState.discardPile: Card[]` is always populated (full visible pile) — basic clients ignore it; 500 Rum pile-dive UI reads it. `PublicState.ginKnockerId` mirrors `GameState.ginKnockerId` for the client (used during `layoff` phase + score overlay).

## Milestones

| # | Status | Scope |
| --- | --- | --- |
| M1 | Done | shared types, engine (deck/meld/basic variant), scripted-player, tests |
| M2 | Done | WS server, room create/join, lobby, in-memory registry |
| M3 | Done | Wire engine to WS; 2-browser basic rummy |
| M4 | Done | React client: hand fan, drag-drop, discard, meld zone, chat, score overlay |
| M4.5 | Done | Re-deal, first-player rotation, How to Play modal (Basic), bug fixes |
| M5 | Done | 500 Rum variant — pile-dive UX, ace-either-end melds, multi-meld turns, layoff credit, How to Play |
| M6 | Done | Gin variant |
| M7 | Done | Deploy via Cloudflare Tunnel + manual local host (no structured logs, no metrics) |
| M8 | Not started | PixiJS card layer |
