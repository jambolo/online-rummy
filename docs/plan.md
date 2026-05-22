# Online Rummy — Build Plan

Compressed reference. Reload before resuming work.

## Decisions

| Area | Choice |
| --- | --- |
| Variants v1 | Basic Rummy, Gin Rummy, 500 Rum |
| Scale | Hobby <50 concurrent |
| Auth | Guest nickname + 5-letter room code, signed cookie session id |
| Transport | WebSocket, JSON, native `ws` lib (not socket.io) |
| Server | TypeScript + Node.js 20 LTS |
| Package manager | pnpm workspaces (monorepo) |
| Client | React + Vite + TS, Zustand state, dnd-kit drag |
| Card render v1 | CSS/HTML |
| Card render v2 | PixiJS swap after playability confirmed |
| Persistence | None, in-memory room registry |
| Hosting | Deferred. GCE e2-micro free tier OR Cloudflare Tunnel self-host. Same Node process either way |
| Deploy artifact | Docker image (multi-stage), PM2 fallback if no container runtime |
| Bots | None v1 |
| Disconnect | Instant forfeit (no reconnect mid-game; lobby reconnect 60s via sessionId cookie) |
| Forfeit disposition | Hand + melds out of play (NOT returned to stock). Stock + discard pile untouched |
| Spectators | None v1 |
| Devices | Desktop + mobile web responsive |
| House rules | Fixed canonical per variant (rules.md primaries). See "House rule picks" below |
| Chat | Text in-room |
| TS config | `strict: true`, ESLint + Prettier defaults, no `any` without comment |

## Repo layout

```text
online-rummy/
  packages/
    shared/
      src/
        cards.ts          # Suit, Rank, Card, Meld, Phase, PublicState, PrivateState, RANKS, RANK_INDEX
        protocol.ts       # C2S, S2C message unions, PileSlice
        index.ts          # barrel re-export
    server/
      src/
        index.ts          # HTTP server, env validation, startup
        ws.ts             # WS upgrade, origin check, rate limiting, message routing, disconnect
        room.ts           # Room/Player types, Crockford room codes, in-memory registry
        session.ts        # makeSessionId, signSessionId, verifySessionId (HMAC-SHA256)
        rng.ts            # cryptoRNG (node:crypto) + makeSeededRNG (seeded PRNG, tests only)
        engine/
          types.ts        # GameState, GamePlayer, VariantEngine interface, ScoreSheet (server-only)
          deck.ts         # buildDeck, buildShuffledDeck, shuffle, dealN
          meld.ts         # validateMeld(cards, opts), cardPoints
          scripted-player.ts  # runScript(state, C2S[]) → ActionResult[] (engine-level, no WS)
          variants/
            basic.ts      # basicVariant, createBasicGame, applyDraw/Meld/Layoff/Discard
            gin.ts        # M5
            rum500.ts     # M6
    client/
      src/
        main.tsx
        routes/{Home,Room}.tsx
        components/{Card,Hand,Table,MeldZone,Chat,ActionBar}.tsx
        net/ws.ts         # connect, dispatch, reconnect (lobby only)
        store.ts          # Zustand
  package.json            # root scripts only (pnpm -r test/build)
  pnpm-workspace.yaml     # workspace package globs
  tsconfig.base.json
  rules.md
  plan.md
```

## Shared types (canonical)

```ts
type Suit = 'C' | 'D' | 'H' | 'S';
type Rank = 'A'|'2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'J'|'Q'|'K';
type Card = { id: string; suit: Suit; rank: Rank };  // server-generated id, stable per game

type MeldKind = 'set' | 'run';
type Meld = { id: string; kind: MeldKind; cardIds: string[]; ownerId: string };

type Phase = 'draw' | 'meld' | 'discard' | 'ended';

type PublicState = {
  roomId: string;
  variant: 'basic' | 'gin' | 'rum500';
  players: {
    id: string; name: string; handCount: number;
    melds: Meld[]; score: number; status: 'active'|'forfeited';
  }[];
  turnPlayerId: string;
  phase: Phase;
  discardTop: Card | null;
  discardPileSize: number;   // 500 rum exposes full pile via separate msg on request
  stockSize: number;
};

type PrivateState = { hand: Card[] };  // owner-only
```

## Wire protocol

```ts
type C2S =
  | { t: 'create'; variant: Variant; name: string }
  | { t: 'join'; roomCode: string; name: string; sessionId?: string }
  | { t: 'start' }
  | { t: 'draw'; from: 'stock' | 'discard' }
  | { t: 'drawFromPile'; cardId: string }   // 500 rum dive
  | { t: 'meld'; cardIds: string[] }
  | { t: 'layoff'; meldId: string; cardId: string }
  | { t: 'discard'; cardId: string }
  | { t: 'knock' }                          // gin only
  | { t: 'chat'; text: string };

type LobbyPlayer = { id: string; name: string };

type S2C =
  | { t: 'state'; public: PublicState; private?: PrivateState }
  | { t: 'lobby'; roomCode: string; variant: Variant; hostId: string; players: LobbyPlayer[]; sessionId: string }
  | { t: 'event'; kind: 'drew'|'melded'|'laidOff'|'discarded'|'wonHand'|'forfeit'|'gameOver'|'gameStarted';
      playerId: string; data?: unknown }
  | { t: 'error'; code: string; msg: string }
  | { t: 'chat'; from: string; text: string };
```

`{ t: 'lobby' }` is broadcast on every lobby state change (create, join, reconnect). Each player receives their own signed `sessionId` so they can use it in a future `join` reconnect message. Session delivered via WS message — NOT via HTTP `Set-Cookie` (adding custom headers to the WS 101 response is non-trivial with the `ws` library's `noServer` mode).

Server validates every action. Pessimistic UI v1 (wait for server `state` before showing change). Server broadcasts new `PublicState` to all + `PrivateState` to acting player on success.

## Variant strategy interface

```ts
interface Variant {
  id: 'basic' | 'gin' | 'rum500';
  minPlayers: number;
  maxPlayers: number;
  deal(playerCount: number, rng: RNG): { hands: Card[][]; stock: Card[]; discard: Card[] };
  validateMeld(cards: Card[]): boolean;        // set or run check
  canDrawFromDiscard(state: GameState, playerId: string, cardId?: string): boolean;
  onDiscardDraw(state: GameState, playerId: string, cardId: string): void;  // 500 rum dive logic
  canDiscard(state: GameState, playerId: string, cardId: string): boolean;  // basic: not same as drew from discard
  scoreHand(state: GameState): Map<PlayerId, number>;
  isGameOver(scoreSheet: ScoreSheet): boolean;
  aceHigh: boolean;
  roundTheCorner: boolean;
}
```

## Rule mapping (rules.md → variant impl)

| Variant | rules.md sec | Key constraints |
| --- | --- | --- |
| Basic | A.1 | 2-6P, deals {2:10,3:7,4:7,5:6,6:6}, ace low, draw stock\|top-discard, ≤1 meld/turn, drew-discard cannot re-discard same turn, going-rummy = score×2 |
| Gin | A.2 | 2P, 10 cards, knock at deadwood ≤10, gin = +20 + opp unmatched, undercut = opp +10+diff, box +20, game ≥100, shutout +100 |
| 500 Rum | A.4 | 2-8P (1 deck ≤4P, else 2 decks), deal 13 (2P) else 7, ace high or low not both, A=15 (1 in A-2-3), pile dive (take all above selected, must use selected), lay off others' melds → self credit, score=melds−hand, target ≥500 |

Cite section IDs in code comments (e.g. `// rules.md A.1.6 step 4`).

## House rule picks (locked)

Rules.md lists multiple options per house rule. Defaults for v1:

### Basic Rummy

| Rule | Pick | Source |
| --- | --- | --- |
| Ace | Low only (A-2-3 valid, Q-K-A invalid) | A.1.4 default |
| Round-the-corner (K-A-2) | OFF | A.1.4 |
| Melds per turn | ≤1 | A.1.6 step 2 `[PG-R]` |
| Laying off | Requires ≥1 own prior meld | A.1.6 step 3 `[WP]` |
| Re-discard drawn-discard card | Forbidden same turn | A.1.6 step 4 `[PG-R]` |
| Going Rummy bonus | Score × 2 (NOT +10 flat) | A.1.7 default |
| Card scoring | A=1, 2-10=pip, JQK=10 | A.1.8 |
| Game target | Cumulative 100 points | A.1.8 `[RRB]` |

### Gin Rummy

| Rule | Pick |
| --- | --- |
| Knock | Deadwood ≤ 10 |
| Gin bonus | +20 + opp unmatched (NOT +25 variant) |
| Undercut | Opp +10 + difference |
| Box bonus | +20 per hand won |
| Game bonus | +100 at ≥100 cumulative |
| Shutout bonus | +100 (`[BIC-G]`, NOT +200 `[PG-G]`) |
| Ace | Low only |

### 500 Rum

| Rule | Pick |
| --- | --- |
| Deal | 2P=13, 3+P=7 (`[BIC-5]`, NOT 10 `[PR]` variant) |
| Deck | 1×52 ≤4P, 2×52 ≥5P, no jokers v1 |
| Jokers | OFF v1 (defer house rule `[PG-5]`) |
| Ace | High OR low per hand (player declares at first ace meld), not both |
| Ace value | 15, except 1 in A-2-3 sequence |
| Discard pile dive | Allowed — take all above selected, must use selected immediately |
| Lay off others' melds | Credited to layoff player |
| Same-suit set in 2-deck play | Allowed (NOT `[PG-5]` different-suits-required) |
| Game target | Cumulative ≥ 500; highest at crossover wins |

## RNG + security

- Server-only shuffling via `node:crypto` `randomInt`.
- Cards get server-assigned UUIDv4 ids per game.
- Server never sends other players' hands or stock order.
- Audit every S2C path to confirm no info leak.
- WSS in production via reverse proxy (nginx/Caddy + Let's Encrypt) or Cloudflare Tunnel (auto-TLS).
- Session cookie: signed with HMAC via `cookie-signature` lib (or built-in `crypto.createHmac`). Secret from env var `SESSION_SECRET` (required, min 32 chars, fail boot if missing).
- WS origin allowlist: env var `ALLOWED_ORIGINS` (comma-separated). Reject WS upgrade if `Origin` header not in list. Dev default = `http://localhost:5173`.
- Rate limit: per-IP connection cap (10) + per-socket message rate (20/sec) to deter spam.

## Environment variables

| Var | Required | Purpose |
| --- | --- | --- |
| `SESSION_SECRET` | yes | HMAC key for signed session cookie. ≥32 chars |
| `ALLOWED_ORIGINS` | yes | Comma-separated WS upgrade allowlist |
| `PORT` | no (default 8080) | HTTP+WS listen port |
| `NODE_ENV` | no | `production` enables stricter cookie flags (Secure, SameSite=Strict) |
| `LOG_LEVEL` | no (default `info`) | pino log level |

## Room lifecycle

```text
create -> lobby -> playing -> ended -> destroyed
```

- Lobby: host can start when player count in `[variant.minPlayers, variant.maxPlayers]`.
- Playing: engine FSM drives turn order.
- Ended: final scores shown; host can re-deal (new hand, kept scores until target hit) or close.
- Destroyed: removed from registry.
- Idle GC: 10 min no-active-socket → drop.
- Room code: Crockford base32, 5 chars, collision-checked.

## Disconnect

- WS close → mark `forfeited` immediately.
- 2P: opponent wins hand at current score state.
- 3+P: remove from turn order. Forfeited player's hand cards + melds removed from play entirely (NOT returned to stock; NOT scored against them at hand end since they exited mid-hand). Stock + discard pile untouched. Continue with remaining players.
- If turn was on forfeiting player when they disconnected: advance to next player, phase resets to `draw`.
- If only 1 active player remains in 3+P after forfeits: they win current hand.
- Lobby disconnect: held 60s for reconnect via sessionId cookie. After 60s remove from lobby.

## Engine FSM (basic + 500 rum)

```text
state: { phase, turnPlayerId, drewFromDiscard?: cardId }

draw(from):
  require phase==='draw'
  if from==='discard': drewFromDiscard = card.id
  phase = 'meld'

meld(cardIds):
  require phase==='meld' || 'discard'
  variant.validateMeld
  remove from hand, append to melds
  basic: at most 1 meld this turn → phase = 'discard' after

layoff(meldId, cardId):
  require player has ≥1 own meld (basic house rule per A.1.6)
  validateMeld(targetMeld.cards + card)
  500rum: cardId credited to layoff player

discard(cardId):
  require phase==='discard' or phase==='meld' (skipping meld)
  basic: cardId !== drewFromDiscard
  if hand.empty after: end hand, score
  else: advance turnPlayerId, phase='draw'
```

Gin FSM diverges: `knock` action allowed before discard when deadwood ≤10.

## Test strategy

- Vitest. `packages/shared` + `packages/server/engine` heavy coverage.
- Variant golden tests: scripted hand sequences → assert final scores match hand-computed rules.md examples.
- `scripted-player` helper: feed canned C2S sequence into in-process server, snapshot S2C output. Build in M1.
- Playwright smoke for client: create → join 2nd browser → play 1 hand.

## Milestones

| # | Output | Effort |
| --- | --- | --- |
| M1 | shared/cards, engine/deck, engine/meld, variants/basic, scripted-player helper. ≥90% unit cov on engine | 3-5d |
| M2 | WS server, room create/join, lobby, in-memory registry, no engine yet | 2-3d |
| M3 | Wire engine to WS; play basic rummy hand 2 browsers | 3-5d |
| M4 | Client polish: hand fan, drag-drop, discard, meld zone, chat | 4-6d |
| M5 | Gin variant | 2-3d |
| M6 | 500 Rum variant (pile dive UX) | 3-4d |
| M7 | Deploy + structured logs + room/player counters | 1-2d |
| M8 | PixiJS card layer | 1-2w |

v1 = M1-M7. M8 after.

## Open items

- 500 Rum discard pile dive UX: fan-out interaction needed.
- Mobile drag: dnd-kit touch OK, tap-select fallback essential at small viewport.
- Hosting decision needed before M7.
- 500 Rum ace high/low declaration UX: when player first melds an ace, prompt high or low for the hand. Lock for rest of hand. Design at M6.
- Re-deal (multi-hand game) not yet implemented. The "New Hand" button in the score overlay sends `{ t: 'start' }` but the server rejects it with `ERR_WRONG_STATE` because `room.status` is `'ended'`, not `'lobby'`. The `start` handler needs a second code path that resets the engine while preserving cumulative scores. Scope: M4.5 (before M5).

## M3 implementation notes

- `Room` now carries `gameState: GameState | null` — bridges the registry/session layer to the engine.
- Two player representations must stay in sync on disconnect: `Room.Player.status` (for lobby/reconnect logic) and `GameState.GamePlayer.status` (for engine turn order). Disconnect handler updates both.
- `broadcastStateAll` (game start, post-forfeit) sends private hand to every player. `broadcastState` (per-action) sends private only to the acting player — other players' hands are unchanged.
- `start` handler guards `room.variant !== 'basic'` and returns `ERR_NOT_IMPLEMENTED` for gin/rum500 until M5/M6.
- Engine errors use `ERR_X:detail` format; WS layer splits on `:` to extract the code prefix.
- Browser verification of M3 deferred to M4 (no client yet).

## M4 implementation notes

- **Zustand selectors must be scalar.** Object selectors — `useStore(s => ({ a: s.a, b: s.b }))` — return a new object every render, breaking React 18's `useSyncExternalStore` and causing an infinite re-render loop. Use one `useStore` call per value.
- **React StrictMode double-mounts.** Effects fire twice in dev; the first socket's `onclose` fires after the second socket connects, nulling the module-level socket reference and calling `setConnected(false)`. Fixed with an epoch counter in `net/ws.ts` — each socket knows its epoch and ignores events from previous epochs.
- **Stale sessionStorage triggers spurious reconnects.** On every connect the client tries to rejoin using stored sessionId/roomCode. This floods server logs and can land in error state. Fixed by: (1) clearing sessionStorage on `ERR_SESSION_NOT_FOUND` / `ERR_INVALID_SESSION`, (2) skipping the reconnect attempt entirely if `publicState !== null` (mid-game Vite HMR remount).
- **Vite proxy at `/` breaks page load.** Proxying all requests to the game server causes the initial HTML load to return 404. Client connects directly to `ws://localhost:8080`; Vite proxy is not needed because `ALLOWED_ORIGINS` covers `http://localhost:5173`.
- **Meld cards require protocol extension.** `PublicState` melds only carry `cardIds`. Opponents have never seen those cards so their client cache is empty — all meld cards render as face-down placeholders. Fix: server populates `cards: Card[]` in each meld via `cardRegistry` lookups in `buildPublicState`. Field added to shared `Meld` type as optional.
- **`wonHand` event carries final hands.** All players' remaining unmelded cards at hand end are sent in `data.finalHands` so every client can show the full score breakdown, not just the acting player.
- **Run layoff order.** `targetMeld.cardIds.push(cardId)` appended to end. Runs now sort `cardIds` by `RANK_INDEX` after every layoff. `ERR_INVALID_LAYOFF` throws a descriptive message (wrong suit, out of range, set full) instead of a bare code.
- **Card text-align inheritance.** Table wrappers use `textAlign: "center"` for centering the pile labels. This cascades into card corner text. Card outer div now sets `textAlign: "left"` explicitly.
- **Compact card prop.** Meld zone uses small cards (40×56). Full-size font sizes (13 px corners, 22 px center symbol) don't scale down proportionally. Added `compact` boolean to `Card` that hides the center symbol and bottom corner, showing only the top-left rank/suit at whatever fontSize the caller sets.
- **Score overlay client-side point computation.** Basic rummy card values (A=1, 2–9=pip, 10/J/Q/K=10) are duplicated in the client to render per-card point badges and totals. Deliberately not shared — client display logic, not authoritative scoring.
- **`myPlayerId` detection.** The server never sends "you are player X" directly. Client identifies itself by matching `pendingName` (stored when `create`/`join` is sent) against `lobby.players[].name` on first lobby message. Names are not guaranteed unique but work in practice for ≤6-player games.

## Status

- [x] Plan finalized
- [x] M1 complete
- [x] M2 complete
- [x] M3 complete
- [x] M4 complete
- [ ] M4.5 re-deal not started
- [ ] M5-M8 not started

## Next action

Implement M4.5 re-deal: extend the `start` handler to accept `room.status === 'ended'` and re-initialize the engine (`createBasicGame`) while preserving cumulative `score` and `scoreSheet` on each `GamePlayer`. Then start M5: Gin variant (`packages/server/src/engine/variants/gin.ts`).
