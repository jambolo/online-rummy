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

Node.js 20 + native `ws`. No ORM, no DB — all state in memory.

**Engine** (`src/engine/`) is purely functional — no I/O, no sockets. Tests cover it directly.

| File | Purpose |
| --- | --- |
| `engine/types.ts` | `GameState`, `GamePlayer`, `VariantEngine` interface, `ScoreSheet` |
| `engine/deck.ts` | `buildDeck`, `shuffle` (Fisher-Yates), `buildShuffledDeck`, `dealN` |
| `engine/meld.ts` | `validateMeld(cards, opts)`, `cardPoints` |
| `engine/variants/basic.ts` | `basicVariant: VariantEngine`, `createBasicGame`, `applyDraw`, `applyMeld`, `applyLayoff`, `applyDiscard` |
| `engine/scripted-player.ts` | `runScript(state, C2S[])` — replay canned action sequences for tests |
| `rng.ts` | `RNG` type alias; wraps `node:crypto` `randomInt` |
| `session.ts` | `makeSessionId`, `signSessionId`, `verifySessionId` — HMAC-SHA256 session tokens |
| `room.ts` | `Room`/`Player` types (Room carries `gameState: GameState \| null`), Crockford base32 room codes, in-memory registry, `variantLimits` |
| `ws.ts` | `initWS(server, secret, origins)` — WS server, origin allowlist, per-IP cap (10), per-socket rate limit (20/s), `create`/`join`/`start`/`chat`/`draw`/`meld`/`layoff`/`discard`/disconnect handlers |
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
| `src/net/ws.ts` | `connect(url, callbacks)`, `send(msg)`, `disconnect()`. Epoch counter prevents stale socket events from React StrictMode double-mount. |
| `src/store.ts` | Zustand store — all app state. `handleMessage(S2C)` is the single entry point for server messages. `cardCache` holds Card objects by id so melded cards (removed from hand) can still be rendered. |
| `src/routes/Home.tsx` | Create/join forms. Shows error banner for pre-join errors. |
| `src/routes/Room.tsx` | Lobby view (while `publicState === null`) or game view. Contains `ScoreOverlay` (hand-end modal with per-player card breakdown). |
| `src/components/Card.tsx` | Playing card. `compact` prop hides center symbol and bottom corner for small meld-zone cards. Always sets `textAlign: left` to override inherited centering from Table wrappers. |
| `src/components/Hand.tsx` | dnd-kit sortable hand. `PointerSensor` with `distance: 6` activation so taps toggle selection without triggering drag. |
| `src/components/Table.tsx` | Stock pile + discard top. Clickable on draw phase. |
| `src/components/MeldZone.tsx` | All players' melds. Uses `meld.cards[]` from public state (populated by server) — no client-side cache needed for opponent melds. |
| `src/components/ActionBar.tsx` | Phase-aware action buttons. Shows current phase name and whose turn it is. |
| `src/components/Chat.tsx` | Chat message list + send form. |
| `src/components/HowToPlayModal.tsx` | Variant-keyed modal. Renders `src/content/howToPlay/{basic,gin,rum500}.tsx`. Basic content complete; Gin/500 Rum stubbed for M5/M6. |
| `src/content/howToPlay/basic.tsx` | Static Basic Rummy rules fragment — objective, turn flow, melds, scoring, locked house rules. |

**Selector rule:** never pass an object literal to `useAppStore` — it creates a new ref every render and causes an infinite loop with React 18's `useSyncExternalStore`. Use one hook call per value.

**WS URL:** defaults to `ws://${hostname}:8080`. Override with `VITE_WS_URL` env var. No Vite proxy — client connects directly to the server port; `ALLOWED_ORIGINS` on the server permits the Vite dev origin.

## Docs

| File | Purpose |
| --- | --- |
| `docs/rules.md` | Canonical game rules for all variants, with section IDs used in code comments |
| `docs/plan.md` | Architecture decisions, house rule picks, milestone scope, open items |
| `docs/client-server-protocol.md` | Complete WS protocol reference for client developers — all C2S/S2C messages, error codes, session management, turn flow examples |

## Key constraints

- `strict: true` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` everywhere. No `any` without a comment.
- All imports within the monorepo use `.js` extensions (NodeNext resolution).
- Server shuffles with `node:crypto` only — never `Math.random`.
- All rule citations in code use `// rules.md A.x.y` section IDs.
- Engine errors are thrown as `Error` with `ERR_*` prefixed messages (e.g. `ERR_NOT_YOUR_TURN`, `ERR_WRONG_PHASE`). The WS layer (M2) will translate these to `{ t: 'error', code, msg }`.
- `GameState.hasMeldedEver` and `drewFromDiscardId` enforce two locked house rules: going-rummy bonus (score×2) and no re-discard of drawn discard card.
- `GameState.firstPlayerId` records who went first each hand; re-deal path in `ws.ts` uses it to rotate the starting player clockwise.
- `createBasicGame` takes optional `firstPlayerIndex?: number`. When omitted, calls `rng(0, players.length)` (exclusive hi). Pass it explicitly in tests to skip the RNG call and preserve the pre-existing deck order.

## Milestones

| # | Status | Scope |
| --- | --- | --- |
| M1 | Done | shared types, engine (deck/meld/basic variant), scripted-player, tests |
| M2 | Done | WS server, room create/join, lobby, in-memory registry |
| M3 | Done | Wire engine to WS; 2-browser basic rummy |
| M4 | Done | React client: hand fan, drag-drop, discard, meld zone, chat, score overlay |
| M4.5 | Done | Re-deal, first-player rotation, How to Play modal (Basic), bug fixes |
| M5 | Not started | Gin variant |
| M6 | Not started | 500 Rum variant |
| M7 | Not started | Deploy, structured logs, metrics |
| M8 | Not started | PixiJS card layer |
