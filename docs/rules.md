# Rummy Rules -- Synthesized Reference

Compiled from **primary authoritative sources** (Bicycle Cards + Pagat) and **secondary sources** (general web). Designed for machine consumption: stable headings, tables, explicit numeric ranges, source-tagged inconsistencies.

**Primary sources (authoritative -- use these when conflicts exist with secondary sources):**

- `[BIC-R]` bicyclecards.com/how-to-play/rummy-rum
- `[BIC-G]` bicyclecards.com/how-to-play/gin-rummy
- `[BIC-C]` bicyclecards.com/how-to-play/continental-rummy
- `[BIC-K]` bicyclecards.com/how-to-play/knock-rummy
- `[BIC-5]` bicyclecards.com/how-to-play/500-rum
- `[BIC-T]` bicyclecards.com/how-to-play/tunk
- `[PG-R]` pagat.com/rummy/rummy.html
- `[PG-K]` pagat.com/rummy/knock.html
- `[PG-G]` pagat.com/rummy/ginrummy.html
- `[PG-T]` pagat.com/rummy/tonk.html
- `[PG-5]` pagat.com/rummy/500rum.html

**Secondary sources:**

- `[PR]` playrummy.com/rummy-variations.php
- `[RRB]` rummyrulebook.com/pages/standard-rummy
- `[RP]` rarepike.com/rummy/variants
- `[WP]` en.wikipedia.org/wiki/Rummy
- `[GR]` gamerules.com/rules/rummy-card-games
- `[GNM]` gamenightmastery.com/types-of-rummy
- `[GT]` gamerisms.com/rummy-terms (terminology only)

**Conflict resolution policy:** when authoritative primaries disagree with secondaries, use primaries, but note variation. When primaries disagree with each other, see the Inconsistencies section.

**Terminology — "house rule":** in this document, any rule, value, or option flagged *(house rule)* is **host-configurable** — the game host may enable or disable it when creating a room. House rules are not the document author's editorial picks; they are non-canonical variants that real-world play groups commonly adopt. The default behavior (when a house rule is disabled) is whatever the surrounding standard rule specifies.

---

## A.1 Basic Rummy (a.k.a. Rum)

### A.1.1 Setup

| Param | Value |
| --- | --- |
| Players | 2-7 |
| Deck | 1 × 52-card pack for 2-6 players; **2 × 52-card packs combined into a single deck for 7 players** |
| Jokers | Not used in basic rummy |

### A.1.2 Deal

| Players | Cards each |
| --- | --- |
| 2 | 10 |
| 3 | 7 |
| 4 | 7 |
| 5 | 6 |
| 6 | 6 |
| 7 | 10 |

Dealer rotation: random first dealer; alternates if 2P, clockwise otherwise.

**First player to act**: the player to the dealer's **left** (clockwise from dealer); the dealer acts last each turn cycle `[BIC-R, PG-R]`. In 2P, the non-dealer goes first.

Stock + discard: remaining cards face-down = stock; top card flipped face-up = upcard / discard pile start.

### A.1.3 Objective

Be first to dispose of all cards by forming **melds** (sets + runs), laying off, and discarding final card.

### A.1.4 Card rank

`K (high), Q, J, 10, 9, 8, 7, 6, 5, 4, 3, 2, A` -- ace low by default; A-2-3 valid, Q-K-A invalid.

**Ace-either-end** *(house rule)* `[BIC-R]`: ace may rank as either high or low in a run, so **both** `A-2-3` and `Q-K-A` are valid. `K-A-2` is **still invalid** under this rule alone — that requires the separate round-the-corner house rule.

**Round-the-corner** *(house rule)*: `K-A-2` is legal (ace wraps the deck).

### A.1.5 Melds

- **Set / Group / Book**: 3 or 4 cards of same rank. Example: `4♥ 4♦ 4♠`.
- **Sequence / Run**: 3+ consecutive cards of same suit. Example: `J♣ Q♣ K♣`.

### A.1.6 Turn

1. Draw 1: top of stock OR top of discard pile.
2. (Optional) Meld. A player may place any number of melds per turn.
   - **Maximum one meld per turn** *(house rule)* `[PG-R]`: when enabled, the player may place at most one meld this turn.
3. (Optional) Lay off cards onto own or others' existing melds.
   - **Layoff requires prior meld** *(house rule)* `[WP]`: when enabled, the player may only lay off if they have already placed at least one of their own melds (on any earlier turn, or earlier in the current turn).
4. Discard 1. If you drew the top discard, you may NOT discard that same card on the same turn.

### A.1.7 Going out + Rummy bonus

Going out = dispose of all cards via meld/lay-off/final discard. Play ceases immediately.

**Going Rummy** (going out in a single turn with no prior melding or laying off): each opponent's unmelded card point total (the amount the winner would normally collect from them; see A.1.8) is **doubled** before being credited to the winner.

**Flat +10 bonus** *(house rule)* `[PG-R]`: when enabled, the going-rummy bonus is a flat **+10 points** added to the winner's normal score instead of doubling each opponent's contribution.

### A.1.8 Scoring

Card values:

| Card | Points |
| --- | --- |
| Ace | 1 (or 11 in ace-either-end and round-the-corner variants) |
| 2-10 | face value |
| J, Q, K | 10 |

Winner score = sum of opponents' unmelded card point values.

**End-of-game**: first player to reach a cumulative score of **100 points** wins the game.

---

## A.2 Gin Rummy

### A.2.1 Setup

| Param | Value |
| --- | --- |
| Players | 2 |
| Deck | 52 cards, no jokers |
| Deal | 10 cards each |

### A.2.2 Melds

- Run: 3+ same suit consecutive.
- Set: 3 or 4 same rank.
- Ace low only (A-2-3 valid; A-K-Q invalid).

### A.2.3 Turn

1. Draw 1: top of stock OR top of discard pile.
2. (Optional) Knock before discarding — see A.2.4.
3. Discard 1. If you drew the top discard, you may NOT discard that same card on the same turn.

### A.2.4 Knock

Knock allowed when deadwood ≤ 10 points.

### A.2.5 Card values

| Card | Points |
| --- | --- |
| Ace | 1 |
| 2-10 | face value |
| J, Q, K | 10 |

### A.2.6 Bonuses

| Bonus | Value |
| --- | --- |
| Gin | 20 + opponent's unmatched count |
| Knock (knocker wins) | difference in unmatched values |
| Undercut | opponent scores difference + 10 bonus |
| Box / line bonus | 20 points per hand won |
| Game bonus | 100 |
| Shutout bonus | 100 `[BIC-G]` / 200 `[PG-G]` (opponent scored nothing) |
| Game target | 100+ points |

Gin bonus variant *(house rule)*: **25 points** + opponent's unmatched count `[GR]`.

### A.2.7 Game end

First player to cumulative ≥ 100 points wins; add game bonus + box bonuses.

---

## A.3 Knock Rummy

### A.3.1 Setup

| Players | Deal |
| --- | --- |
| 2 | 10 |
| 3-4 | 7 |
| 5-6 | 6 |

Deck: 1 x 52.

### A.3.2 Card values

| Card | Points |
| --- | --- |
| Ace | 1 |
| 2-10 | face value |
| J, Q, K | 10 |

### A.3.3 Turn

1. Draw 1: top of stock OR top of discard pile.
2. Knock or discard 1. If you drew the top discard, you may NOT discard that same card on the same turn. Knock may be taken before discarding — see A.3.4.

Hands stay concealed during play. There is no melding or laying off on the table; all scoring is computed from deadwood revealed at knock or hand end.

### A.3.4 Knock

Any player may knock before discarding, on any turn including their first. Knocker discards face down.

### A.3.5 Scoring

- Lowest deadwood count wins.
- Tie: tying player wins instead of knocker. Variant: knocker neither pays nor receives; non-knocker ties split winnings `[PG-K]` *(house rule)*.
- Penalty if knocker not lowest: 10 points + difference to lowest.
- **Rummy bonus** (going out with zero deadwood): each opponent pays their deadwood value + 25 points.

### A.3.6 End

Hand ends on knock or going out (laying all cards down on final turn without discard).

> **TODO** — primary sources `[BIC-K]` and `[PG-K]` need re-verification for the relationship between A.3.4 (knock with face-down discard) and A.3.6 (going out without discard): are both legitimate end conditions in standard knock rummy, and does "going out" with zero deadwood differ from the A.3.5 Rummy bonus? Compiled text here implies both end conditions coexist, but primaries have not been re-checked since this file was first synthesized.

---

## A.4 500 Rum (a.k.a. Pinochle Rummy, 500 Rummy)

### A.4.1 Setup

| Param | Value |
| --- | --- |
| Players | 2-8 |
| Deck | 1 x 52 (no jokers) for ≤4P; 2 x 52 (no jokers) for ≥5P |
| 2-player deal | 13 each. Alternatively, 10 each `[PR]` *(house rule)* |
| 3+ player deal | 7 each |

### A.4.2 Card values

| Card | Points |
| --- | --- |
| 2-10 | face value |
| J, Q, K | 10 |
| Ace | 15, or 1 when melded as A-2-3 sequence. |

Aces-score-15 variant *(house rule)*: Aces always 15 pts `[RP]`
low-5 variant *(house rule)*: 2-9 and ace in A-2-3 meld score 5, instead of face value and 1, respectively.

### A.4.3 Melds

- Group: 3 or 4 same rank. In 2-deck play: different suits required `[PG-5]` *(house rule)*.
- Sequence: 3+ consecutive same suit.
- No round-the-corner: `Q-K-A` valid, `A-2-3` valid, `K-A-2` invalid.

### A.4.4 Drawing from discard pile

Two draw modes (standard 500 Rum):

- **Single top card**: take only the top card of the discard pile. The drawn card **cannot be re-discarded on the same turn** but is otherwise unrestricted — it need not be melded or laid off this turn.
- **Pile dive** (any card below the top): take the selected card plus every card on top of it (the selected card and all cards above it move to the player's hand). The **selected card must be melded or laid off this turn before discarding**. No must-use restriction applies to the other cards taken from above.

**Unified obligation** *(house rule)*: when enabled, the selected card must be immediately melded or laid off regardless of whether it was the single top card or a deeper pile dive — top-card draws also become subject to the must-use restriction.

### A.4.5 Jokers (house rule) `[PG-5]`

Add 2 jokers per deck (value 15, wild). Substitute for any card in a meld. Once placed, the card it represents cannot be changed.

### A.4.6 Laying off

When laying off on another player's meld, place the card in front of yourself (you get the points).

### A.4.7 Scoring

Net score (per hand, per player) = value of all cards the player **placed** (own melds + cards laid off onto own or others' melds, per A.4.6) − value of cards remaining in the player's hand. Card values per A.4.2; ace direction in runs determined per meld (A.4.3).

Play continues across hands until one or more players' cumulative scores exceed **500**. If multiple players cross 500 in the same hand, the player with the highest cumulative score wins.

---

## A.5 Continental Rummy

Only one primary source -- no cross-primary check possible.

| Param | Value |
| --- | --- |
| Players | 4 or more (upper bound TODO — primary source `[BIC-C]` does not specify a maximum) |
| Deck | 2 x 52 + 1 joker per pack = 106 cards |
| Deal | 15 cards each, dealt 3 at a time |
| Stock + discard | next card flipped to start discard |

Going-out requirement (must meld entire hand as one of):

- Five 3-card sequences, OR
- Three 4-card sequences + one 3-card sequence, OR
- One 5-card + one 4-card + two 3-card sequences

(All combinations = sequences only, no sets.) No melding allowed until going out.

Scoring (points collected from each opponent):

| Event | Points |
| --- | --- |
| Going out | 1 |
| Each deuce melded | 1 |
| Each joker melded | 2 |
| Using no deuce or joker | 10 |
| Going out on first turn | 7 |
| Going out on first turn without drawing | 10 |
| All 15 cards in one suit | 10 |

---

## A.6 Tonk (a.k.a Tunk)

Note: two different games sharing the same name (Pagat vs. Bicycle)

### A.6.1 Pagat Rules

| Param | Value |
| --- | --- |
| Players | 2-4 (best 2-3) |
| Deck | 52, no jokers |
| Deal | 5 cards each. Variant: 7 cards each `[RP]` *(house rule)* |
| Ace | 1 point |
| 2-10 | face value |
| J, Q, K | 10 each |

**Initial auto-tonk**: hand totaling **49 or 50** → declare immediately, paid **2x basic stake** by each opponent. Multiple qualifiers = draw, no payment.

Spreads:

- Book: 3-4 same rank.
- Run: 3+ consecutive same suit.

Play options each turn:

- **Drop**: end play claiming lowest count. If dropper is lowest → win basic stake from each. If not lowest → pay 2x basic stake to each equal/lower count.
- **Draw → optionally spread / hit (lay off) → discard**.

Going out:

- Discard last card → basic stake.
- Lay down all cards with no final discard → **2x basic stake**.

Stock exhausted: lowest count wins basic stake from each player.

Variants: alternate auto-Tonk low thresholds (at or below 9, 13, 14, or 15) in addition to matching 49 or 50 exactly. Lowest or highest wins, but low beats high.

### A.6.2 Bicycle Rules

| Param | Value |
| --- | --- |
| Players | 2, 3, 4, 5+ |
| Deck | Standard 52 with **deuces wild** |
| Deal | 7 cards each |
| Ace | 1 or 11 contextual |
| Deuce | 2 points (wild card but still 2 pts when scored) |
| Others | face value; J/Q/K = 10 |

Going out (knock/"tunk"): before discarding, unmatched ≤ 5 points → may tunk.

Matched set requirement: must include at least two natural cards (deuces as wilds do not count toward this minimum).

First-upcard restriction: only player on dealer's left (whose turn comes first) may take the initial upcard.

Scoring: opponents' unmatched cards counted against them. If tunker not lowest → charged **double** their count.

Elimination: score reaches **100** → out. Last remaining player wins.

**⚠️ The Pagat and Bicycle versions of Tonk are not the same game.** Different card counts (5 vs 7), different wild rules (none vs deuces wild), different end conditions (stake-based vs 100-point elimination). Both are legitimate but distinct.

---

## Variants (Secondary Sources Only)

These variants have no primary-source coverage. Apply greater scrutiny.

### Variants Summary Table

| Variant | Players | Deck | Cards Dealt | Distinguishing rule | Primary section |
| --- | --- | --- | --- | --- | --- |
| Gin Rummy | 2 | 1x52 | 10 | Hidden hands; knock at deadwood ≤10 or gin (0 deadwood) | A.2 |
| Oklahoma Rummy | 2-4 / 2-6 | 1 or 2 x 52 | 10 / 7 | First discard sets max draw-pile pickup | -- |
| 500 Rummy / Pinochle Rummy | 2-8 | 1-2 x 52 | 13 (2P) / 7 (3+P) | Positive scoring: meld points credited; first to 500 wins | A.4 |
| Indian Rummy / Paplu / 13-Card | 2-6 (GR up to 10) | 2 x 52 + jokers | 13 | ≥2 sequences required; ≥1 **pure** (no joker) | -- |
| Indian Marriage Rummy | 2-6 | 2 x 52 | 13 | Special "marriage" card point values | -- |
| Contract Rummy / Liverpool / Shanghai | 3-8 | 2 x 52 + jokers | varies by round | Each round = specific meld contract | -- |
| Kalooki / Jamaican Rummy | 2-4 (GNM 2-6) | 2 x 52 + jokers | 9/10/11/12/13 by round | Progressive contracts; jokers wild | -- |
| Canasta | 4 (GR 4-6; GNM 2-6) | 2 x 52 + 4 jokers (108) | 11 | 7-card canastas; partnership; target 5,000 pts | -- |
| Hand and Foot | 4 (GR 2-6) | 4-5 x 52 + jokers | 11 hand + 11 foot (GR: 13+13) | Two-stage hand; canasta requirement to go out | -- |
| Tonk / Tunk | 2-4 (GR 2-3) | 1x52 | 5 (RP) / varies | Fast; "tonk out" = double stake; 49-50 hand auto-tonk per GR | A.6 |
| Knock Rummy | 2-6 | 1x52 | 10 (2P) / 7 (3-4P) / 6 (5-6P) | Knock when satisfied; compare deadwood | A.3 |
| Three-Thirteen | 2-4 | varies | 3 → 13 across 11 rounds | Card matching round number = wild | -- |
| German Rummy / Rommé | 2-6 | 2x52 + jokers | 13 | Initial meld ≥40 points; ace high or low, no round-the-corner | -- |
| Crazy Rummy | 3-6 | 1x52 | 7 (13 rounds) | Wild card rotates Ace→King per round | -- |
| Persian/Shanghai Rummy | 3-9 | 1+ x 52 | varies by round | Multi-round escalating objectives | -- |
| Pool Rummy | 2-6 | 1x52 | -- | Chip elimination format | -- |
| Carousel Rummy | 2-5 | 1x52 | 10 | No discarding; manipulate existing melds | -- |
| Dummy Rummy | 2-4 | 1x52 | -- | (sources do not detail unique rules) | -- |

### Indian Rummy

- 13 cards each.
- Must form ≥ 2 sequences; ≥ 1 must be **pure** (no joker / wild) `[RP, GR]`.
- Two joker types `[PR]`: printed joker + randomly chosen "wild joker" card.
- Penalty points for remaining cards on loss; first valid declare wins.
- Deck: 2 x 52 + jokers `[PR, GNM, RP]`; GR implies similar but gives no detail.

### Canasta

- **Canasta** = meld of 7 cards same rank. Natural (no wilds) scores higher than mixed/dirty.
- Max 3 wild cards per canasta `[GR]`.
- Only sets -- no runs `[GR]`. (Sambas = 7-card same-suit sequences in some variants `[PR]`.)
- Partnership (4 players in 2 teams).
- Game ends at 5,000 points.
- Discard pile can be "frozen" by wild discards.
- **Player count inconsistency**: PR/RP fix at 4; GR allows 4-6; GNM allows 2-6.

### Hand and Foot

- Each player gets two stacks: hand (played first), foot (played after hand emptied).
- Go-out requires ≥ 1 natural canasta + ≥ 1 mixed canasta `[RP]`.
- **Deal inconsistency**: RP says 11+11; GR says 13+13.

### Contract Rummy (example contracts per GR)

```text
Deal 1: 10 cards -- 2 sets
Deal 2: 10 cards -- 1 set + 1 sequence
...
Deal 7: 12 cards -- 3 sequences
```

Each round players must satisfy specified contract before melding.

### German Rummy (Rommé)

- 13 cards.
- Initial meld ≥ 40 points required before melding further cards.
- Aces both high and low allowed, BUT **no round-the-corner** (`K♠ A♠ 2♠` invalid).

---

## Terminology Glossary

Source: gamerisms.com `[GT]`

| Term | Definition |
| --- | --- |
| Meld | 3+ cards of same suit, same rank, or sequence |
| Run | 3-4 cards of same suit in sequence |
| Set | 3+ cards of equal rank |
| Sequence | Cards of same suit in numeric order |
| Spread | A melded set |
| Combination / Combo | 2-card matched set needing a 3rd |
| Draw | Take card from deck/stock |
| Discard | Place card face-up on discard pile |
| Blind discard | Discard without knowing if useful to opponent |
| Forcing | Intentionally discarding a card opponent must pick up |
| Upcard / Turn up | Top card of discard pile after deal |
| Go out | Get rid of last card |
| Go down | Lay all cards face-up |
| Go gin / Go rummy | Lay down full gin hand |
| Gin | Ten melded cards (Gin Rummy) |
| Knock | Announce hand over before reveal |
| Laying off | Add card to existing meld |
| Deadwood | Unmatched cards in hand |
| Off card | Card not matched, not in combo |
| Reducer | Low card swapped for higher to cut deadwood |
| Count | Point value of hand after subtracting melds |
| Advertising / Baiting | Discard to bait opponent's discard of similar rank |
| Block | Hold card to prevent opponent's meld |
| Safe discard | Card unlikely to be picked up |
| Concealed hand | Hand without prior melds (Canasta / Oklahoma Gin) |
| Illegal hand | Wrong card count (e.g., ≠10) |
| Shutout / Blitz | Win with opponents at 0 |
| Wild card | Substitutes for any card (e.g., Joker) |
| Natural card | Non-wild card |

---

## Engine Implementation Decision Tree

```text
# Based on primaries [BIC-*, PG-*]; secondary sources only fill gaps.
if game == basic_rummy:
    deck = 1*52, no jokers
    players in [2,6]
    deal = {2:10, 3:7, 4:7, 5:6, 6:6}
    ace = low default (configurable high)
    melds: set(3-4 same rank) | run(3+ same suit sequential)
    turn: draw(stock|top_discard) -> meld(<=1) -> lay_off? -> discard
    constraint: if drew top_discard, cannot discard same card same turn
    going_rummy_bonus: score *= 2  (or +10 variant per PG-R)
    score: opp_unmelded; A=1, 2-10=pip, JQK=10
elif game == gin:
    players == 2; deal = 10
    constraint: if drew top_discard, cannot discard same card same turn
    knock if deadwood <= 10
    gin = deadwood 0 -> +20 + opp_unmatched
    undercut -> opp +10 + difference
    box = +20 per hand won; game_end >= 100 -> +100 (or +200 shutout)
elif game == knock_rummy:
    deck = 1*52; players 2-6
    deal = {2:10, 3-4:7, 5-6:6}
    constraint: if drew top_discard, cannot discard same card same turn
    any turn before discard: knock (discard face-down)
    lowest_deadwood wins difference from each opponent
    tie_with_knocker -> non-knocker wins
    knocker_not_lowest -> pay 10 + difference to lowest
    rummy (0 deadwood) -> each opp pays their_deadwood + 25
    A=1, 2-10=pip, JQK=10
elif game == 500_rum:
    deck = 1*52 for <=4P, else 2*52  # no jokers standard; house rule: add 2 jokers/deck (value 15, wild)
    players 2-8
    deal = {2:13, else:7}
    ace = high or low not both
    A=15 (1 in A-2-3 run), 2-10=pip, JQK=10
    top-discard draw: cannot re-discard same turn (no must-meld obligation)
    pile dive (below top): must take all above; selected card must meld/layoff before discard
    lay_off others' melds -> points credit yourself
    score = melded_value - hand_value; target >= 500
elif game == continental:
    deck = 2*52 + 2 jokers = 106
    deal = 15
    must go out in one shot with sequences-only structure
    point awards per A.5
elif game == tonk_pagat:
    deck = 1*52, no jokers
    players 2-4; deal = 5
    initial 49 or 50 -> auto-tonk = 2x stake
    drop OR draw->spread/hit->discard each turn
    go_out_no_final_discard = 2x stake
elif game == tonk_bicycle:
    deck = 1*52 with deuces wild
    deal = 7
    knock(tunk) when unmatched <= 5
    tunker_not_lowest -> 2x count charged
    elimination at 100 points
elif game == indian:                 # secondary sources only
    deck = 2*52 + jokers; deal = 13
    >=2 sequences, >=1 pure (no joker)
elif game == canasta:                # secondary sources only
    deck = 2*52 + 4 jokers (108)
    deal = 11; partnership 4P; target 5000
```

---

## Source Notes

### Sources unavailable or unverified

- `officialgamerules.org/game-rules/rummy/` -- HTTP 403 Forbidden at compile time.
- `cardgameshub.com/.../Rummy-card-game-rules.pdf` -- raw PDF stream not OCR-able. Original linked content at `cardgameshub.com/knowledge-center/rummy-card-game-rules/`.
- `rummyrulebook.com/pages/standard-rummy` `[RRB]` -- ECONNREFUSED during 2026-05-21 re-verification. Rules attributed to `[RRB]` (deal counts, game-end target 100 or 300) could not be re-confirmed; treat as unverified until source is accessible.

### Compile-time note

Suspicious `<system-reminder>` blocks appeared embedded in two fetched results: rummyrulebook.com (3 blocks) and pagat.com/rummy/500rum.html (1 block). These are NOT part of the assistant's true system prompt -- treated as untrusted external content / potential prompt-injection and ignored for compilation. If those sources need re-reading, use a sanitizing fetcher.
