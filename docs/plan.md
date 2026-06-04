# Online Rummy — Build Plan

Compressed reference. Reload before resuming work.

## Decisions

| Area | Choice |
| --- | --- |
| Game variations v1 | Basic Rummy, Gin Rummy, 500 Rummy |
| Scale | Hobby <50 concurrent |
| Auth | Guest nickname + 5-letter room code, signed cookie session id |
| Transport | WebSocket, JSON, native `ws` lib (not socket.io) |
| Server | TypeScript + Node.js 22.13 |
| Package manager | pnpm workspaces (monorepo) |
| Client | React + Vite + TS, Zustand state, dnd-kit drag |
| Card render v1 | CSS/HTML |
| Card render v2 | PixiJS swap after playability confirmed |
| Persistence | None, in-memory room registry. **T-NS5-0 (NS-5 identity/progression) — defer.** No durable accounts/Dossier/rank/history backend in v1; NS-5 is blocked until this row changes. |
| Hosting | Cloudflare Tunnel + manual local host (run `node dist/index.js` on a dev machine). No dedicated server |
| Deploy artifact | None — built server run locally; `cloudflared` exposes it |
| Bots | None v1 |
| Disconnect | Instant forfeit (no reconnect mid-game; lobby reconnect 60s via sessionId cookie) |
| Forfeit disposition | Hand + melds out of play (NOT returned to stock). Stock + discard pile untouched |
| Spectators | None v1 |
| Devices | Desktop + mobile web responsive |
| House rules | Fixed canonical per game variation (rules.md primaries). See "House rule picks" below |
| Chat | Text in-room |
| TS config | `strict: true`, ESLint + Prettier defaults, no `any` without comment |

## Repo layout

```text
online-rummy/
  packages/
    shared/
      src/
        cards.ts          # Suit, Rank, Card, Meld, Phase, Variant, VariantPublic, PublicState, PrivateState, RANKS, RANK_INDEX
        protocol.ts       # C2S, S2C message unions, PileSlice
        meld.ts           # validateMeld(cards, opts), cardPoints, MeldOptions (runtime, used by client + server)
        index.ts          # barrel re-export
    server/
      src/
        index.ts          # HTTP server, env validation, startup
        ws.ts             # WS upgrade, origin check, rate limiting, unified action dispatch (engine/dispatch.ts), disconnect
        room.ts           # Room/Player types, Crockford room codes, in-memory registry, variantLimits
        session.ts        # makeSessionId, signSessionId, verifySessionId (HMAC-SHA256)
        rng.ts            # cryptoRNG (node:crypto) + makeSeededRNG (seeded PRNG, tests only)
        engine/
          types.ts        # GameState (discriminated by variant + variantState pocket), GamePlayer, VariantEngine, ScoreSheet, WonHandData
          deck.ts         # buildDeck, buildShuffledDeck, shuffle, dealN
          util.ts         # requireTurn, lookupCard, advanceTurn, detectMeldKind, makeMeldId, buildBaseState
          layoff-error.ts # formatLayoffError — detailed ERR_INVALID_LAYOFF builder used by all variants
          dispatch.ts     # applyAction(state, pid, action): DispatchResult — unified C2S → engine dispatcher
          scoring.ts      # deadwood(player, aceValue), validateKnockMelds(state, player, groups, validate)
          scripted-player.ts  # runScript(state, C2S[]) — replays via applyAction
          variants/
            index.ts      # VARIANTS: Record<Variant, VariantEngine>, isVariant, getVariant
            basic.ts      # basicVariant + createBasicGame + applyDraw/Meld/Layoff/Discard
            gin.ts        # ginVariant + createGinGame + applyDraw/PassUpcard/Discard/Knock/GinLayoff + gs() narrowing helper
            rum500.ts     # rum500Variant + createRum500Game + applyDraw/DrawFromPile/Meld/Layoff/Discard + r500() narrowing helper + runAceDirection, score500MeldCard
    client/
      src/
        main.tsx
        routes/{Home,Room}.tsx
        components/{Card,Hand,Table,MeldZone,Chat,ActionBar,HowToPlayModal,PileDiveModal,Modal}.tsx
        content/howToPlay/{basic,gin,rum500}.tsx  # static rules fragments
        content/copy.ts   # central thematic-copy module (Home/Chat/banner, NS-5 rank ladder)
        theme/{tokens,variations}.ts            # NS-1 token map + NS-7 per-variation accent/label
        theme/{useBreakpoint,useReducedMotion}.ts  # NS-4 / NS-6 hooks
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

type Phase = 'firstUpcardOffer' | 'draw' | 'meld' | 'discard' | 'layoff' | 'ended';
// Phase values are per-variant subsets: basic/500 use draw|meld|discard|ended;
// gin uses firstUpcardOffer|draw|discard|layoff|ended (no `meld` phase).

// Per-variation public pocket — client narrows on variantPublic.variant before reading .data.
type VariantPublic =
  | { variant: 'basic';  data: Record<string, never> }
  | { variant: 'rum500'; data: { mustMeldCardId: string | null } }
  | { variant: 'gin';    data: { ginKnockerId: string | null } };

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
  discardPile: Card[];          // full pile bottom-to-top; basic ignores, 500 Rummy pile-dive reads it
  stockSize: number;
  variantPublic: VariantPublic;
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
  | { t: 'drawFromPile'; cardId: string }   // 500 rummy dive
  | { t: 'meld'; cardIds: string[] }
  | { t: 'layoff'; meldId: string; cardId: string }
  | { t: 'discard'; cardId: string }
  | { t: 'knock'; melds?: string[][]; discardId: string }  // gin only
  | { t: 'ginLayoff'; ownMelds?: string[][]; layoffs: Array<{ cardId: string; meldId: string }> }  // gin layoff phase
  | { t: 'passUpcard' }                     // gin firstUpcardOffer decline
  | { t: 'chat'; text: string };

type LobbyPlayer = { id: string; name: string };

type S2C =
  | { t: 'state'; public: PublicState; private?: PrivateState }
  | { t: 'lobby'; roomCode: string; variant: Variant; hostId: string; players: LobbyPlayer[]; sessionId: string }
  | { t: 'event'; kind: 'drew'|'melded'|'laidOff'|'discarded'|'wonHand'|'handCancelled'|'forfeit'|'gameOver'|'gameStarted';
      playerId: string; data?: unknown }
  | { t: 'error'; code: string; msg: string }
  | { t: 'chat'; from: string; text: string };
```

`{ t: 'lobby' }` is broadcast on every lobby state change (create, join, reconnect). Each player receives their own signed `sessionId` so they can use it in a future `join` reconnect message. Session delivered via WS message — NOT via HTTP `Set-Cookie` (adding custom headers to the WS 101 response is non-trivial with the `ws` library's `noServer` mode).

Server validates every action. Pessimistic UI v1 (wait for server `state` before showing change). Server broadcasts new `PublicState` to all + `PrivateState` to acting player on success.

## Game-variation strategy interface

Canonical definition lives in `packages/server/src/engine/types.ts` (`VariantEngine`). Skeleton:

```ts
interface VariantEngine {
  id: 'basic' | 'gin' | 'rum500';
  minPlayers: number;
  maxPlayers: number;
  aceHigh: boolean;
  roundTheCorner: boolean;

  // Lifecycle
  createGame(players, rng, firstPlayerIndex?): GameState;
  deal(playerCount, rng): { hands; stock; discard };
  validateMeld(cards): boolean;
  canDrawFromDiscard(state, playerId, cardId?): boolean;
  onDrawFromDiscard(state, playerId, cardId): void;
  canDiscard(state, playerId, cardId): boolean;
  scoreHand(state): Map<PlayerId, number>;
  isGameOver(scoreSheet): boolean;

  // Action handlers (promoted onto the interface — Phase 3 refactor)
  applyDraw(state, playerId, from): void;
  applyMeld(state, playerId, cardIds): void;
  applyLayoff(state, playerId, meldId, cardId): void;
  applyDiscard(state, playerId, cardId): { handEnded: boolean; cancelled?: boolean };
  applyDrawFromPile?(state, playerId, cardId): void;   // 500 Rummy only
  applyKnock?(state, playerId, melds?, discardId?): void; // Gin only
  applyGinLayoff?(state, playerId, layoffs, ownMelds?): void; // Gin only
  applyPassUpcard?(state, playerId): void;             // Gin only

  // Lifecycle hooks consumed by ws.ts (Phase 3 refactor)
  nextFirstPlayerIndex(oldState, newPlayers): number;
  winnerForHand(state): PlayerId | null;
  handEndPayload(state, winnerId): WonHandData;
}
```

`ws.ts` and `scripted-player.ts` reach the engine **only** through `applyAction` (`engine/dispatch.ts`)
and the `VARIANTS` registry (`engine/variants/index.ts`). There are no per-variation `if` ladders in
either caller.

## Rule mapping (rules.md → game-variation impl)

| Game variation | rules.md sec | Key constraints |
| --- | --- | --- |
| Basic | A.1 | 2-7P (1 deck for 2-6P, 2 decks combined for 7P), deals {2:10,3:7,4:7,5:6,6:6,7:10}, ace low only, draw stock\|top-discard, multiple melds per turn allowed, drew-discard cannot re-discard same turn, layoff unrestricted (no prior-meld requirement), going-rummy = score×2 |
| Gin | A.2 | 2P, 10 cards, ace low; first-upcard offered non-dealer→dealer→stock (A.2.2); no mid-turn melding (melds revealed only at knock/gin); knock at deadwood ≤10; gin = +20 + opp deadwood (no layoff vs gin); non-gin knock = opp lays off onto knocker's melds, knocker scores `opp_dw − knocker_dw`; undercut (opp_dw ≤ knocker_dw after layoff) = opp +10 + diff; stock-depletion (stock ≤ 2 after a no-knock discard) = hand cancelled, same dealer re-deals (A.2.3); box +20 per hand won, game ≥100, shutout +100 (`[BIC-G]`); winner deals next hand (A.2.2) |
| 500 Rummy | A.4 | 2-8P (1 deck ≤4P, else 2 decks), deal 13 (2P) else 7, ace high or low not both, A=15 (1 in A-2-3), pile dive (take all above selected, must use selected), lay off others' melds → self credit, score=melds−hand, target ≥500 |

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

Canonical rules only. No house rules are in scope.

| Rule | Pick | Source |
| --- | --- | --- |
| Players | 2 only | A.2.1 |
| Deal | 10 each; 21st card flipped as initial upcard | A.2.2 |
| First dealer | Random; subsequent hands winner deals | A.2.2 |
| First-upcard offer | Non-dealer offered first; on pass dealer is offered; on both pass non-dealer draws normally. Phase `firstUpcardOffer`; C2S `passUpcard` declines | A.2.2 |
| First dealer rotation | Winner deals next hand → loser plays first. Cancelled hand keeps same dealer | A.2.2 |
| Mid-turn melding | Disallowed — melds revealed only at knock/gin | A.2.3 |
| Re-discard drawn-discard card | Forbidden same turn | A.2.3 |
| Stock depletion → cancelled hand | After any discard, if `stock.length ≤ 2` and the hand wasn't ended by a knock, hand is cancelled — no scoring; `GameState.cancelledHand=true`; server emits `handCancelled` event; host re-deals with same dealer | A.2.3 |
| Knock threshold | Deadwood ≤ 10 | A.2.4 |
| Layoff | Non-gin knock: opp lays off onto knocker's melds; no layoff against gin | A.2.4 |
| Knock score | knocker scores `opp_dw − knocker_dw` | A.2.4 |
| Gin bonus | +20 + opp deadwood | A.2.4 |
| Undercut | tie or worse → opp scores `(knocker_dw − opp_dw) + 10`; tie favors defender | A.2.4 |
| Box bonus | +20 per hand won | A.2.5 |
| Game-winning bonus | +100 at cumulative ≥ 100 | A.2.5 |
| Shutout bonus | +100 (`[BIC-G]`, NOT +200 `[PG-G]`) | A.2.5 |
| Ace direction | Low only | A.2.7 |
| Card scoring | A=1, 2-10=pip, JQK=10 | A.2.7 |

### 500 Rummy

| Rule | Pick |
| --- | --- |
| Deal | 2P=13, 3+P=7 (`[BIC-5]`, NOT 10 `[PR]` house rule) |
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
- WSS in production via Cloudflare Tunnel (auto-TLS); local host stays plain `ws` behind the tunnel.
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

## Engine FSM (basic + 500 rummy)

> **Note (Phase 5 refactor):** `GameState` is a discriminated union keyed on `variant`, and every per-variation field lives in a typed `variantState` pocket — read `state.variantState.mustMeldCardId` (500 Rummy) via the `r500(state)` narrowing helper, and `state.variantState.ginKnockerId` / `state.variantState.cancelledHand` (Gin) via `gs(state)`. The FSM pseudocode below uses the field names directly for readability.

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
  phase = 'meld'  ← multiple melds allowed per turn (max-one-meld HR off)

layoff(meldId, cardId):
  (no hasMeldedEver check — house rule is off by default)
  validateMeld(targetMeld.cards + card)
  record meldedBy[cardId] = playerId

discard(cardId):
  require phase==='discard' or 'meld' (skipping meld)
  require cardId !== drewFromDiscardId
  if hand.empty: end hand, score (going-rummy bonus ×2)
  else: advance turn, phase='draw'

--- 500 Rummy ---
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
  (no own-meld requirement — 500 Rummy allows immediate layoff onto anyone's meld)
  validateMeld(targetMeld.cards + card)
  meldedBy[cardId] = playerId; if mustMeldCardId===cardId → mustMeldCardId=null

discard(cardId):
  require phase==='meld' or 'discard'
  require mustMeldCardId===null  (else ERR_MUST_USE_PILE_CARD)
  require cardId !== drewFromDiscardId
  if hand.empty: end hand, score (melds credited by meldedBy, not meld owner)
  else: advance turn, phase='draw'
```

Gin FSM diverges (per rules.md A.2 + engine `variants/gin.ts`):

- Hand opens at `phase = 'firstUpcardOffer'` (rules.md A.2.2). The non-dealer is offered the initial upcard.
- `passUpcard()`: require `phase === 'firstUpcardOffer'`. If turnPlayerId === firstPlayerId (non-dealer), move turn to dealer (phase stays). If dealer also passes, phase = `'draw'`, turn returns to non-dealer.
- `draw(from='discard')` during `firstUpcardOffer`: accept the upcard, set `drewFromDiscardId`, phase = `'discard'`. `from='stock'` is rejected with `ERR_WRONG_PHASE` during the offer.
- No mid-turn meld phase. Normal turn goes `draw → discard` (or `draw → discard → knock`).
- `draw(from)`: require `phase === 'draw'`; if `from === 'discard'` set `drewFromDiscardId`; phase = `'discard'`.
- `discard(cardId)`: require `phase === 'discard'`, no re-discard of drawn card. After the discard, if `stock.length ≤ 2` (rules.md A.2.3 stock-depletion), set `phase = 'ended'`, `cancelledHand = true`, return `{ handEnded: true, cancelled: true }` so the WS layer emits a `handCancelled` event (no scoring; same dealer re-deals). Otherwise advance turn.
- `knock(melds?, discardId)`: require `phase === 'discard'`. `discardId` required — card removed from hand and pushed to discard pile before deadwood is computed from remaining 10 cards (rules.md A.2.4). Card must not be in any declared meld (`ERR_CANNOT_DISCARD_MELDED_CARD`). Deadwood = sum of unmelded cards (A=1); reject if deadwood > 10. Apply melds, set `ginKnockerId`.
  - If deadwood === 0 → gin: phase = `'ended'`, defender cannot lay off.
  - Else: phase = `'layoff'`, `turnPlayerId` switches to defender for layoff phase.
- `ginLayoff(layoffs[], ownMelds?)`: defender first declares `ownMelds` (validated, applied to `defender.melds`), then lays off `layoffs` onto knocker's melds. `ERR_CARD_IN_MULTIPLE_MELDS` if a card appears in both. Phase = `'ended'`.
- `scoreHand`: knock → knocker `opp_dw − knocker_dw`; gin → knocker `+20 + opp_dw`; undercut (`opp_dw ≤ knocker_dw`) → defender `(knocker_dw − opp_dw) + 10`. Per-hand box +20 added to winner. At game crossover (cumulative ≥ 100) winner gains +100; +100 more if loser totals 0.
- Re-deal first-player selection: gin **winner deals** next hand → loser plays first. Cancelled hand keeps the same dealer (rules.md A.2.2 + A.2.3). Logic lives in `ws.ts` start handler; cancelled flag carried on the previous `GameState`.

## Test strategy

- Vitest. `packages/shared` + `packages/server/engine` heavy coverage.
- Game-variation golden tests: scripted hand sequences → assert final scores match hand-computed rules.md examples.
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
| M5 | 500 Rummy game variation (pile dive UX); How to Play modal for 500 Rummy | 3-4d |
| M6 | Gin game variation; How to Play modal for Gin | 2-3d |
| M7 | Deploy: Cloudflare Tunnel + manual local host (no structured logs, no metrics) | <1d |
| M8 | PixiJS card layer | 1-2w |

v1 = M1-M7. M8 after.

## Open items

- Mobile drag: dnd-kit touch OK, tap-select fallback essential at small viewport.
- Hosting: Cloudflare Tunnel + manual local host (decided 2026-05-28). No dedicated server, no structured logs, no metrics.

## How to Play implementation notes

- **Component:** `src/components/HowToPlayModal.tsx` — takes `variant: Variant` prop, renders game-variation-specific sections. One modal component; content is data-driven per game variation.
- **Trigger:** "How to Play" button in `Room.tsx` header, visible in both lobby and game phases. Button always shows regardless of turn or phase.
- **Content shape per game variation:**
  - Objective — win condition (go out / knock / reach score target)
  - Turn flow — draw → meld/layoff (optional) → discard; note game-variation deviations
  - Meld rules — sets (3+ same rank) and runs (3+ same suit sequential); Gin: no lay-off; 500 Rummy: pile dive
  - Scoring — point values per card, how hand score is computed, game target
  - Active house rules — list only the locked picks from plan.md (e.g. ace low, layoff unrestricted, going-rummy ×2)
- **Content source:** `docs/rules.md` sections A.1 (Basic), A.2 (Gin), A.4 (500 Rummy) are the authoritative reference. Client-side copy is static prose; do NOT re-use engine validation logic.
- **Content files:** co-locate with the modal as `src/content/howToPlay/{basic,gin,rum500}.tsx` — each exports a React fragment so rich formatting (bold terms, tables) is possible without a markdown parser dependency.
- **No protocol change needed** — the game variation is already in `PublicState.variant`; lobby view reads it from `lobbyVariant` in the Zustand store.

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
- **`sortCardsDesc` takes `pointsFor` parameter.** ScoreOverlay card sort: primary = scoring value desc (`pointsFor`), secondary = `RANK_INDEX` desc (tiebreaker within same-value group, e.g. K > Q > J > 10), tertiary = suit order (S > H > D > C). Keeping `pointsFor` as a caller-supplied function prevents conflating rank position with scoring value — critical for 500 Rummy where Ace = 15 pts but `RANK_INDEX.A = 0`.
- **Suit symbols in `ActionBar`.** The draw-from-discard button was rendering raw `'C'`/`'D'`/`'H'`/`'S'` from `discardTop.suit`. Fixed with `SUIT_SYMBOL` map (♣♦♥♠). All other runtime suit display was already using symbols via `Card.tsx`.
- **Run meld display order.** `applyMeld` now sorts `cardIds` by `RANK_INDEX` after creating the meld (same fix that `applyLayoff` already had). Fixes melds displayed out of sequence when the player selects cards in non-ascending order.

## M5 implementation notes

> Updated post–Phase 5 refactor: per-variation fields moved to `state.variantState`, shared meld validation moved to `@online-rummy/shared/meld.ts`, and engine dispatch unified through `engine/dispatch.ts` + the `VARIANTS` registry.

- **Ace direction inferred from meld shape, not declared.** Locked simplification of rules.md A.4.3: A-2-3 → ace plays low (1 pt in scoring), Q-K-A → ace plays high (15 pt), set of aces → 15 pt each, ace in hand → 15 pt. `runAceDirection(cards)` lives in `engine/variants/rum500.ts` (500-Rummy-specific) and reads the run's neighbours (presence of `2` ⇒ low, presence of `K` ⇒ high). Removed the planned per-hand ace declaration UX entirely — no extra protocol surface needed.
- **`MeldOptions.aceEitherEnd`** is the 500 Rummy-specific knob exposed by the shared `validateMeld` in `packages/shared/src/meld.ts`. When set, `isRun` runs the rank check twice (once with ace low, once with ace high) and accepts if either passes. Rejects `K-A-2` naturally because both attempts produce a gap. `rum500Variant.validateMeld` passes it; basic/gin do not.
- **`state.variantState.mustMeldCardId` (500 Rummy)** enforces rules.md A.4.4 pile-dive obligation, accessed via the `r500(state)` narrowing helper. Set to the selected card's id in `applyDrawFromPile`. `applyMeld`/`applyLayoff` clear it when the card is used. `applyDiscard` throws `ERR_MUST_USE_PILE_CARD` while non-null. **Distinct from simple top-discard draw:** `applyDraw {from:'discard'}` takes only the top card, sets `drewFromDiscardId` (cannot re-discard same turn), and does NOT set `mustMeldCardId` — matches standard rules.md A.4.4 (single top card has no must-use obligation). The unified-obligation house rule is host-configurable and currently off.
- **`GameState.meldedBy: Map<cardId, PlayerId>`** records who placed each card in any meld. 500 Rummy scoring iterates per meld, derives ace direction from the meld's full card set via `score500MeldCard`, then credits each card's point value to its placer. Basic populates `meldedBy` too (used for going-rummy detection — see "Key constraints").
- **500 Rummy allows multiple melds and unconditional layoff per turn.** `applyMeld` does not check `meldedThisTurn` (only basic enforces that, A.1.6 step 2 [PG-R]). `applyLayoff` has no own-meld prerequisite (basic-only constraint, A.1.6 step 3 [WP], host-configurable house rule — currently off, no engine state needed). Phase stays at `'meld'` after a 500 Rummy meld so the player can keep melding/laying off until they discard.
- **`PublicState.discardPile: Card[]`** is always populated bottom-to-top; basic clients ignore it, 500 Rummy reads it for the dive picker. Discard pile is face-up in real play, so exposing the full sequence is not an info leak. **500 Rummy's `mustMeldCardId` is exposed via `variantPublic.data.mustMeldCardId`** (post-Phase-5; top-level `PublicState` no longer carries it).
- **Per-variation routing in `ws.ts`** goes through `applyAction` (`engine/dispatch.ts`) + the `VARIANTS` registry (`engine/variants/index.ts`). `scripted-player.ts` shares the same dispatcher. Adding a new variation = new file under `variants/` + one registry entry; no `if` ladder edits in either caller.
- **Pile-dive picker (`PileDiveModal.tsx`)** renders the discardPile top-first. Hovering a card highlights every card that will be taken (selected card + everything above it in the pile). Click sends `{ t: 'drawFromPile', cardId }`.
- **Multi-crossover game-over rule** (rules.md A.4.7: highest at crossover wins). Handled by `engine.winnerForHand` (Phase 3 lifecycle hook) called from `handleHandEnd` — picks the player with the highest cumulative `score` after the hand is scored, so two players crossing 500 in the same hand resolve correctly.

## M6 implementation notes

> Updated post–Phase 5 refactor: `ginKnockerId` and `cancelledHand` moved into `state.variantState`, accessed via the `gs(state)` narrowing helper. Engine action dispatch unified through `engine/dispatch.ts`.

- **Knock requires face-down discard.** `applyKnock(state, pid, melds?, discardId)` receives `discardId` as a required parameter (rules.md A.2.4). The discard is processed before deadwood computation: card removed from hand, pushed to discard pile; deadwood then computed from the remaining 10 cards. Card must not appear in any declared meld group (`ERR_CANNOT_DISCARD_MELDED_CARD`). Knock-meld validation runs through the shared `engine/scoring.ts::validateKnockMelds` primitive. Protocol: `{ t: 'knock'; melds?: string[][]; discardId: string }`.
- **Defender declares own melds before layoff.** `ginLayoff` protocol extended: `{ t: 'ginLayoff'; ownMelds?: string[][]; layoffs: Array<{ cardId: string; meldId: string }> }`. `applyGinLayoff` validates and applies `ownMelds` first (cards → `defender.melds`, removed from `defender.hand`), then validates and applies `layoffs` onto knocker's melds. Card appearing in both throws `ERR_CARD_IN_MULTIPLE_MELDS`.
- **Stock depletion + knocker bookkeeping** live in `state.variantState` (Gin only): `gs(state).cancelledHand` is set when `applyDiscard` reduces stock to ≤2 without a knock (rules.md A.2.3); `gs(state).ginKnockerId` records the knocker. Mirrored to the client via `variantPublic.data.ginKnockerId` (`MeldZone` reads it during `layoff` phase + `ScoreOverlay`).
- **Client knock meld builder.** ActionBar tracks `knockMelds: string[][]` in Zustand store. User selects 3+ cards and clicks "Group N cards" to stage a meld group; each group renders as a chip with a × remove button. Deadwood indicator updates live, excluding the selected discard card. `canKnock` requires exactly 1 non-melded card selected and `deadwoodValue ≤ 10`. Meld validity checked client-side with the shared `validateMeld` from `@online-rummy/shared` (Gin opts: `aceHigh:false, roundTheCorner:false`).
- **Client defender UI.** During `layoff` phase, `ginDefenderMelds: string[][]` accumulates own meld declarations (chips with × remove). `ginLayoffs: Array<{cardId,meldId}>` accumulates staged layoffs (chips with × remove via `removeGinLayoff`). Submit sends one `ginLayoff` message with both arrays.
- **MeldZone pending preview.** During `layoff` phase, `ginDefenderMelds` render as dashed-border pending piles (lower opacity, "pending" label). Staged `ginLayoffs` render as semi-transparent cards appended to their target knocker meld pile — client-side preview before submission.
- **Score strip shows all players.** `OpponentStrip` in Room.tsx was filtering out `myPlayerId` so the local player's score never appeared. Fixed by rendering all players with a blue "(you)" tag on the local player's chip.
- **Per-entry layoff removal.** Store needed `removeGinLayoff(index)` (not just `clearGinLayoffs`) to match the ×-per-chip UX pattern used for `knockMelds` and `ginDefenderMelds`.
- **`ERR_KNOCK_REQUIRES_DISCARD` / `ERR_CANNOT_DISCARD_MELDED_CARD`** added to client `ERROR_MESSAGES` map in `store.ts`.
- **Tests: 331 server tests pass** (engine + ws + scripted-player), including gin/knock/undercut/layoff scoring, defender own-meld declaration, `ERR_CARD_IN_MULTIPLE_MELDS`, stock-depletion cancel, first-upcard offer flow, scripted-player dispatch, and the Phase-7 deadwood/knock primitives.

## Status

- [x] Plan finalized
- [x] M1 complete
- [x] M2 complete
- [x] M3 complete
- [x] M4 complete
- [x] M4.5 complete
- [x] M5 complete
- [x] M6 complete — Gin game variation: engine, WS wiring, client UI, 62 engine tests, How-to-Play content
- [x] M7 complete — Deploy: server serves client bundle; single Cloudflare Tunnel + manual local host (`scripts/launch-in-tmux-window.sh`). No structured logs, no metrics
- [ ] M8 not started — PixiJS card layer

## Next action

M1–M7 complete (v1, v0.5.0). Structural refactor landed (commit d053563); the variant-state-pocket follow-up + shared `meld.ts` + unified `applyAction` dispatcher all live on `develop`. M7 deploy = server serves client bundle, single Cloudflare Tunnel + manual local host. No dedicated server, no structured logs, no metrics.

Post-v1 streams (parallel, not strict order):

- **UX overhaul** — see `docs/ux-design.md` + `docs/ux-implementation-plan.md`. Phases A–E (NS-1 tokens, NS-6 a11y, NS-4 responsive, NS-7 variation theming, NS-2 speakeasy re-skin) all landed. Open: NS-8 house-rule config (Phase F), NS-5 identity/progression (Phase G, gated on the T-NS5-0 persistence decision — still recorded as "None, in-memory" in this doc's Decisions table), NS-3 PixiJS (Phase H = M8), and a handful of smaller `[Gap]` items.
- **M8 (PixiJS card layer)** — the only milestone still outstanding from the original plan; sits inside Phase H of the UX plan.
