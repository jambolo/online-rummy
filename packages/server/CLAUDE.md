# packages/server

Node.js 22 + native `ws`. No ORM, no DB — all state in memory. The engine (`src/engine/`) is purely functional — no I/O, no sockets — and tests cover it directly.

## Engine contracts

- **`GameState` is mutated in place** by all `apply*` functions. Clone before passing to `runScript` if you need snapshot comparison.
- The `VariantEngine` interface is the extension point for new game variations. Each variation owns `createGame`, `deal`, `validateMeld`, `canDrawFromDiscard`, `onDrawFromDiscard`, `canDiscard`, `scoreHand`, `isGameOver`, the full set of `apply*` action handlers (with optional `applyDrawFromPile`/`applyKnock`/`applyGinLayoff`/`applyPassUpcard`), and the lifecycle hooks `nextFirstPlayerIndex`, `winnerForHand`, `handEndPayload`. Adding a variation = new file under `variants/` + entry in `variants/index.ts`. `ws.ts` and `scripted-player.ts` reach the engine only through `applyAction` + the `VARIANTS` registry — no per-variation `if` ladders.
- **Variant state pocket (Phase 5 refactor).** `GameState` is a discriminated union by `variant`, and every per-variation field lives in a typed `variantState` pocket: `BasicState`, `Rum500State = { mustMeldCardId }`, `GinState = { ginKnockerId, cancelledHand }`. The variant modules expose narrowing helpers (`r500(state)`, `gs(state)`) to read their pocket and throw `ERR_VARIANT_MISMATCH:<id>` on mismatch. The same pattern lifts to the wire: `PublicState.variantPublic` is a discriminated union (`{ variant: 'basic'; data: {} } | { variant: 'rum500'; data: { mustMeldCardId } } | { variant: 'gin'; data: { ginKnockerId } }`). Clients MUST narrow on `variantPublic.variant` before reading `.data`. Top-level `PublicState` no longer carries `mustMeldCardId` or `ginKnockerId`.
- `BasicState = { meldedThisTurn?: boolean }` — optional **by design**. Making it required would break `util.test.ts`'s empty-pocket call.
- `createBasicGame` / `createRum500Game` take optional `firstPlayerIndex?: number`. When omitted, they call `rng(0, players.length)` (exclusive hi). Pass it explicitly in tests to skip the RNG call and preserve the pre-existing deck order.
- `GameState.firstPlayerId` records who went first each hand; the re-deal path in `ws.ts` uses it to rotate the starting player clockwise.
- `HOUSE_RULE_DEFS` entries carry a `supported` gate: `supported: false` ⇒ the engine does not honor the rule ⇒ the UI hides it.

## Wire protocol behavior

- **Session delivery:** the signed `sessionId` is sent in every `{ t: 'lobby' }` broadcast (not via HTTP cookie). The client stores it and passes it in `join.sessionId` for lobby **or mid-game** reconnect. A mid-game reconnect also receives a `lobby` message (so a reloaded tab can resolve "me") followed by full state.
- **State broadcast pattern:** `broadcastStateAll` (game start, post-forfeit, mid-game reconnect) sends `{ t: 'state', public, private }` to every connected player. `broadcastState` (per-action) sends `public` to all but `private` only to the acting player — other players' hands are unchanged mid-action.
- **Action events** are emitted **before** each action's state broadcast, so clients can key sounds and animations off events without diffing state. `draw`→`drew` carries `DrewEventData` with `from` normalized server-side, never echoed raw.
- `keepalive` is relayed to the **other** room players (sender excluded) so their sockets stay warm.
- `PublicState.discardPile: Card[]` is always populated (the full visible pile) — basic clients ignore it; the 500 Rummy pile-dive UI reads it.

## Disconnect grace, not instant forfeit

A mid-game socket drop opens a 60s server grace window (`playerDisconnected` event + `reconnectTimers` entry) during which a `join`+`sessionId` resumes the same hand. Only on expiry does `forfeitPlayer` apply the rules.md disconnect penalty (hand + melds removed from play, **not** returned to stock). A stale-socket guard (`player.socket !== ws`) makes a superseded close a no-op so it can't clobber a live reconnect. Lobby drops keep their own separate 60s removal timer.

Pre-existing tests that closed a socket mid-game and expected an immediate `forfeit` no longer hold — closing now yields `playerDisconnected` first.

## Per-variation rule contracts

**Basic** (rules.md A.1)

- `GameState.drewFromDiscardId` enforces "no re-discard of the drawn discard card" (rules.md A.1.6 step 4). 500 Rummy behavior differs — see below.
- **Going Rummy detection** (rules.md A.1.7) uses `state.meldedBy` — if no entry maps to the winner's id, the winner placed no card all hand → score × 2. The previous `hasMeldedEver` flag was removed in the Phase 0 refactor. The bonus is a doubled per-opponent contribution; under the `goingRummyFlat10` house rule the winner instead gets `earned + 10`.
- The layoff-requires-prior-meld house rule (rules.md A.1.6 step 3) throws `ERR_LAYOFF_REQUIRES_MELD`.
- An unmelded ace counts 15 under either ace flag (`scoreHand` + `handDeadwood`).

**500 Rummy** (rules.md A.4)

- `r500(state).mustMeldCardId` enforces the **pile-dive** must-use restriction (rules.md A.4.4). It is set **only** by `applyDrawFromPile` (a true pile dive, ≥2 cards). A simple top-card draw via `applyDraw {from:'discard'}` does NOT set it — it sets only `drewFromDiscardId` (no re-discard same turn).
- The `unifiedObligation` house rule (rules.md A.4.4) IS enforced: a top-card draw then sets BOTH fields and runs the same `ERR_NO_LEGAL_DIVE` preflight as a dive.
- `GameState.meldedBy: Map<cardId, PlayerId>` credits layoff points to the placer, not the meld's original owner.
- Ace direction in runs is derived per meld from `runAceDirection`: A-2-3 → low (1 pt), Q-K-A → high (15 pts). Sets of aces are always 15 pt; aces in hand are always 15 pt. `acesAlways15` overrides the A-2-3 ace to 15 and takes precedence over `low5Scoring` (rules.md A.4.2).

**Gin** (rules.md A.2)

- 2P only, ace low only. The hand opens at phase `firstUpcardOffer` (rules.md A.2.2): non-dealer is offered the initial upcard first, then the dealer; both decline → phase becomes `draw` with non-dealer playing first. C2S `passUpcard` declines.
- **No mid-turn melding** — `applyMeld`/`applyLayoff` always throw `ERR_NOT_SUPPORTED`; melds are declared at knock time via `applyKnock(state, pid, melds?, discardId)`. `discardId` is required: the knocked card is removed from hand and pushed to the discard pile before deadwood is computed from the remaining 10 cards (rules.md A.2.4). The card must not appear in any declared meld (`ERR_CANNOT_DISCARD_MELDED_CARD`).
- After **any** knock, phase = `layoff` and the turn switches to the defender, who submits `ginLayoff` (rules.md A.2.4 step 3). The defender always declares own melds (`ownMelds?: string[][]`) to reduce deadwood; after a **regular** knock they may also lay off onto the knocker's melds. `applyGinLayoff` validates and applies `ownMelds` first, then `layoffs`; `ERR_CARD_IN_MULTIPLE_MELDS` if a card appears in both.
- **No layoff against gin**: when the knocker went gin (deadwood 0), a non-empty `layoffs` throws `ERR_NO_LAYOFF_AGAINST_GIN` (own melds are still allowed — they reduce the defender's counted deadwood). Phase falls back to `ended` directly only when there is no active defender (e.g. forfeit).
- `gs(state).ginKnockerId` records the knocker — needed because `turnPlayerId` switches to the defender. `gs(state).cancelledHand` is set when `applyDiscard` reduces stock to ≤2 without a knock (rules.md A.2.3); the WS layer emits `handCancelled` and the next `start` re-deals with the same dealer.
- Re-deal first-player rotation in `ws.ts`: the Gin winner deals the next hand → the loser plays first (rules.md A.2.2); a cancelled hand keeps the same dealer.
- Scoring covers gin / regular knock / undercut + box (+20) + game bonus (+100 at cumulative ≥100) + shutout (+100 `[BIC-G]`).

## House rules (NS-8)

Config flows create/`setHouseRules` → `validateHouseRules` (unknown id or wrong type ⇒ `ERR_INVALID_HOUSE_RULE`; enabling a `supported:false` def ⇒ `ERR_UNSUPPORTED_HOUSE_RULE`) → `Room.houseRules` (canonical-merged) → `GameState.houseRules` at createGame → `PublicState.houseRules` on the wire. `setHouseRules` is host-only and lobby-only. An absent key means canonical. Engine code tests a flag as `state.houseRules.<id> === true`.
