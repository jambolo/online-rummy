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

# Start server (after build)
cd packages/server && node dist/index.js
# Required env vars: SESSION_SECRET (≥32 chars), ALLOWED_ORIGINS (comma-separated)

# Client dev server
pnpm --filter @online-rummy/client dev
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

React 18 + Vite + Zustand + dnd-kit. Not yet implemented (M4+).

## Key constraints

- `strict: true` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` everywhere. No `any` without a comment.
- All imports within the monorepo use `.js` extensions (NodeNext resolution).
- Server shuffles with `node:crypto` only — never `Math.random`.
- All rule citations in code use `// rules.md A.x.y` section IDs.
- Engine errors are thrown as `Error` with `ERR_*` prefixed messages (e.g. `ERR_NOT_YOUR_TURN`, `ERR_WRONG_PHASE`). The WS layer (M2) will translate these to `{ t: 'error', code, msg }`.
- `GameState.hasMeldedEver` and `drewFromDiscardId` enforce two locked house rules: going-rummy bonus (score×2) and no re-discard of drawn discard card.

## Milestones

| # | Status | Scope |
| --- | --- | --- |
| M1 | Done | shared types, engine (deck/meld/basic variant), scripted-player, tests |
| M2 | Done | WS server, room create/join, lobby, in-memory registry |
| M3 | Done (server) | Wire engine to WS; 2-browser basic rummy |
| M4 | Not started | Client: hand fan, drag-drop, discard, meld zone, chat |
| M5 | Not started | Gin variant |
| M6 | Not started | 500 Rum variant |
| M7 | Not started | Deploy, structured logs, metrics |
| M8 | Not started | PixiJS card layer |
