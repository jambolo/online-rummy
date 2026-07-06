# Client–Server Protocol

This document describes the WebSocket protocol between the game server and any client. No assumptions are made about the client platform beyond the ability to open a WebSocket connection and exchange JSON messages.

---

## Transport

Connect via WebSocket to the server's HTTP/WS port. The server checks the `Origin` header of the upgrade request against a configured allowlist. If the origin is not on the list, the server responds with HTTP 403 and closes the connection before a WebSocket is established.

Once connected, all communication is JSON over WebSocket frames. Every message — in both directions — is a JSON object with a `t` field that identifies the message type (the discriminator tag). All strings are UTF-8.

**Server-enforced limits:**

- Max 10 simultaneous WebSocket connections per IP address. A new connection that would exceed this limit receives `ERR_TOO_MANY_CONNECTIONS` and is immediately closed.
- Max 20 messages per second per socket. Messages beyond this rate receive `ERR_RATE_LIMIT`; the connection stays open.
- Rooms where no player has an active socket are deleted after 10 minutes of inactivity.

---

## Malformed and Invalid Messages

If the server cannot parse a message, or the message is structurally wrong, it sends an `error` response and keeps the connection open. The client does not need to reconnect after an error.

| Condition | Error code |
| --- | --- |
| Message is not valid JSON | `ERR_INVALID_JSON` |
| JSON is valid but the object has no `t` field | `ERR_INVALID_MSG` |
| Message rate exceeds 20/second | `ERR_RATE_LIMIT` |

If the `t` field is present but the action is not permitted in the current state (wrong phase, wrong player, room full, etc.), the server sends a more specific `ERR_*` code documented under each action below.

In all error cases the connection remains open and the game state is unchanged.

---

## Data Types

These types appear in multiple messages.

### `Card`

```json
{ "id": "string", "suit": "C"|"D"|"H"|"S", "rank": "A"|"2"|"3"|"4"|"5"|"6"|"7"|"8"|"9"|"10"|"J"|"Q"|"K" }
```

`id` is a server-assigned UUID, stable for the lifetime of the game. All card references in action messages use `id`, not rank or suit.

### `Meld`

```json
{
  "id": "string",
  "kind": "set"|"run",
  "cardIds": ["string", ...],
  "ownerId": "string",
  "cards": [Card, ...]
}
```

`id` is a server-assigned UUID for the meld. `ownerId` is the player ID of whoever placed the meld. `cardIds` contains the card IDs that make up the meld; this list grows when other players lay off cards onto it. For runs, `cardIds` is always sorted in ascending rank order.

`cards` contains the full `Card` objects corresponding to `cardIds` in the same order. This allows clients to render meld cards without maintaining a private card cache. `cards` is always present in melds sent within `PublicState`.

### `PublicPlayer`

```json
{
  "id": "string",
  "name": "string",
  "handCount": 7,
  "melds": [Meld, ...],
  "score": 0,
  "status": "active"|"forfeited"
}
```

`handCount` is the number of cards in the player's hand. You do not see the actual cards unless it is your own hand (see `PrivateState`).

### `PublicState`

The state visible to all players.

```json
{
  "roomId": "string",
  "variant": "basic"|"gin"|"rum500",
  "players": [PublicPlayer, ...],
  "turnPlayerId": "string",
  "phase": "firstUpcardOffer"|"draw"|"meld"|"discard"|"layoff"|"ended",
  "discardTop": Card | null,
  "discardPileSize": 3,
  "discardPile": [Card, ...],
  "stockSize": 24,
  "meldedBy": { "cardId": "playerId", "...": "..." },
  "mustMeldCardId": "string" | null,
  "ginKnockerId": "string" | null
}
```

The `players` array is in turn order. `discardTop` is `null` only if the discard pile is empty (should not happen in normal play).

`discardPile` is the full discard pile bottom-to-top. Discards are face-up so the entire sequence is public; 500 Rummy uses this for the pile-dive picker and other game variations may ignore it.

`meldedBy` maps each card id on the table to the id of the player who placed it (melded or laid off). Because layoffs append to another player's meld, the placer can differ from the meld's `ownerId`; use `meldedBy` to attribute laid-off cards to the player who laid them off — e.g. for an interim per-player meld/layoff score. Cards not on the table are absent. In Gin no cards are placed until knock time, so it is effectively empty during play.

`mustMeldCardId` is set in 500 Rummy when the current turn player drew via pile dive and has not yet placed the picked card in a meld or layoff. While non-null, that player cannot discard. Always `null` in `basic` and `gin`.

`ginKnockerId` is set in Gin after a knock (during `layoff` phase and through scoring). Identifies the knocker so the client can distinguish knocker from defender. Always `null` in `basic` and `rum500`.

**Phase values are per-game-variation subsets:**

- `basic` / `rum500`: `draw → meld → ended` (the "maximum one meld per turn" house rule is enforced via `ERR_MAX_ONE_MELD` during the `meld` phase, without a phase change; the `discard` phase value is not set by these game variations and remains unused).
- `gin`: `firstUpcardOffer → draw → discard → layoff? → ended`. No `meld` phase — Gin reveals melds only at knock time.

### `PrivateState`

The contents of your own hand. Sent only to the player who owns the hand.

```json
{ "hand": [Card, ...] }
```

---

## Client → Server Messages (C2S)

---

### `create` — Create a room

```json
{ "t": "create", "variant": "basic"|"gin"|"rum500", "name": "string", "houseRules": { "aceEitherEnd": true, "...": "..." } }
```

Creates a new room and places the sender in it as the host. `name` is the player's display name and is trimmed to 20 characters server-side.

`houseRules` is optional. Each entry is validated against the chosen game variation's house-rule registry and merged over that game variation's canonical defaults. Omit it (or send `{}`) for a fully canonical table.

**Response:** A [`lobby`](#lobby--lobby-state) message is sent to the creating player.

**Errors:**

| Code | Condition |
| --- | --- |
| `ERR_ALREADY_IN_ROOM` | This socket is already associated with a room |
| `ERR_INVALID_VARIANT` | `variant` is not one of the three accepted values |
| `ERR_INVALID_NAME` | `name` is empty after trimming |
| `ERR_INVALID_HOUSE_RULE` | A `houseRules` id is unknown to this game variation, or its value has the wrong type |
| `ERR_UNSUPPORTED_HOUSE_RULE` | A `houseRules` entry sets a non-canonical value for a house rule that is registered but not yet available (e.g. `jokers`) |

---

### `join` — Join a room or reconnect

```json
{ "t": "join", "roomCode": "string", "name": "string", "sessionId": "string (optional)" }
```

`roomCode` is a 5-character Crockford base32 string (case-insensitive). `name` is the player's display name, trimmed to 20 characters.

**Normal join:** Omit `sessionId`. The player is added to the lobby as a new participant.

**Reconnect:** Include the `sessionId` that was previously received in a `lobby` message. The server verifies the token and re-associates this socket with the player's existing slot. The `name` field is ignored during reconnect. Reconnect works both in lobby state **and mid-game** — a socket that drops during play has a 60-second grace window (see [Disconnect Behavior](#disconnect-behavior)) before the player is forfeited. Reconnect is rejected only once the player has been forfeited (grace expired) or the room has ended.

**Response:**

- **Lobby reconnect:** a [`lobby`](#lobby--lobby-state) message is broadcast to all players in the room.
- **Mid-game reconnect:** the reconnecting player receives a [`lobby`](#lobby--lobby-state) message (carrying their `sessionId` and the roster, so a reloaded tab can resolve its own player ID) followed by a full [`state`](#state--game-state) message with their `private` hand. The **other** players receive a [`playerReconnected`](#event--game-event) event and a fresh `state`.

**Errors:**

| Code | Condition |
| --- | --- |
| `ERR_ALREADY_IN_ROOM` | This socket is already associated with a room |
| `ERR_ROOM_NOT_FOUND` | No room exists with that code |
| `ERR_GAME_IN_PROGRESS` | Normal join: room is not in lobby state. Reconnect: the player was already forfeited (grace window expired) or the room has ended |
| `ERR_ROOM_FULL` | Room has reached the game variation's maximum player count |
| `ERR_INVALID_NAME` | `name` is empty after trimming (normal join only) |
| `ERR_INVALID_SESSION` | `sessionId` failed signature verification |
| `ERR_SESSION_NOT_FOUND` | `sessionId` is valid but the player or room is not found |

---

### `start` — Start the game

```json
{ "t": "start" }
```

Only the host may send this. The room must be in `lobby` or `ended` state.

**First start (`lobby` state):** creates a fresh game. First player is chosen randomly.

**Re-deal (`ended` state):** deals a new hand while preserving cumulative scores. Players who disconnected during the previous hand are removed. First-player rotation depends on game variation:

- `basic` / `rum500`: rotates one seat clockwise from the previous hand's first player.
- `gin` (normal end): winner deals next hand → **loser** plays first (rules.md A.2.2).
- `gin` (cancelled hand from stock-depletion): same dealer re-deals → **same first player** (rules.md A.2.3).

Player count requirements by game variation:

| Game variation | Minimum | Maximum |
| --- | --- | --- |
| `basic` | 2 | 7 |
| `gin` | 2 | 2 |
| `rum500` | 2 | 8 |

**Response:** Two messages are sent to all connected players in sequence:

1. An [`event`](#event--game-event) with `kind: "gameStarted"`
2. A [`state`](#state--game-state) containing both `public` and each player's own `private` hand

**Errors:**

| Code | Condition |
| --- | --- |
| `ERR_NOT_IN_ROOM` | This socket is not associated with any room |
| `ERR_WRONG_STATE` | Room is not in `lobby` or `ended` state (e.g. game is currently in progress) |
| `ERR_NOT_HOST` | Sender is not the host |
| `ERR_NOT_ENOUGH_PLAYERS` | Fewer than the game variation's minimum number of players (checked after removing disconnected players on re-deal) |

---

### `setHouseRules` — Update house rules (host, lobby only)

```json
{ "t": "setHouseRules", "houseRules": { "roundTheCorner": true, "...": "..." } }
```

Host-only, lobby-only. Replaces the room's house-rule configuration. The `houseRules` map is validated the same way as `create`'s `houseRules` (unknown id or wrong value type → `ERR_INVALID_HOUSE_RULE`; non-canonical value for a not-yet-available house rule → `ERR_UNSUPPORTED_HOUSE_RULE`), then stored merged over the room's game variation's canonical defaults. On success, the server rebroadcasts [`lobby`](#lobby--lobby-state) (carrying the new `houseRules`) to every player in the room — there is no separate success reply.

**Response:** A [`lobby`](#lobby--lobby-state) message broadcast to all players in the room.

**Errors:**

| Code | Condition |
| --- | --- |
| `ERR_NOT_IN_ROOM` | This socket is not associated with any room |
| `ERR_NOT_HOST` | Sender is not the host |
| `ERR_WRONG_STATE` | Room is not in `lobby` state |
| `ERR_INVALID_HOUSE_RULE` | A `houseRules` id is unknown to this room's game variation, or its value has the wrong type |
| `ERR_UNSUPPORTED_HOUSE_RULE` | A `houseRules` entry sets a non-canonical value for a house rule that is registered but not yet available (e.g. `jokers`) |

---

### `draw` — Draw a card

```json
{ "t": "draw", "from": "stock"|"discard" }
```

Draws the top card from either the stock pile or the discard pile. Valid only on your turn when `phase` is `"draw"`.

After a successful draw, `phase` advances to `"meld"`.

**Game-variation rules:**

- **Basic:** if you draw from the discard pile, you cannot discard that same card on the same turn.
- **500 Rummy:** drawing from the discard pile via `draw {from:"discard"}` takes only the top card. You cannot re-discard that same card on the same turn, but there is **no must-meld obligation** — `mustMeldCardId` is **not** set. A multi-card pile dive (which does set `mustMeldCardId`) is a separate action; see [`drawFromPile`](#drawfrompile--500-rum-pile-dive).

**Response:** A [`state`](#state--game-state) message is sent. The acting player receives both `public` and `private` (their updated hand). All other players receive `public` only.

**Errors:**

| Code | Condition |
| --- | --- |
| `ERR_NOT_IN_ROOM` | This socket is not associated with any room |
| `ERR_WRONG_STATE` | Game is not in progress |
| `ERR_NOT_YOUR_TURN` | It is not this player's turn |
| `ERR_WRONG_PHASE` | Current phase is not `"draw"` |
| `ERR_CANNOT_DRAW_DISCARD` | Attempted to draw from an empty discard pile (basic) |
| `ERR_DISCARD_EMPTY` | Attempted to draw from an empty discard pile (500 Rummy) |
| `ERR_STOCK_EMPTY` | Attempted to draw from an empty stock |
| `ERR_NO_LEGAL_DIVE` | 500 Rummy only, "Unified draw obligation" house rule enabled: the top discard has no legal meld or lay-off use given your hand, so the draw is refused |

---

### `drawFromPile` — 500 Rummy pile dive

```json
{ "t": "drawFromPile", "cardId": "string" }
```

500 Rummy only. Take any card from the discard pile; the selected card plus every card on top of it move to your hand. Valid only on your turn when `phase` is `"draw"`.

**Top-card shortcut:** if `cardId` is the top card of the discard pile, this behaves identically to `draw {from:"discard"}` — only `drewFromDiscardId` is set (cannot re-discard that card this turn), and `mustMeldCardId` is **not** set (no must-use obligation). Use `draw {from:"discard"}` for a plain top-card draw; `drawFromPile` with the top card's id works but is equivalent.

**"Unified draw obligation" house rule:** when enabled, picking the top card behaves like a dive — the same `ERR_NO_LEGAL_DIVE` preflight applies to a top-card pick, and a successful top-card draw also sets `mustMeldCardId` (the must-use obligation), so a subsequent `discard` can return `ERR_MUST_USE_PILE_CARD` just as it would for a true pile dive.

**True pile dive (card below the top):** the selected card plus every card above it move to your hand. `PublicState.mustMeldCardId` is set to the selected card's id — you must place it in a meld or layoff before discarding. The server runs a preflight check: if the selected card cannot be legally melded or laid off given the hand you would have after taking all taken cards, the dive is rejected with `ERR_NO_LEGAL_DIVE` (prevents an unresolvable obligation).

`mustMeldCardId` is cleared as soon as the card appears in a subsequent `meld` or `layoff` message.

After any successful `drawFromPile`, `phase` advances to `"meld"`.

**Response:** A [`state`](#state--game-state) message is sent. The acting player receives both `public` and `private` (their updated hand). All other players receive `public` only.

**Errors:**

| Code | Condition |
| --- | --- |
| `ERR_NOT_IN_ROOM` | This socket is not associated with any room |
| `ERR_WRONG_STATE` | Game is not in progress |
| `ERR_NOT_IMPLEMENTED` | Game variation is not `rum500` |
| `ERR_NOT_YOUR_TURN` | It is not this player's turn |
| `ERR_WRONG_PHASE` | Current phase is not `"draw"` |
| `ERR_CARD_NOT_IN_PILE:<id>` | The specified card is not in the discard pile |
| `ERR_NO_LEGAL_DIVE` | Preflight failed: the selected card cannot be legally melded or laid off given the cards that would be taken (only thrown for true pile dives, not top-card draws) |

---

### `meld` — Place a meld from hand

```json
{ "t": "meld", "cardIds": ["string", ...] }
```

Places a new meld on the table using cards from your hand. Valid only on your turn when `phase` is `"meld"` or `"discard"`.

A **set** is 3 or 4 cards of the same rank. A **run** is 3 or more consecutive cards of the same suit. Minimum 3 cards in either case.

Game-variation differences:

- **Basic:** ace is low only; round-the-corner is disabled unless the corresponding house rules are enabled. Multiple melds per turn are allowed unless the "maximum one meld per turn" house rule is enabled, in which case a second meld in the same turn returns `ERR_MAX_ONE_MELD`. The phase stays at `"meld"` after a meld so the player can meld further before discarding.
- **500 Rummy:** ace direction is inferred per meld from the run's neighbors (`A-2-3...` → low, `...Q-K-A` → high). Multiple melds and layoffs are allowed per turn; the phase stays at `"meld"` until the player discards.
- **Gin:** **not supported** — Gin reveals melds only at knock time. `meld` always returns `ERR_NOT_SUPPORTED`. Use [`knock`](#knock--gin-knock-or-go-gin) instead.

If the player's `PublicState.mustMeldCardId` is included in `cardIds`, that field is cleared after the meld.

**Response:** A [`state`](#state--game-state) message. The acting player receives `public` and `private`. All other players receive `public` only.

**Errors:**

| Code | Condition |
| --- | --- |
| `ERR_NOT_IN_ROOM` | This socket is not associated with any room |
| `ERR_WRONG_STATE` | Game is not in progress |
| `ERR_NOT_YOUR_TURN` | It is not this player's turn |
| `ERR_WRONG_PHASE` | Current phase is not `"meld"` or `"discard"` |
| `ERR_NOT_SUPPORTED` | Game variation is `gin` (melds declared at knock time) |
| `ERR_CARD_NOT_IN_HAND:<id>` | A specified card is not in the player's hand |
| `ERR_UNKNOWN_CARD:<id>` | A specified card ID is not recognized |
| `ERR_INVALID_MELD` | The cards do not form a valid set or run |
| `ERR_CANNOT_PLAY_LAST_CARD` | 500 Rummy only: the meld would empty the hand. A player must retain a card to discard (rules.md A.4.8). The "last card may be played" house rule would lift this; not scaffolded |
| `ERR_MAX_ONE_MELD` | Basic only, "Maximum one meld per turn" house rule enabled: a meld has already been placed this turn |

---

### `layoff` — Lay off a card onto an existing meld

```json
{ "t": "layoff", "meldId": "string", "cardId": "string" }
```

Adds one card from your hand onto any meld already on the table (your own or another player's). Valid only on your turn when `phase` is `"meld"` or `"discard"`.

Game-variation differences:

- **Basic:** layoff is unrestricted unless the "layoff requires a prior meld" house rule is enabled (rules.md A.1.6 step 3), in which case a player with no meld of their own gets `ERR_LAYOFF_REQUIRES_MELD`.
- **500 Rummy:** no own-meld requirement. The card is credited to the layoff player for scoring purposes, not the meld's original owner. Layoffs that include `mustMeldCardId` clear that obligation.
- **Gin:** **not supported during regular play** — Gin layoffs happen only in the `layoff` phase after a knock, via the separate [`ginLayoff`](#ginlayoff--gin-defender-layoff) message. Plain `layoff` returns `ERR_NOT_SUPPORTED` in Gin.

The card must extend the target meld while keeping it valid. Multiple layoffs are allowed per turn.

**Response:** A [`state`](#state--game-state) message. The acting player receives `public` and `private`. All other players receive `public` only.

**Errors:**

| Code | Condition |
| --- | --- |
| `ERR_NOT_IN_ROOM` | This socket is not associated with any room |
| `ERR_WRONG_STATE` | Game is not in progress |
| `ERR_NOT_YOUR_TURN` | It is not this player's turn |
| `ERR_WRONG_PHASE` | Current phase is not `"meld"` or `"discard"` |
| `ERR_NOT_SUPPORTED` | Game variation is `gin` (use `ginLayoff` during `layoff` phase) |
| `ERR_CARD_NOT_IN_HAND:<id>` | The specified card is not in the player's hand |
| `ERR_UNKNOWN_CARD:<id>` | The specified card ID is not recognized |
| `ERR_MELD_NOT_FOUND` | `meldId` does not match any meld on the table |
| `ERR_INVALID_LAYOFF` | Adding the card would make the target meld invalid. `msg` contains a specific reason (e.g. wrong suit, rank out of range, set full) |
| `ERR_CANNOT_PLAY_LAST_CARD` | 500 Rummy only: laying off your last card. A player must retain a card to discard (rules.md A.4.8). The "last card may be played" house rule would lift this; not scaffolded |

---

### `discard` — Discard a card and end your turn

```json
{ "t": "discard", "cardId": "string" }
```

Places one card from your hand onto the discard pile and ends your turn. Valid only on your turn when `phase` is `"meld"` or `"discard"`. You may discard without having melded or laid off.

**House rules:**

- **Basic:** you cannot discard the card you drew from the discard pile on the same turn (`ERR_CANNOT_DISCARD_DRAWN_CARD`).
- **500 Rummy:** you cannot discard while `PublicState.mustMeldCardId` is set (`ERR_MUST_USE_PILE_CARD`). Place the pile-drawn card in a meld or layoff first.
- **Gin:** standard discard ends the turn (advances to the other player's `draw` phase). To end the hand, use [`knock`](#knock--gin-knock-or-go-gin) instead. **Stock-depletion cancel** (rules.md A.2.3): if the discard reduces stock to ≤ 2 cards without a knock, the hand is cancelled — no scoring, same dealer re-deals.

If discarding empties your hand (basic / 500 Rummy), the hand ends immediately.

**Normal response (hand continues):** A [`state`](#state--game-state) message is sent. The acting player receives `public` and `private`. All other players receive `public` only. Turn advances to the next active player with `phase` reset to `"draw"`.

**Hand-end response (hand emptied — basic / 500 Rummy):** Three messages are sent to all connected players:

1. An [`event`](#event--game-event) with `kind: "wonHand"` identifying the winner; `data` contains `finalHands`, `meldCredits`, `handDeadwood` (see [event docs](#event--game-event))
2. If the game is now over: an [`event`](#event--game-event) with `kind: "gameOver"` identifying the overall winner
3. A [`state`](#state--game-state) with both `public` and each player's own `private` hand

**Hand-cancelled response (Gin stock-depletion):** Two messages are sent to all connected players:

1. An [`event`](#event--game-event) with `kind: "handCancelled"` (no scoring)
2. A [`state`](#state--game-state) with both `public` and each player's own `private` hand (phase = `"ended"`)

**Errors:**

| Code | Condition |
| --- | --- |
| `ERR_NOT_IN_ROOM` | This socket is not associated with any room |
| `ERR_WRONG_STATE` | Game is not in progress |
| `ERR_NOT_YOUR_TURN` | It is not this player's turn |
| `ERR_WRONG_PHASE` | Current phase is not `"meld"` or `"discard"` |
| `ERR_CANNOT_DISCARD_DRAWN_CARD` | Attempted to discard the card drawn from the discard pile this turn (both basic and 500 Rummy — applies to top-card draws in both game variations) |
| `ERR_MUST_USE_PILE_CARD` | Pile-dive obligation unmet: the selected card has not yet been melded or laid off (500 Rummy true pile dives only) |
| `ERR_CARD_NOT_IN_HAND:<id>` | The specified card is not in the player's hand |
| `ERR_UNKNOWN_CARD:<id>` | The specified card ID is not recognized |

---

### `chat` — Send a chat message

```json
{ "t": "chat", "text": "string" }
```

Sends a chat message to all players in the room. The server trims `text` to 200 characters and silently drops empty messages.

**Response:** A [`chat`](#chat--chat-message) message broadcast to all players in the room, including the sender.

**Errors:**

| Code | Condition |
| --- | --- |
| `ERR_NOT_IN_ROOM` | This socket is not associated with any room |

---

### `keepalive` — Idle keep-alive

```json
{ "t": "keepalive" }
```

Liveness ping. Cloudflare drops WebSocket connections that go idle, so the client sends this when it has not **sent** anything for ~30 seconds (keyed off last-sent, not last-received, so a player who is only receiving still emits — the other side relies on these frames to detect a silent drop). The server relays it to the **other** players in the room (not the sender) as a [`keepalive`](#keepalive--relayed-keep-alive) message, keeping their sockets warm too. No effect on game state. Silently ignored if the socket is not in a room.

---

### `leave` — Leave the room

```json
{ "t": "leave" }
```

Voluntarily leave the room from the lobby, an in-progress game, or the between-hands screen. The game is cancelled for everyone: the server broadcasts an [`event`](#event--game-event) with `kind: "playerLeft"` to the **other** players, detaches every player's socket (so they can immediately create or join a new room), and deletes the room. The leaving client returns itself to the start page locally; the others do so on receiving the `playerLeft` event.

**Response:** A [`playerLeft`](#event--game-event) event to the other players. No response to the sender.

**Errors:**

| Code | Condition |
| --- | --- |
| `ERR_NOT_IN_ROOM` | This socket is not associated with any room |

---

### `knock` — Gin knock or go gin

```json
{ "t": "knock", "melds": [["cardId", ...], ...], "discardId": "string" }
```

Gin only. Ends the hand by declaring meld groups and a face-down discard (rules.md A.2.4). Valid only on your turn when `phase` is `"discard"`.

- `melds` (optional) — array of card-id groups; each group becomes a meld owned by the knocker. Each group must independently be a valid set or run. A card may appear in at most one group.
- `discardId` (required) — id of the card discarded face-down to signal the knock. Must be in the player's hand and not appear in any declared meld group.

The server applies all declared melds, removes the discard, then computes **deadwood** = sum of remaining unmelded cards (A=1, 2-10=pip, J/Q/K=10). If deadwood > 10 the action is rejected with `ERR_CANNOT_KNOCK`.

Either way, `phase` advances to `"layoff"`, `turnPlayerId` switches to the defender, and `PublicState.ginKnockerId` is set. The defender submits [`ginLayoff`](#ginlayoff--gin-defender-layoff) to finish the hand:

- **Regular knock** (`deadwood > 0`): the defender declares their own melds **and** may lay off onto the knocker's melds.
- **Gin** (`deadwood === 0`): the defender declares their own melds **only** — laying off onto the knocker's melds is forbidden (rules.md A.2.4). The knocker's hand is empty, so clients detect gin via the knocker's `handCount === 0`.

(If there is no active defender — e.g. the opponent forfeited — `phase` goes straight to `"ended"` and `handleHandEnd` runs.)

**Response:** `state` broadcast to all players with `phase = "layoff"` and `turnPlayerId` = the defender. The hand-end events (`wonHand` + optional `gameOver` + final `state`) follow the defender's `ginLayoff`.

**Errors:**

| Code | Condition |
| --- | --- |
| `ERR_NOT_IN_ROOM` | This socket is not associated with any room |
| `ERR_WRONG_STATE` | Game is not in progress |
| `ERR_NOT_IMPLEMENTED` | Game variation is not `gin` |
| `ERR_NOT_YOUR_TURN` | It is not this player's turn |
| `ERR_WRONG_PHASE` | Current phase is not `"discard"` |
| `ERR_KNOCK_REQUIRES_DISCARD` | `discardId` is missing |
| `ERR_CANNOT_DISCARD_MELDED_CARD` | `discardId` appears in one of the declared meld groups |
| `ERR_CANNOT_DISCARD_DRAWN_CARD` | `discardId` is the card drawn from discard pile this turn |
| `ERR_CARD_NOT_IN_HAND:<id>` | A specified card (in any meld group or `discardId`) is not in the player's hand |
| `ERR_CARD_IN_MULTIPLE_MELDS:<id>` | The same card appears in more than one declared group |
| `ERR_INVALID_MELD` | A declared group is not a valid set or run |
| `ERR_CANNOT_KNOCK` | Deadwood after the declared melds + discard exceeds 10. `msg` includes the computed deadwood. |

---

### `ginLayoff` — Gin defender layoff

```json
{
  "t": "ginLayoff",
  "ownMelds": [["cardId", ...], ...],
  "layoffs": [{ "cardId": "string", "meldId": "string" }, ...]
}
```

Gin only. Submitted by the defender during `phase = "layoff"` after a knock — gin or regular (rules.md A.2.4 step 3). Ends the hand.

- `ownMelds` (optional) — defender's own meld groups, separated from deadwood. Validated and applied first. Always permitted: the defender forms their own melds after both a gin and a regular knock, reducing their deadwood.
- `layoffs` (required, may be empty) — extension cards onto the **knocker's** melds. Each entry's card must legally extend the named meld. **Forbidden after a gin knock** — a non-empty `layoffs` against gin returns `ERR_NO_LAYOFF_AGAINST_GIN`.

Submit an empty `layoffs: []` (and no `ownMelds`) to skip both entirely.

Once processed, the server runs hand-end scoring. Defender's deadwood (post-layoff) is compared to knocker's deadwood — undercut goes to defender if defender's deadwood ≤ knocker's.

**Response:** same as discard hand-end (event `wonHand` + optional `gameOver` + final `state`).

**Errors:**

| Code | Condition |
| --- | --- |
| `ERR_NOT_IN_ROOM` | This socket is not associated with any room |
| `ERR_WRONG_STATE` | Game is not in progress |
| `ERR_NOT_IMPLEMENTED` | Game variation is not `gin` |
| `ERR_NOT_YOUR_TURN` | Defender is not this player |
| `ERR_WRONG_PHASE` | Current phase is not `"layoff"` |
| `ERR_CARD_NOT_IN_HAND:<id>` | A specified card is not in the defender's hand |
| `ERR_CARD_IN_MULTIPLE_MELDS:<id>` | The same card appears in `ownMelds` and `layoffs`, or twice in `layoffs` |
| `ERR_INVALID_MELD` | An `ownMelds` group is not a valid set or run |
| `ERR_MELD_NOT_FOUND:<id>` | `meldId` does not match any meld in play |
| `ERR_INVALID_LAYOFF` | The cardId does not legally extend the target meld |
| `ERR_NO_LAYOFF_AGAINST_GIN` | `layoffs` is non-empty but the knocker went gin — only `ownMelds` are allowed |

---

### `passUpcard` — Gin decline initial upcard offer

```json
{ "t": "passUpcard" }
```

Gin only. Valid only during `phase = "firstUpcardOffer"` (rules.md A.2.2). The non-dealer is offered the upcard first; on pass, the offer moves to the dealer; if both pass, the hand opens normally with the non-dealer drawing from stock.

**Response:** `state` broadcast to all players. Turn and phase may change:

- Non-dealer passes → turn moves to dealer; phase stays `"firstUpcardOffer"`.
- Dealer passes → phase becomes `"draw"`; turn returns to the non-dealer.

**Errors:**

| Code | Condition |
| --- | --- |
| `ERR_NOT_IN_ROOM` | This socket is not associated with any room |
| `ERR_WRONG_STATE` | Game is not in progress |
| `ERR_NOT_IMPLEMENTED` | Game variation is not `gin` |
| `ERR_NOT_YOUR_TURN` | It is not this player's turn |
| `ERR_WRONG_PHASE` | Current phase is not `"firstUpcardOffer"` |

---

## Server → Client Messages (S2C)

---

### `lobby` — Lobby state

```json
{
  "t": "lobby",
  "roomCode": "string",
  "variant": "basic"|"gin"|"rum500",
  "hostId": "string",
  "players": [{ "id": "string", "name": "string" }, ...],
  "sessionId": "string"
}
```

Sent to all players in the room whenever the lobby changes: when a player creates, joins, or reconnects, and when a player's lobby reconnect window expires and they are removed. Also sent to a **single** player on a successful mid-game reconnect (followed by a `state` message) so a reloaded tab can recover its identity, roster, and `sessionId`.

`hostId` identifies which player is the host. The host can change — if the host disconnects, the server promotes the next connected player.

`sessionId` is a **signed token that is unique to the receiving player**. It is different for each player in the room. Save it persistently. It is required to reconnect if the socket drops.

---

### `state` — Game state

```json
{
  "t": "state",
  "public": PublicState,
  "private": PrivateState
}
```

Sent after every game action and on game start, hand end, forfeit, and mid-game reconnect. `private` is present only when the message is addressed specifically to you:

- **On game start, hand end, forfeit, or any player's mid-game reconnect:** every connected player receives a `state` message that includes both `public` and their own `private` hand.
- **On draw, meld, layoff, or discard:** only the acting player receives a `state` with `private`. All other players receive `state` with `public` only.

When you receive a `state` message without `private`, your hand has not changed. Do not clear it from local state.

---

### `event` — Game event

```json
{ "t": "event", "kind": "string", "playerId": "string", "data": any }
```

Broadcast to all players when a notable game event occurs. `playerId` identifies who triggered the event. `data` is optional; its shape depends on `kind` and is described below.

| `kind` | Sent when | `data` |
| --- | --- | --- |
| `gameStarted` | The host triggered game start | absent |
| `wonHand` | Hand ended with a winner | `{ finalHands, meldCredits, handDeadwood, ginInfo? }` — see below |
| `handCancelled` | Gin hand cancelled (stock-depletion, rules.md A.2.3) | absent |
| `playerLeft` | A player left the room via the leave button; game cancelled | absent |
| `playerDisconnected` | A player's socket dropped mid-game; the 60s reconnect grace window is now open | absent |
| `playerReconnected` | A previously-disconnected player rebound their socket within the grace window | absent |
| `forfeit` | A player's grace window expired (or they dropped non-gracefully) and they are now out of the hand | absent |
| `gameOver` | The game-ending score threshold has been reached, or only one active player remains after a forfeit | absent |
| `drew` | A player completed a draw | `{ "from": "stock" \| "discard" \| "pile" }` — `pile` = 500 Rummy pile dive (`drawFromPile`) |
| `melded` | A player placed a meld from hand | absent |
| `laidOff` | A player laid off onto an existing meld (`layoff`, or the gin defender's `ginLayoff`) | absent |
| `discarded` | A player discarded | absent |
| `knocked` | Gin: a player knocked or went gin (rules.md A.2.4) | absent |
| `passedUpcard` | Gin: a player declined the initial upcard offer (rules.md A.2.2) | absent |

Action events (`drew`, `melded`, `laidOff`, `discarded`, `knocked`, `passedUpcard`) are broadcast immediately **before** the `state` broadcast for the same action, so clients can key sounds or animations off events without diffing state. Unlike `state`, events are never re-sent on reconnect.

#### `wonHand` data

```json
{
  "finalHands":   { "<playerId>": [Card, ...] },           // unmelded cards remaining
  "meldCredits":  { "<playerId>": [{ "card": Card, "pts": number }, ...] },  // cards placed by this player + per-card pts
  "handDeadwood": { "<playerId>": number },                // sum of unmelded card values (game-variation-correct ace value)
  "ginInfo": {                                             // gin only
    "knockerId": "string",
    "knockerDeadwood": number,
    "defenderDeadwood": number,
    "result": "gin" | "knock" | "undercut"
  }
}
```

- `finalHands` — every player's remaining unmelded cards at hand-end. Winner of basic/500 Rummy has empty array; Gin knocker may still hold deadwood.
- `meldCredits` — keyed by **placer** (not meld owner). 500 Rummy credits the layoff player for points; basic placer == owner. Each entry includes pre-computed per-card points (500 Rummy: ace=1 in A-2-3, =15 elsewhere). Gin entries are empty (Gin scores via deadwood comparison, not meld accumulation).
- `handDeadwood` — sum of unmelded card values per player. Ace value = 15 for 500 Rummy; = 1 for basic and Gin.
- `ginInfo` — present only for Gin. `result` distinguishes knock outcomes; client renders the appropriate label and bonus breakdown.

---

### `error` — Error response

```json
{ "t": "error", "code": "string", "msg": "string" }
```

Sent to the client that caused the error. `code` is a machine-readable `ERR_*` identifier. `msg` is a human-readable description of the problem.

The connection stays open after an error. The game state is unchanged.

Global error codes (not tied to a specific action):

| Code | Condition |
| --- | --- |
| `ERR_INVALID_JSON` | Message is not valid JSON |
| `ERR_INVALID_MSG` | JSON is valid but has no `t` field |
| `ERR_RATE_LIMIT` | Exceeded 20 messages/second |
| `ERR_TOO_MANY_CONNECTIONS` | IP already has 10 open connections (connection is closed after this) |

---

### `chat` — Chat message

```json
{ "t": "chat", "from": "string", "text": "string" }
```

Broadcast to all players in the room when any player sends a chat. `from` is the sender's display name.

---

### `keepalive` — Relayed keep-alive

```json
{ "t": "keepalive", "from": "playerId" }
```

Relayed to the other players in a room when one player sends a [`keepalive`](#keepalive--idle-keep-alive). `from` is the originating player's ID. The recipient records `from`'s last-seen time (used for [silent-drop detection](#silent-drop-detection-client-side)) and otherwise ignores the frame. Receiving a frame does **not** suppress the recipient's own keepalive emission — that is keyed off when it last *sent*, so both players emit independently even when one is only listening.

---

## Session Management

When you connect and send `create` or `join`, the server assigns you a player ID and a session. The session is delivered as a `sessionId` field inside the `lobby` message — not via an HTTP cookie. You must save this value yourself (e.g., in `localStorage`).

If your WebSocket connection drops you have a 60-second window to reconnect and resume — both in the lobby (seat held) and mid-game (same hand resumed). Clients should auto-reconnect on an unexpected close and re-send `join` with the saved `sessionId` on each successful reconnect; the reference client does this with capped exponential backoff over roughly the grace window.

### Example: Creating a Room

**Client sends:**

```json
{ "t": "create", "variant": "basic", "name": "Alice" }
```

**Server responds (to Alice only):**

```json
{
  "t": "lobby",
  "roomCode": "A7K3M",
  "variant": "basic",
  "hostId": "player-uuid-alice",
  "players": [{ "id": "player-uuid-alice", "name": "Alice" }],
  "sessionId": "signed.token.alice"
}
```

Alice stores `"signed.token.alice"` and `"A7K3M"`.

### Example: Joining a Room

**Client (Bob) sends:**

```json
{ "t": "join", "roomCode": "A7K3M", "name": "Bob" }
```

**Server sends to Alice:**

```json
{
  "t": "lobby",
  "roomCode": "A7K3M",
  "variant": "basic",
  "hostId": "player-uuid-alice",
  "players": [
    { "id": "player-uuid-alice", "name": "Alice" },
    { "id": "player-uuid-bob",   "name": "Bob"   }
  ],
  "sessionId": "signed.token.alice"
}
```

**Server sends to Bob:**

```json
{
  "t": "lobby",
  "roomCode": "A7K3M",
  "variant": "basic",
  "hostId": "player-uuid-alice",
  "players": [
    { "id": "player-uuid-alice", "name": "Alice" },
    { "id": "player-uuid-bob",   "name": "Bob"   }
  ],
  "sessionId": "signed.token.bob"
}
```

Alice and Bob receive the same `lobby` message except for the `sessionId` field, which is unique per player.

### Example: Reconnecting in the Lobby

Bob's connection drops. Within 60 seconds, Bob reconnects and sends:

```json
{ "t": "join", "roomCode": "A7K3M", "name": "ignored", "sessionId": "signed.token.bob" }
```

The server broadcasts a `lobby` message to Alice and Bob as normal. Bob's seat is restored.

If more than 60 seconds pass before Bob reconnects, his seat is removed and `lobby` is broadcast to the remaining players with Bob absent. Bob would need to join as a new player (send `join` without `sessionId`).

### Example: Reconnecting Mid-Game

The game has started and Bob's connection drops. The server broadcasts a `playerDisconnected` event to Alice and starts a 60-second grace timer. Within that window Bob reconnects and sends the same `join`+`sessionId` message:

```json
{ "t": "join", "roomCode": "A7K3M", "name": "ignored", "sessionId": "signed.token.bob" }
```

The server cancels the grace timer and:

- sends **Bob** a `lobby` message (identity recovery) followed by a `state` message with his `private` hand;
- sends **Alice** a `playerReconnected` event and a fresh `state`.

If the grace window expires first, Bob is forfeited: the server broadcasts `forfeit` (and `gameOver` if only one active player remains). A later reconnect attempt then returns:

```json
{ "t": "error", "code": "ERR_GAME_IN_PROGRESS", "msg": "Cannot reconnect — the game has ended" }
```

---

## Turn Flow

### Phase Sequence

`PublicState.phase` reflects the current phase. Game variations differ:

**Basic / 500 Rummy:**

```text
"draw"  →  "meld"  →  (next player's turn, phase resets to "draw")
```

After drawing, the player may meld and lay off any number of times, then must discard to end their turn. Melding and laying off may be skipped entirely. Discard is legal from `"meld"` phase — the player does not need to meld before discarding.

The `"discard"` phase value exists but is not set by basic or 500 Rummy. The "maximum one meld per turn" house rule is enforced without a phase change — a second meld while the rule is enabled returns `ERR_MAX_ONE_MELD`, still from the `"meld"` phase. Clients should treat `"discard"` the same as `"meld"` for action legality purposes.

**Gin:**

```text
"firstUpcardOffer"  →  "draw"  →  "discard"  →  (knock?)  →  "layoff"?  →  "ended"
                                  ↓
                          (else next player's turn, phase resets to "draw")
```

- `"firstUpcardOffer"` — non-dealer offered the upcard first. Send `draw {from:"discard"}` to take it (advance to `"discard"`), or `passUpcard` to decline. On dealer's pass, phase becomes `"draw"` with turn back to non-dealer.
- `"draw"` — draw from stock or discard top. Advances to `"discard"`. There is no `"meld"` phase in Gin — melds reveal only at knock time.
- `"discard"` — choose `discard` (continue) or `knock` (end hand). A discard that reduces stock to ≤ 2 cards cancels the hand (rules.md A.2.3); a knock declares melds + face-down discard.
- `"layoff"` — defender's phase after a knock (gin or regular). Defender submits `ginLayoff` to declare their own melds, and — only after a regular knock — extend the knocker's melds. (No layoff against gin: `ERR_NO_LAYOFF_AGAINST_GIN`.) Hand then ends.
- `"ended"` — hand over (either via knock/gin, hand-empty win, forfeit, or stock-depletion cancel).

### Example: A Full Turn with Meld and Layoff

The current state has `turnPlayerId: "player-uuid-alice"` and `phase: "draw"`.

**Step 1 — Alice draws from the stock:**

Alice sends:

```json
{ "t": "draw", "from": "stock" }
```

Alice receives (phase is now `"meld"`, her hand has the new card):

```json
{
  "t": "state",
  "public": { "...": "...", "phase": "meld", "stockSize": 23 },
  "private": { "hand": ["...her 11 cards..."] }
}
```

Bob receives (no `private` — his hand has not changed):

```json
{
  "t": "state",
  "public": { "...": "...", "phase": "meld", "stockSize": 23 }
}
```

**Step 2 — Alice places a meld:**

Alice sends:

```json
{ "t": "meld", "cardIds": ["card-id-7H", "card-id-7D", "card-id-7S"] }
```

Alice receives `state` with `phase: "meld"` and her updated hand (three cards removed). Bob receives `state` with `public` only and can see Alice's new meld in `players[].melds`.

**Step 3 — Alice lays off a card onto Bob's existing run:**

Alice sends:

```json
{ "t": "layoff", "meldId": "meld-uuid-bobs-run", "cardId": "card-id-8H" }
```

Alice receives `state` with her updated hand. Bob receives `state` with `public` only, and can see his meld's `cardIds` now includes `"card-id-8H"`.

**Step 4 — Alice discards to end her turn:**

Alice sends:

```json
{ "t": "discard", "cardId": "card-id-KD" }
```

Alice receives `state` with `phase: "draw"` and `turnPlayerId: "player-uuid-bob"`. Bob receives `state` with `public` only (his turn begins).

### Example: Discarding Without Melding

A player may skip straight to discard after drawing. There is no requirement to meld.

Alice sends:

```json
{ "t": "draw", "from": "stock" }
```

Phase becomes `"meld"`. Alice then immediately sends:

```json
{ "t": "discard", "cardId": "card-id-2C" }
```

Phase becomes `"draw"` and the turn advances to the next player.

---

## Disconnect Behavior

### Disconnect in Lobby

When a player's socket closes during the lobby phase, their seat is held for 60 seconds to allow reconnect. If they reconnect within that window, a `lobby` broadcast goes out as normal. After 60 seconds without reconnect, the player is removed and `lobby` is broadcast to the remaining players. If the departing player was the host, the next connected player in the list becomes the new host.

### Disconnect During Play

A socket close during the game does **not** forfeit the player immediately. Instead the server:

1. Broadcasts an [`event`](#event--game-event) with `kind: "playerDisconnected"` to the remaining players (so they can show a "waiting for reconnect" cue)
2. Starts a 60-second grace timer

**If the player reconnects within the window** (via `join`+`sessionId`, see [Reconnecting Mid-Game](#example-reconnecting-mid-game)), the timer is cancelled, the returning player gets a `lobby`+`state` pair, and the others get a `playerReconnected` event plus fresh `state`. The hand resumes exactly where it was. While a player is disconnected it remains their turn if it was — the game waits for them rather than skipping ahead.

**If the window expires**, the server forfeits the player:

1. Sets the player's status to `"forfeited"` in both the room and the engine
2. Removes that player's hand and melds from play (they are not returned to the stock or discard pile)
3. If it was the forfeiting player's turn, advances to the next active player with `phase` reset to `"draw"`
4. Broadcasts an [`event`](#event--game-event) with `kind: "forfeit"` to all remaining players
5. Broadcasts a [`state`](#state--game-state) with both `public` and each remaining player's own `private` hand

If only one active player remains after the forfeit, that player wins and the server additionally broadcasts `kind: "gameOver"` before the final `state`.

A re-deal (host starts the next hand) drops any still-disconnected player and clears their pending grace timer.

### Silent-drop detection (client-side)

A clean socket close triggers the server's grace-then-forfeit path above. But an ungraceful drop (network partition, sleeping laptop) may leave the server's socket open with no `close` event, so neither `playerDisconnected` nor `forfeit` is ever sent. To cover this, each client tracks a per-player last-seen time, refreshed by any frame attributable to that player: a relayed [`keepalive`](#keepalive--relayed-keep-alive), an [`event`](#event--game-event), a [`chat`](#chat--chat-message), or a [`state`](#state--game-state) broadcast (a state broadcast proves the server just processed an action, so every non-self player was alive). If a player goes unheard for **5 minutes**, the client shows a "probably disconnected — cancel the game?" prompt; confirming sends [`leave`](#leave--leave-the-room). This 5-minute heuristic is a slow backstop for the server's faster 60-second grace path — the latter handles ordinary clean drops. Because keepalives are emitted on a last-*sent* timer, both players keep emitting even during long idle stretches, so this threshold is only crossed by a genuine drop. A subsequent `forfeit` or `gameOver` for the warned player clears the prompt automatically.

> Note: the reference client also surfaces its **own** connection state — a fixed banner shows "reconnecting…" during auto-reconnect and an opponent-disconnected banner while the server's grace window is open (driven by `playerDisconnected`/`playerReconnected`).
