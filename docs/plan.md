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
            gin.ts        # M6
            rum500.ts     # M5
    client/
      src/
        main.tsx
        routes/{Home,Room}.tsx
        components/{Card,Hand,Table,MeldZone,Chat,ActionBar,HowToPlayModal}.tsx
        content/howToPlay/{basic,gin,rum500}.tsx  # static rules fragments
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
  discardPile: Card[];          // full pile bottom-to-top; basic ignores, 500 Rum pile-dive reads it
  stockSize: number;
  mustMeldCardId: string | null; // 500 Rum: pile-dive obligation; null = no obligation
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
| Basic | A.1 | 2-7P (1 deck for 2-6P, 2 decks combined for 7P), deals {2:10,3:7,4:7,5:6,6:6,7:10}, ace low only, draw stock\|top-discard, multiple melds per turn allowed, drew-discard cannot re-discard same turn, layoff unrestricted (no prior-meld requirement), going-rummy = score×2 |
| Gin | A.2 | 2P, 10 cards, knock at deadwood ≤10, gin = +20 + opp unmatched, undercut = opp +10+diff, box +20, game ≥100, shutout +100 |
| 500 Rum | A.4 | 2-8P (1 deck ≤4P, else 2 decks), deal 13 (2P) else 7, ace high or low not both, A=15 (1 in A-2-3), pile dive (take all above selected, must use selected), lay off others' melds → self credit, score=melds−hand, target ≥500 |

Cite section IDs in code comments (e.g. `// rules.md A.1.6 step 4`).

## House rule picks (locked)

Rules.md lists multiple options per house rule. Defaults for v1:

### Basic Rummy

| Rule | Pick | Source |
| --- | --- | --- |
| Ace-either-end (A-2-3 and Q-K-A both valid) | OFF (ace low only — default) | A.1.4 |
| Round-the-corner (K-A-2) | OFF (default) | A.1.4 |
| Maximum one meld per turn *(HR)* | OFF (multiple melds per turn allowed — default) | A.1.6 step 2 `[PG-R]` |
| Layoff requires prior meld *(HR)* | OFF (layoff unrestricted — default) | A.1.6 step 3 `[WP]` |
| Re-discard drawn-discard card | Forbidden same turn (standard rule, A.1.6 step 4) | A.1.6 step 4 |
| Going Rummy bonus | Score × 2 (default; +10 flat HR off) | A.1.7 |
| Card scoring | A=1, 2-10=pip, JQK=10 | A.1.8 |
| Game target | Cumulative 100 points | A.1.8 |

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
| Jokers *(HR)* | OFF v1 (defer `[PG-5]`) |
| Ace direction | Per-meld, inferred from neighbours (A-2-3 → low, Q-K-A → high) |
| Ace value | 15, except 1 in A-2-3 sequence |
| Single top-card discard draw | No must-use obligation; cannot re-discard the drawn card same turn (rules.md A.4.4) |
| Pile dive (card below top) | Selected card + every card above moves to hand; selected card must be melded or laid off this turn |
| Unified obligation *(HR)* | OFF (top-card draw stays unrestricted; only pile dive triggers must-use) |
| Lay off others' melds | Credited to layoff player (rules.md A.4.6) |
| Same-suit set in 2-deck play *(HR)* | OFF — same-suit sets allowed (different-suits-required `[PG-5]` HR off) |
| Score formula | Per-hand player net = value of cards placed (own melds + layoffs onto own or others') − value of cards remaining in hand |
| Game target | Cumulative > 500; highest at crossover wins |

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
state: { phase, turnPlayerId, drewFromDiscardId?, mustMeldCardId? }

--- Basic ---
draw(from):
  require phase==='draw'
  if from==='discard': drewFromDiscardId = card.id
  phase = 'meld'

meld(cardIds):
  require phase==='meld' || 'discard'
  variant.validateMeld(cards, {aceHigh:false, roundTheCorner:false})
  remove from hand, append to melds, record meldedBy
  phase = 'discard'  ← basic: exactly 1 meld per turn

layoff(meldId, cardId):
  (no hasMeldedEver check — house rule is off by default)
  validateMeld(targetMeld.cards + card)
  record meldedBy[cardId] = playerId

discard(cardId):
  require phase==='discard' or 'meld' (skipping meld)
  require cardId !== drewFromDiscardId
  if hand.empty: end hand, score (going-rummy bonus ×2)
  else: advance turn, phase='draw'

--- 500 Rum ---
draw(from='stock'):
  require phase==='draw'; phase='meld'

draw(from='discard'):  ← top-card draw
  require phase==='draw'
  drewFromDiscardId = top.id   (cannot re-discard same turn)
  phase='meld'  ← NO mustMeldCardId set

drawFromPile(cardId):  ← pile dive (card below top)
  require phase==='draw'
  takes selected card + every card above it
  mustMeldCardId = cardId    (must meld/layoff selected card before discard)
  phase='meld'

meld(cardIds):
  require phase==='meld' || 'discard'
  variant.validateMeld(cards, {aceHigh:false, roundTheCorner:false, aceEitherEnd:true})
  record meldedBy; if mustMeldCardId in cardIds → mustMeldCardId=null
  phase stays 'meld'  ← multiple melds allowed per turn

layoff(meldId, cardId):
  (no own-meld requirement — 500 Rum allows immediate layoff onto anyone's meld)
  validateMeld(targetMeld.cards + card)
  meldedBy[cardId] = playerId; if mustMeldCardId===cardId → mustMeldCardId=null

discard(cardId):
  require phase==='meld' or 'discard'
  require mustMeldCardId===null  (else ERR_MUST_USE_PILE_CARD)
  require cardId !== drewFromDiscardId
  if hand.empty: end hand, score (melds credited by meldedBy, not meld owner)
  else: advance turn, phase='draw'
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
| M4.5 | Re-deal (multi-hand game); How to Play modal for Basic Rummy | 1-2d |
| M5 | 500 Rum variant (pile dive UX); How to Play modal for 500 Rum | 3-4d |
| M6 | Gin variant; How to Play modal for Gin | 2-3d |
| M7 | Deploy + structured logs + room/player counters | 1-2d |
| M8 | PixiJS card layer | 1-2w |

v1 = M1-M7. M8 after.

## Open items

- Mobile drag: dnd-kit touch OK, tap-select fallback essential at small viewport.
- Hosting decision needed before M7.
- How to Play modal for Gin (M6) not yet implemented — content stub present in the modal, full content deferred to M6.

## How to Play implementation notes

- **Component:** `src/components/HowToPlayModal.tsx` — takes `variant: Variant` prop, renders variant-specific sections. One modal component; content is data-driven per variant.
- **Trigger:** "How to Play" button in `Room.tsx` header, visible in both lobby and game phases. Button always shows regardless of turn or phase.
- **Content shape per variant:**
  - Objective — win condition (go out / knock / reach score target)
  - Turn flow — draw → meld/layoff (optional) → discard; note variant deviations
  - Meld rules — sets (3+ same rank) and runs (3+ same suit sequential); Gin: no lay-off; 500 Rum: pile dive
  - Scoring — point values per card, how hand score is computed, game target
  - Active house rules — list only the locked picks from plan.md (e.g. ace low, ≤1 meld/turn, going-rummy ×2)
- **Content source:** `docs/rules.md` sections A.1 (Basic), A.2 (Gin), A.4 (500 Rum) are the authoritative reference. Client-side copy is static prose; do NOT re-use engine validation logic.
- **Content files:** co-locate with the modal as `src/content/howToPlay/{basic,gin,rum500}.tsx` — each exports a React fragment so rich formatting (bold terms, tables) is possible without a markdown parser dependency.
- **No protocol change needed** — variant is already in `PublicState.variant`; lobby view reads it from `lobbyVariant` in the Zustand store.

## M3 implementation notes

- `Room` now carries `gameState: GameState | null` — bridges the registry/session layer to the engine.
- Two player representations must stay in sync on disconnect: `Room.Player.status` (for lobby/reconnect logic) and `GameState.GamePlayer.status` (for engine turn order). Disconnect handler updates both.
- `broadcastStateAll` (game start, post-forfeit) sends private hand to every player. `broadcastState` (per-action) sends private only to the acting player — other players' hands are unchanged.
- `start` handler originally guarded `room.variant !== 'basic'` and returned `ERR_NOT_IMPLEMENTED` for rum500/gin. M5 lifted the rum500 guard; gin guard remains until M6.
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

## M4.5 implementation notes

- **Re-deal dual-path in `start` handler.** `room.status === 'lobby'` → fresh game (existing path). `room.status === 'ended'` → re-deal: drops players with `socket === null`, resets survivors to `active`, calls `createBasicGame`, then copies `score` and `scoreSheet` from `oldState` onto the new `GamePlayer` entries. If fewer than `variant.minPlayers` survive, returns `ERR_NOT_ENOUGH_PLAYERS`.
- **`GameState.firstPlayerId`.** Records who went first each hand. Re-deal finds that player in the new player list, takes `(prevIdx + 1) % newPlayers.length`. If not found (they disconnected), defaults to index 0.
- **`createBasicGame` optional `firstPlayerIndex`.** When `undefined`, calls `rng(0, players.length)` (hi exclusive) to pick randomly. When provided explicitly, skips the RNG call — so the deck shuffle uses the same RNG sequence as before the parameter was added. All engine tests pass `0` explicitly to preserve pre-existing deck order.
- **`isGameOver` in client store.** Set on `gameOver` event, cleared on `gameStarted`. `ScoreOverlay` reads it to show "Game Over!" vs "Hand Over" heading and "Play Again" vs "New Hand" button label.
- **`finalHands` cleared on phase transition, not on `gameStarted`.** Clearing on `gameStarted` would wipe the card breakdown while the overlay is still visible (it disappears only when the subsequent `state` message sets `phase → draw`). The store clears `finalHands` when it detects `phase === 'ended' → phase !== 'ended'`.
- **`sortCardsDesc` takes `pointsFor` parameter.** ScoreOverlay card sort: primary = scoring value desc (`pointsFor`), secondary = `RANK_INDEX` desc (tiebreaker within same-value group, e.g. K > Q > J > 10), tertiary = suit order (S > H > D > C). Keeping `pointsFor` as a caller-supplied function prevents conflating rank position with scoring value — critical for 500 Rum where Ace = 15 pts but `RANK_INDEX.A = 0`.
- **Suit symbols in `ActionBar`.** The draw-from-discard button was rendering raw `'C'`/`'D'`/`'H'`/`'S'` from `discardTop.suit`. Fixed with `SUIT_SYMBOL` map (♣♦♥♠). All other runtime suit display was already using symbols via `Card.tsx`.
- **Run meld display order.** `applyMeld` now sorts `cardIds` by `RANK_INDEX` after creating the meld (same fix that `applyLayoff` already had). Fixes melds displayed out of sequence when the player selects cards in non-ascending order.

## M5 implementation notes

- **Ace direction inferred from meld shape, not declared.** Locked simplification of rules.md A.4.3: A-2-3 → ace plays low (1 pt in scoring), Q-K-A → ace plays high (15 pt), set of aces → 15 pt each, ace in hand → 15 pt. `runAceDirection(cards)` in `meld.ts` reads the run's neighbours (presence of `2` ⇒ low, presence of `K` ⇒ high). Removed the planned per-hand ace declaration UX entirely — no extra protocol surface needed.
- **`MeldOptions.aceEitherEnd`** is the 500 Rum-specific knob in `meld.ts`. When set, `isRun` runs the rank check twice (once with ace low, once with ace high) and accepts if either passes. Rejects `K-A-2` naturally because both attempts produce a gap.
- **`GameState.mustMeldCardId`** enforces rules.md A.4.4 pile-dive obligation: set to the selected card's id in `applyDrawFromPile`. `applyMeld`/`applyLayoff` clear it when the card is used. `applyDiscard` throws `ERR_MUST_USE_PILE_CARD` while non-null. **Distinct from simple top-discard draw:** `applyDraw {from:'discard'}` takes only the top card, sets `drewFromDiscardId` (cannot re-discard same turn), and does NOT set `mustMeldCardId` — matches standard rules.md A.4.4 (single top card has no must-use obligation). The unified-obligation house rule is host-configurable and currently off.
- **`GameState.meldedBy: Map<cardId, PlayerId>`** records who placed each card in any meld. 500 Rum scoring iterates per meld, derives ace direction from the meld's full card set via `score500MeldCard`, then credits each card's point value to its placer. Basic populates `meldedBy` too (harmless; its scoring doesn't read it).
- **500 Rum allows multiple melds and unconditional layoff per turn.** `applyMeld` does not check `meldedThisTurn` (only basic enforces that, A.1.6 step 2 [PG-R]). `applyLayoff` does not check `hasMeldedEver` (basic-only constraint, A.1.6 step 3 [WP]). Phase stays at `'meld'` after a 500 Rum meld so the player can keep melding/laying off until they discard.
- **PublicState gained `discardPile: Card[]` and `mustMeldCardId: string | null`.** Pile is always populated bottom-to-top; basic clients ignore it, 500 Rum reads it for the dive picker. Discard pile is face-up in real play, so exposing the full sequence is not an info leak.
- **`variantFns(v)` in `ws.ts`** routes per-variant engine fns. Replaces direct `basic.*` imports in handlers. `scripted-player.ts` dispatches the same way via `state.variant`. Adding Gin will only require a third branch in both files.
- **Pile-dive picker (`PileDiveModal.tsx`)** renders the discardPile top-first. Hovering a card highlights every card that will be taken (selected card + everything above it in the pile). Click sends `{ t: 'drawFromPile', cardId }`.
- **Multi-crossover game-over rule** (rules.md A.4.7: highest at crossover wins). Already handled by `handleHandEnd` — it picks the player with the highest cumulative `score` after the hand is scored, so two players crossing 500 in the same hand resolve correctly.

## Status

- [x] Plan finalized
- [x] M1 complete
- [x] M2 complete
- [x] M3 complete
- [x] M4 complete
- [x] M4.5 complete
- [x] M5 complete
- [ ] M6-M8 not started

## Next action

Start M6: Gin Rummy variant (`packages/server/src/engine/variants/gin.ts`). See Rule mapping table for Gin constraints (2P, knock at deadwood ≤10, gin/undercut bonuses, +100 game / +100 shutout).
