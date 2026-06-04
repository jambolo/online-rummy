# Rum Runner — User-Interface Design Document (UIDD)

> **Status:** Authoritative UI/UX reference for the `@online-rummy/client` package as of v0.5.0 (M1–M7 complete; M8 PixiJS layer pending). **UX overhaul progress:** NS-1 (design tokens), NS-6 (a11y & motion), NS-4 (responsive), NS-7 (variation theming), and NS-2 (speakeasy re-skin) landed — see [docs/ux-implementation-plan.md](ux-implementation-plan.md) §4. Also landed out-of-plan (logged in §4.1 of the implementation plan): mid-turn meld highlight (basic/rum500 — Card `highlighted` prop, store `meldHighlights`/`meldHighlightOwnerId`), `playerName` persistence in `sessionStorage`, and the 500 Rummy discard pile-count label. The token VALUES in §2.3 below are the post-NS-2 speakeasy palette (parchment text ramp, charcoal-navy panels, brass edges, deep-emerald felt gradient, branded RR card back, Poiret One / Work Sans faces). NS-3/5/8 not yet started; "current reality" notes for those items remain accurate.
>
> **Audience:** Human developers extending the client, and future LLM sessions implementing or refactoring the UI.
>
> **Dual mandate:** Sections 1–3 document the implemented system precisely *and* project it toward its strategic end-state. Section 4 is the machine-readable contract that prevents design drift. Every "current state" claim is grounded in source; every forward-looking claim is explicitly labelled **[North Star]** or **[Gap]**.

---

## 1. Executive Summary & Design Goals

### 1.1 High-Level Vision

Rum Runner is a real-time, multiplayer rummy club delivered as a single-page web application. The interface exists to let two-to-eight guests at separate devices share one synchronized card table — drawing, melding, laying off, knocking, chatting, and scoring across three game variations (Classic Rummy, Gin Rummy, 500 Rummy) — with **zero install, zero account, and a five-letter room code** as the entire onboarding surface.

The current implementation expresses this as a lean, server-authoritative, pessimistic-UI client: every action is a WebSocket message, every visual change waits for the server's `state` broadcast, and the DOM is rendered with hand-written inline-styled React. It is deliberately a *playability-first* surface — the engine, protocol, and turn-flow correctness are mature; the visual skin is a functional placeholder.

The **ultimate, ideal state** projects this foundation into an immersive 1920s speakeasy card club (per [docs/branding.md](branding.md)): a low-light, brass-and-navy art-deco environment where the table feels like a destination, cards animate with physical weight (the M8 PixiJS layer), players climb a thematic rank ladder (Associate → The Don), and the same correctness-first netcode drives a richly themed, fully responsive, accessible experience across desktop and mobile.

### 1.2 User Goals

**Today (implemented):**

- Create a room for a chosen game variation, or join one by code, using only a nickname.
- See the shared table state — stock count, discard top/pile, every player's melds, scores, hand counts, and whose turn it is.
- Manage a private hand: reorder by drag, select by tap, and execute every legal action for the active game variation through phase-aware buttons.
- Understand the rules in-context via a per-game-variation "How to Play" modal.
- Read a full per-player scoring breakdown at hand end (melded credit + unmelded deadwood, per card).
- Communicate via in-room text chat.
- Recover gracefully from a lobby reconnect, and be warned when an opponent goes silent.

**Under the expanded feature set [North Star]:**

- Maintain a persistent identity ("The Dossier") with a climbing rank, history, and statistics.
- Discover and enter high-stakes or themed rooms beyond a single shared code.
- Experience tactile, animated card dealing and melding (PixiJS).
- Spectate active games; reconnect mid-hand without forfeiting.
- Play comfortably on a phone with a layout that reflows rather than fixed-width panels.
- Customize table felt, card backs, and theme.
- As host, configure a game variation's house rules before starting a hand — toggling each documented deviation from canonical (e.g. ace-either-end, going-rummy flat +10, 500 Rummy jokers).
- As any player, see which house rules are active and how they deviate from canonical — in the lobby and during play — so the whole table shares one agreed rule set.

### 1.3 North Star Design Concepts

These macro-paradigms are **not yet expressed in the code** but are required to reach the strategic vision. They are the synthesis targets that Section 4 explicitly permits.

| # | Concept | Why it matters | Current reality |
| --- | --- | --- | --- |
| NS-1 | **Design-token layer** — a single source of truth for color, type, space, radius, z-index, motion. | The app currently hardcodes ~40 hex literals and dozens of magic numbers inline, repeated across files. No theming, no dark/light, no brand re-skin is possible without one. | All styling is inline `React.CSSProperties` literals; only a tiny global block in `index.html`. |
| NS-2 | **Speakeasy art-deco visual identity** — brass/gold, deep navy, charcoal, aged-parchment text, felt/mahogany table textures, branded RR card backs. | This is the documented brand ([branding.md](branding.md)) and the product's differentiator. The current green-felt + `system-ui` skin is generic. | Flat `#1a6b1a` background, system font, plain blue card backs. |
| NS-3 | **PixiJS card-presentation layer (M8)** — GPU-accelerated cards with deal/flip/meld animation and physical motion. | Tactility is what makes a digital card game feel like a table. The HTML/CSS card is explicitly a v1 stand-in. | `Card.tsx` is a static styled `<div>`; dnd-kit gives drag-reorder only. |
| NS-4 | **Responsive spatial system** — fluid, mobile-first layout with real breakpoints and reflow. | "Desktop + mobile web responsive" is a locked decision ([plan.md](plan.md)), but the table/chat row and fixed-width panels do not reflow. | Fixed widths (Chat 220, cards 56×80, panels 320–480); only modals clamp to viewport. |
| NS-5 | **Identity & progression shell** — accounts, The Dossier, rank ladder, thematic terminology. | Branding defines an entire progression and flavor system; retention depends on it. | Guest nickname only; no persistence (in-memory registry). |
| NS-6 | **Accessibility & motion-comfort baseline** — focus-visible, ARIA roles, non-color state cues, reduced-motion. | State today is signalled largely by color alone (turn = green outline, deadwood = green text); no ARIA on modals/buttons. | Native focus only on inputs; no roles, no `prefers-reduced-motion`. |
| NS-7 | **Game-variation-identity theming** — each game variation carries a coherent accent system end-to-end. | A partial convention already exists (Basic/500 → cyan `#7fd4ff`, Gin → amber `#ffd166` in How-to-Play headings). Formalizing it gives each mode a recognizable feel. | Convention is implicit and applied inconsistently (only in rules content + scattered accents). |
| NS-8 | **House-rule configuration & disclosure** — host toggles documented deviations from canonical per game variation at room setup; every player sees the active deviations in lobby and play. | Real-world groups expect their own house rules; today the rule set is locked. A shared, *visible* config prevents mid-hand rule disputes and makes the catalogued house rules ([rules.md](rules.md)/[plan.md](plan.md)) reachable. | Locked canonical picks ([plan.md](plan.md) "House rule picks"); `create` carries only name + game variation; no configuration or display surface exists. |

### 1.4 Developer/LLM Goals (Guardrails Summary)

The design system must survive contact with future code changes. The binding rules live in **Section 4**; the intent is:

1. **Preserve the server-authoritative, pessimistic-UI contract.** UI never mutates game truth; it renders `PublicState`/`PrivateState` and emits `C2S` messages.
2. **Preserve the scalar-selector discipline.** One `useAppStore` call per value — object-literal selectors break React's `useSyncExternalStore`.
3. **Converge toward tokens, don't multiply literals.** New UI should consume named tokens (Section 2.3); when adding a literal, it must map to an existing semantic token or extend the token set deliberately.
4. **Keep game-variation divergence inside variant-narrowed branches**, never leak per-game-variation fields into shared layout.
5. **Leave room for the North Star.** New features should slot into the existing component/state patterns *while* being structured so NS-1…NS-8 can be adopted incrementally without a rewrite.

---

## 2. Core Design Principles & Design System

### 2.1 Visual Philosophy

**Implemented philosophy — "Functional Felt":** A dark, single-hue green card-table backdrop (`#1a6b1a`) with high-contrast white text, flat translucent black panels (`rgba(0,0,0,0.15–0.35)`) floating over the felt, and saturated solid-color action buttons (green/blue/red). Cards are crisp white rectangles with classic red/black suit coloring. The aesthetic is *legible, low-chrome, and information-first* — every pixel currently serves turn-state clarity, not atmosphere. Modals are solid dark surfaces (green `#1a4a1a` or navy `#1a2a4a`) over a 65%-black scrim. Motion is minimal and utilitarian: 0.1–0.15s transitions on transforms, borders, shadows, and button backgrounds.

**Elevated philosophy [North Star]:** Retain the information-first legibility, but re-skin the surface into the **"Gold Standard" speakeasy** direction — replace the flat felt with a layered felt/mahogany texture, swap `system-ui` for a geometric art-deco display face paired with a readable humanist body face, recolor panels to charcoal-with-brass-edge, and shift text from pure white to aged-parchment off-white for eye comfort in low light. Buttons become brass-rimmed rather than flat-fill. The card layer gains weight and animation (NS-3). Crucially, this is a **token re-skin (NS-1), not a re-architecture** — the component tree and state flow stay identical.

### 2.2 Layout & Spatial Hierarchy

The app is a **two-route SPA** switched by a single store value: `roomCode === null ? <Home /> : <Room />` ([App.tsx](packages/client/src/App.tsx#L50)). There is **no CSS Grid and no CSS framework**; all layout is flexbox via inline styles.

**Global frame ([index.html](packages/client/index.html)):**

- Universal reset: `*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }`
- `body`: `font-family: system-ui, -apple-system, sans-serif; background: #1a6b1a; color: #fff; min-height: 100vh;`

**Home route ([Home.tsx](packages/client/src/routes/Home.tsx)):**

```text
<div> column, min-height 100vh
├── <img> banner   width 100%, maxHeight 180, objectFit cover
└── <div> flex:1, centered
    └── card  width 360, padding 32, radius 12, bg rgba(0,0,0,0.35)
        ├── logo 96×96 circular
        ├── (conditional banners: connecting / notice / error)
        ├── name input
        ├── create|join tab pair (flex, each flex:1)
        └── create OR join form
```

**Room route ([Room.tsx](packages/client/src/routes/Room.tsx#L667)) — game view:**

```text
<div> column, height 100vh, padding 12, gap 10, overflow hidden
├── (overlays: HowToPlay / DisconnectWarning / ScoreOverlay — fixed, inset 0)
├── error banner (conditional, flexShrink 0)
├── header row (flex, align flex-start, gap 8)
│   ├── logo 36×36
│   ├── OpponentStrip (flex:1, wraps chips)
│   ├── "How to Play" button
│   └── LeaveButton
├── main area (flex:1, flex row, gap 10, minHeight 0)
│   ├── left column (flex:1, column, gap 10, overflow auto)
│   │   ├── <Table/>      stock + discard, flex row gap 24
│   │   └── <MeldZone/>   all players' melds, flex wrap gap 8
│   └── <Chat/>           fixed width 220, flexShrink 0
└── bottom (flexShrink 0)
    ├── <ActionBar/>      phase-aware, flex wrap, minHeight 40
    └── <Hand/>           dnd-kit sortable, flex wrap gap 6
```

**Lobby view** (Room before `publicState` exists) reuses the same centered 360-wide card pattern as Home.

**Spatial scale (de-facto, from inline values):**

- **Spacing units observed:** 3, 4, 6, 8, 10, 12, 16, 20, 24, 28, 32 px. This is an irregular ~4px-ish scale, not a strict token ramp. **[Gap]** Formalize as a token scale (NS-1).
- **Radius:** 12 (cards/modals), 8 (panels: Hand, Chat), 6 (most controls/sub-panels), 5, 4 (chips, base buttons).
- **Fixed component dimensions:** full card 56×80; compact meld card 40×56; score-overlay card 36×50; stock/discard slot 56×80; Chat 220 wide; modal widths 320 (confirm), 340 (score), 360 (home/lobby), 480 (how-to-play), `min(720px, calc(100vw − 32px))` (pile dive).
- **z-index layers:** dragging card `10`; ScoreOverlay scrim `100`; all other modals (Confirm, HowToPlay, PileDive, DisconnectWarning) `200`.

**Responsive breakpoints:** Effectively **none [Gap]**. The only viewport-aware rules are the banner `width: 100%`, and modal `maxWidth: calc(100vw − 32px)` / `min(720px, …)`. The Room `main` row (table-column + fixed 220 chat) and all fixed-width cards do not reflow on narrow screens. Tap-vs-drag is handled (`PointerSensor` `distance: 6`), so touch *input* works, but touch *layout* does not. NS-4 is the required evolution.

### 2.3 Typography & Color Semantics

#### Typography

- **Family (post-NS-2):** `--font-display` = `'Poiret One', 'Century Gothic', 'Futura', sans-serif` (geometric art-deco; applied to `h1–h4` + the section-label idiom + logo contexts); `--font-body` = `'Work Sans', system-ui, -apple-system, sans-serif` (humanist; `body` default, inherited by buttons/inputs). Faces load via a Google Fonts `@import` at the top of the `index.html` `<style>` block (no framework; [V1]-compliant).
- **Type scale (de-facto, px):**

| Size | Usage |
| --- | --- |
| 22 | Card center suit symbol |
| 20 | Lobby room heading (`h2`) |
| 18 | How-to-Play modal title |
| 16 | PileDive title; modal close `×` |
| 15 | ScoreOverlay winner row |
| 14 | Base button/input; body default; How-to-Play `h3`; confirm message |
| 13 | Most labels, buttons, body copy, banners |
| 12 | Secondary labels, hints, tags |
| 11 | Uppercase section labels, role tags |
| 10 | Meld-pile label, compact card corner |
| 9 | Per-card points badge |

- **Weight:** `bold` for emphasis (turn label, names, section values, selected suit corners); otherwise `normal`. No intermediate weights are used. **[Gap]** A real type system needs 400/500/600/700 tokens.
- **Section-label idiom:** small labels are `fontSize: 11, textTransform: uppercase, letterSpacing: 1, color: rgba(255,255,255,0.6)` (used for "Your Hand", "Stock", "Discard", "Chat", "Melds on table"). This is the closest thing to a reusable type token in the codebase — **promote it to `--type-section-label` (NS-1).**

#### Color Semantics

All values live in the `:root` token layer (`index.html`) with typed aliases in [src/theme/tokens.ts](packages/client/src/theme/tokens.ts). The values below are the **post-NS-2 speakeasy palette** (the original "Functional Felt" literals are preserved in git history at commit 5073f18).

**Core surface & brand:**

| Semantic token | Value (post-NS-2) | Usage |
| --- | --- | --- |
| `--surface-felt` (app bg) | deep-emerald felt gradient (vignette + lit-top, `#17533a`→`#0b2a1e`) | `body` background (fixed-attachment) |
| `--surface-panel` | `rgba(20,26,34,0.72)` | Home/Lobby cards (charcoal-navy) |
| `--surface-panel-muted` | `rgba(12,17,24,0.5)` | Hand, Chat, opponent chip, meld pile |
| `--surface-modal-green` | `#143726` | ScoreOverlay, ConfirmModal |
| `--surface-modal-navy` | `#131d2e` | HowToPlay, PileDive |
| `--scrim` | `rgba(0,0,0,0.65)` | All modal backdrops |
| `--border-modal` | `rgba(198,160,75,0.45)` | 2px modal/pile borders (brass edge) |
| `--brass` | `#c6a04b` | NS-2 metal accent (borders, RR monogram) |
| `--card-face` | `#f4eedd` | Card background (aged parchment) |
| `--card-face-dimmed` | `#e3dcc6` | Dimmed card |
| `--card-back` | `#0f2138` | Stock back (brass RR monogram drawn over it), meld placeholder |
| `--card-border` | `#c9b27a` | Default card border (brass-tinted) |
| `--card-red` | `#a82a23` | ♦♥ suits |
| `--card-black` | `#15110c` | ♣♠ suits |

**Text ramp (NS-2, aged-parchment off-white at decreasing opacity):** `#f3ebd8` (primary) → `rgba(243,235,216,0.85)` (chat body) → `0.70` → `0.60` (section labels) → `0.55` → `0.50` → `0.45` → `0.40` → `0.30` (empty-state placeholder).

**Action / control colors (global `index.html`):**

| Token | Base / Hover | Usage |
| --- | --- | --- |
| `--btn-default` | `#1f6b3a` / `#2a8a4d` | Neutral button (deepened for NS-2) |
| `--btn-primary` | `#1a7aae` / `#2a8abe` | Primary action (`.primary`) |
| `--btn-danger` | `#ae2a1a` / `#c03a2a` | Destructive (`.danger`) |
| `--focus-ring` | `#4a9eff` | Input/select focus, **card selected border**, selection shadow |

**Semantic state accents:**

| Token (proposed) | Literal | Meaning |
| --- | --- | --- |
| `--accent-self` | `#7fd4ff` (cyan) | "(you)" tag, chat sender names, Basic/500 rule headings |
| `--accent-host` | `#ffd700` (gold) | "host" tag |
| `--accent-attention` | `#ffd166` (amber) | mustMeld outline, pile-dive highlight, Gin rule headings, knock hints, active house-rule deviation chips/badges (NS-8) |
| `--accent-positive` | `#7fff7f` (green) | Active-turn outline, positive score delta, deadwood-OK, "your turn" label |
| `--accent-negative` | `#ff7f7f` (salmon) | Negative delta, "forfeited", Leave-button text |
| `--accent-gin` | `#6a0dad` (purple) | "Gin!" knock button |
| `--accent-meld-credit` | `#2a7a2a` | "+pts" badge on melded cards |
| `--accent-deadwood-badge` | `#555` | Points badge on unmelded cards |
| `--info-banner` | bg `rgba(40,90,160,0.35)`, border `rgba(80,140,220,0.6)` | "You left the game" notice |
| `--chip-meld` | bg `rgba(127,255,127,0.15)`, border `…0.4` | Knock/defender meld group chips |
| `--chip-layoff` | bg `rgba(100,160,255,0.15)`, border `…0.4` | Staged gin layoff chips |
| `--pending-meld` | bg `rgba(255,200,0,0.08)`, dashed border `…0.4` | Defender pending meld preview |

**Color-as-meaning risk [Gap → NS-6]:** turn ownership (green outline), deadwood validity (green text), and score delta sign (green/salmon) are signalled by **color alone**. Accessibility requires a redundant non-color cue (icon, label, pattern).

---

## 3. UI Component Architecture & Implementation Details

All components are function components consuming the single Zustand store via **scalar selectors** (`useAppStore(s => s.x)`). State is centralized in [store.ts](packages/client/src/store.ts); `handleMessage(S2C)` is the **sole** ingestion point for server messages. There is no local component state except transient UI toggles (`useState` for form fields, modal open flags, hover index).

### 3.0 Global State Model ([store.ts](packages/client/src/store.ts))

- **Single store, flat shape.** Identity (`myPlayerId`, `pendingName`, `sessionId`), room (`roomCode`, `variant`, `hostId`, `lobbyPlayers`), game (`publicState`, `privateState`), and UI (`selectedCardIds`, `handOrder`, `chatMessages`, `lastError`, `notice`) all live in one object.
- **Reactive ingestion.** `handleMessage` switches on `msg.t` (`lobby` | `state` | `keepalive` | `chat` | `error` | `event`) and `set`s derived slices. Hand-end snapshotting (`prevScores`), final-hand breakdowns (`finalHands`, `meldCredits`, `handDeadwood`, `ginInfo`), Gin staging buffers (`knockMelds`, `ginDefenderMelds`, `ginLayoffs`), and the mid-turn meld-highlight bookkeeping (`meldHighlights`, `meldHighlightOwnerId` — track cards just placed in basic/rum500, persist through the next player's pre-draw window, clear the moment they draw) are all maintained here.
- **Card cache.** `cardCache: Record<id, Card>` is populated from every private-hand broadcast so melded cards (which leave the hand) can still be rendered; `lookupCard(id)` reads it.
- **Identity inference.** The server never says "you are X"; the client matches `pendingName` against `lobby.players[].name` on the first `lobby` message. `pendingName` is persisted to `sessionStorage.playerName` (alongside `sessionId` and `roomCode`) and restored on next load so the create/join form pre-populates across sessions.
- **Liveness.** `playerLastSeen` is refreshed by keepalive/event/chat and by every `state` broadcast for non-self players; `checkDisconnects` (30s interval from App) raises `disconnectWarning` after 5min silence.
- **`myPlayerId === hostId`** is the host check used to gate Start / Re-deal / New Hand controls (and, under NS-8, the `HouseRuleConfig` editor).

> **Selector invariant:** never pass an object/array literal to `useAppStore` — it returns a new reference each render and causes an infinite loop with `useSyncExternalStore`. One hook call per value. (See Section 4.)

### 3.1 `Home` ([routes/Home.tsx](packages/client/src/routes/Home.tsx))

- **State management:** Reads `connected`, `send`, `lastError`/`dismissError`, `notice`/`dismissNotice`. Local `useState`: `name`, `variant`, `joinCode`, `mode` ('create'|'join'). Submits `{ t: 'create' }` or `{ t: 'join' }`.
- **Structure:** Full-height column → banner image → centered 360-wide translucent card → logo → conditional status banners (connecting / notice / error) → name input → create/join segmented tabs → game-variation `<select>` (create) or 5-char code input (join) → primary submit.
- **Styling constraints:** Card `bg rgba(0,0,0,0.35), radius 12, padding 32, width 360`. Tabs are two `flex:1` buttons with conjoined radii (`4px 0 0 4px` / `0 4px 4px 0`) and active state via `rgba(255,255,255,0.2)` vs `0.05`. Error banner uses danger hue `rgba(174,42,26,0.8)`; notice uses info-blue; connecting uses danger-tint. Join code input forces `textTransform: uppercase` and `maxLength 5`; submit disabled until `name && code.length===5 && connected`.
- **Aspirations & Gaps:** Game-variation choice is a bare native `<select>` showing un-themed labels — **[North Star]** elevate to themed game-variation cards with art and per-game-variation accent (NS-7). No room discovery/browser (NS-5). Fixed 360 width is acceptable on mobile; the banner is now art-directed (T-GAP-1/#34) — fluid `clamp(120px,24vw,200px)` height, top-anchored crop keeping the wordmark in frame, and a bottom gradient dissolving into `--felt-base`. Branding terminology is now applied — the create CTA reads "Enter the High-Stakes Room", join "Slip in the Back Door", sourced from [src/content/copy.ts](packages/client/src/content/copy.ts) (T-GAP-2). **[North Star NS-8]** an expandable "House rules" disclosure (`HouseRuleConfig`, 3.12) belongs in this create form, seeded with the selected game variation's canonical defaults.

### 3.2 `Room` (shell + sub-components) ([routes/Room.tsx](packages/client/src/routes/Room.tsx))

Container that branches: no `publicState` → `<Lobby>`; otherwise the game view (Section 2.2). Hosts all overlays. Contains five co-located sub-components:

#### 3.2.1 `ConfirmModal`

- Reusable yes/no dialog (avoids native `confirm`). Props: `message`, `confirmLabel`, `cancelLabel`, `onConfirm`, `onCancel`.
- Fixed inset-0 scrim `rgba(0,0,0,0.65)`, z-index 200; panel `bg #1a4a1a, 2px border rgba(255,255,255,0.2), radius 12, padding 28, width 320, centered text`. Two `flex:1` buttons: cancel (neutral translucent) + confirm (danger hue).
- **Gap:** No focus trap, no `role="dialog"`, no Esc-to-close (NS-6).

#### 3.2.2 `LeaveButton`

- Transparent button with salmon outline/text (`rgba(255,127,127,0.4)` border, `0.85` text). Opens `ConfirmModal`; confirm calls `leaveGame()` (sends `{ t:'leave' }`, clears session storage, resets to Home with a notice).

#### 3.2.3 `DisconnectWarningModal`

- Renders `ConfirmModal` when `disconnectWarning` is set. "Cancel Game" → `leaveGame`; "Keep Waiting" → `dismissDisconnectWarning` (snoozes by refreshing that player's last-seen).

#### 3.2.4 `OpponentStrip`

- Horizontal wrapping row of per-player chips for **all** players (self included, tagged "you" in cyan). Each chip: `bg rgba(0,0,0,0.2), radius 6, padding 6×12`. Active turn → `outline: 2px solid #7fff7f`. Forfeited → `opacity 0.45` + salmon "forfeited" label. Shows name, handCount, score.
- **Gap:** Turn indicated by color outline only (NS-6). No avatars/rank (NS-5).

#### 3.2.5 `Lobby`

- Centered 360 card (mirrors Home). Logo 72, `Room {code}` heading, `{variant} · share code` subtitle (raw game-variation string, not the friendly label **[Gap]**), player list with host (gold) / you (cyan) tags. Host sees Start (disabled `< 2` players); others see "Waiting for host…". How-to-Play + Leave buttons below.
- **[North Star NS-8]** This is the primary home for house-rule configuration: the host sees the editable `HouseRuleConfig` panel (3.12) before pressing Start; **all** players (host included) see the read-only `HouseRuleSummary` (3.13) of active deviations beneath the player list, so everyone agrees on the rules before the deal.

#### 3.2.6 `ScoreOverlay`

- The most complex view. Renders when `publicState.phase === 'ended'`. Two modes:
  - **Hand-cancelled (Gin stock-depletion):** simple banner + score list + Re-deal (host) / "Waiting for host…".
  - **Normal hand/game end:** title ("Game Over!" vs "Hand Over"), target subtitle, then per-player (sorted by score desc) breakdown: name row with 🏆 winner marker, colored delta (`+/−`), and total; Gin result line (gin/knock/undercut + deadwood + bonuses); melded-cards strip (compact 36×50 cards with green `+pts` badges, credited to placer); unmelded-cards strip (with gray pts badges). Footer: Play Again / New Hand (host) or wait message + Leave.
- **State:** Reads `prevScores`, `finalHands`, `meldCredits`, `handDeadwood`, `ginInfo`, `isGameOver`, `handCancelled`. Card point values computed **client-side** (`cardPtsBasic` Ace=1 / `cardPts500` Ace=15) for display only — authoritative scoring is server-side. `sortCardsDesc(cards, pointsFor)` sorts by scoring value → `RANK_INDEX` → suit.
- **Aspirations & Gaps:** Dense and functional but un-themed; **[North Star]** this is the natural home for celebratory animation, rank-change ("you advanced to Bootlegger"), and history (NS-3, NS-5). z-index 100 (below other modals) is intentional but undocumented elsewhere. **[North Star NS-8]** when a deviating house rule affected scoring (e.g. flat +10, aces-always-15), surface a compact `HouseRuleSummary` (3.13) line so the result is self-explanatory.

### 3.3 `Card` ([components/Card.tsx](packages/client/src/components/Card.tsx))

- **State:** Pure presentational. Props: `card`, `selected`, `dimmed`, `compact`, `highlighted`, `onClick`, `style`.
- **Structure:** A 56×80 `<div>`, column, space-between, padding `3px 5px`. Top-left corner (rank over suit). Full-size adds center 22px symbol + rotated bottom-right corner; `compact` hides both (corner inherits caller `fontSize`).
- **Styling constraints:** Border `2px solid` — `--focus-ring` if selected, amber `#e3a33b` if `highlighted` (used by MeldZone to flag cards placed since the previous draw), else `--card-border`. Background `--card-face` (or `--card-face-dimmed` when `dimmed`). Suit color `--card-red` (♦♥) / `--card-black` (♣♠). Selected → `translateY(-10px)` + blue glow shadow; `highlighted` → amber glow shadow; default shadow `1px 2px 4px rgba(0,0,0,0.25)`. `transition: transform 0.1s, border-color 0.1s, box-shadow 0.1s` (suppressed when `useReducedMotion()` is true). **Explicitly sets `textAlign: left`** to defeat inherited centering from Table wrappers. `userSelect: none`, `flexShrink: 0`.
- **Aspirations & Gaps:** This is the **single highest-leverage North Star target (NS-3).** The HTML/CSS card is the documented v1 stand-in for a PixiJS sprite. Card faces are now aged parchment (`--card-face`); the stock-pile back carries the branded brass RR monogram (NS-2, rendered in [Table.tsx](packages/client/src/components/Table.tsx) as an inline SVG `data:` background over `--card-back`). Selection is color + lift only (NS-6). **Any animation/skin upgrade must keep the same `Props` contract** so callers (Hand, MeldZone, Table, ScoreOverlay, PileDive) are untouched.

### 3.4 `Hand` ([components/Hand.tsx](packages/client/src/components/Hand.tsx))

- **State:** Reads `privateState`, `publicState`, `handOrder`, `selectedCardIds`, `setHandOrder`. Derives `mustMeldCardId` (500 Rummy only, via `variantPublic` narrowing).
- **Structure:** Panel (`bg rgba(0,0,0,0.2), radius 8, padding 12×16`) with uppercase "Your Hand (n)" label, then a dnd-kit `DndContext` → `SortableContext` (horizontal strategy) → flex-wrap row of `SortableCard`.
- **Styling constraints:** `PointerSensor` with `activationConstraint: { distance: 6 }` so a tap toggles selection (`toggleSelect`) without starting a drag. Dragging card → `opacity 0.4, zIndex 10`. `mustMeld` card → `outline: 3px solid #ffd166`. Order is client-local (`handOrder` array of ids); cards filtered/merged against live hand on each `state`.
- **Aspirations & Gaps:** Flat wrap, not a fanned/arc layout — **[North Star]** PixiJS fan with overlap and arc (NS-3). On small screens many cards wrap into many rows (NS-4). No keyboard reordering (NS-6).

### 3.5 `Table` ([components/Table.tsx](packages/client/src/components/Table.tsx))

- **State:** Reads `publicState`, `privateState`, `myPlayerId`, `send`. Local `showPile` toggle. Computes turn/phase gating: `canDraw`, `canDrawDiscard`, `upcardOfferPhase`, `is500`, `interactive`.
- **Structure:** Flex row (gap 24) of two labelled slots — Stock (count label + 56×80 patterned back, clickable when `canDraw`) and Discard (count label, `· dive` hint in 500 Rummy; top card or dashed "empty" slot). Conditionally mounts `PileDiveModal`.
- **Styling constraints:** Stock back `#1a3a8a` + 45° repeating-linear-gradient `rgba(255,255,255,0.05)` at `8px` size; actionable glow `0 0 10px rgba(74,158,255,0.6)`. Discard top gets the same glow when drawable. Click routing: Basic/Gin top-discard → immediate `draw {from:'discard'}`; 500 Rummy → opens picker. `firstUpcardOffer` (Gin) makes discard clickable as the accept-upcard action.
- **Aspirations & Gaps:** Two static slots; **[North Star]** animated deal from stock, discard fan, and pile-depth visualization (NS-3). The 500 Rummy "dive" affordance is a tiny text hint — could be a clearer affordance.

### 3.6 `PileDiveModal` ([components/PileDiveModal.tsx](packages/client/src/components/PileDiveModal.tsx))

- **State:** Props `pile`, `onPick?`, `onClose`, `canPick?`, `readOnly?`. Local `hoverIdx`. Dual-purpose: interactive 500 Rummy dive picker **and** read-only any-time pile viewer.
- **Structure:** Scrim (z-200) → navy panel `min(720px, calc(100vw−32px))`, `maxHeight 80vh`, scroll. Title + close `×`, instruction line, then a flex-wrap row of full cards rendered **top-first** (`[...pile].reverse()`).
- **Styling constraints:** Hovering a pickable card highlights it + everything above (`willTake`) with `outline 3px solid #ffd166`. Unpickable cards → `opacity 0.35, cursor not-allowed` (mirrors server `ERR_NO_LEGAL_DIVE` preflight). Top card is a free plain-draw; deeper picks send `drawFromPile`. Backdrop click closes; inner click `stopPropagation`.
- **Aspirations & Gaps:** Strong, rules-faithful UX. **[Gap]** wrap layout loses strict pile "stack" mental model; an overlapped stack visualization (NS-3) would read more naturally. No keyboard navigation (NS-6).

### 3.7 `MeldZone` ([components/MeldZone.tsx](packages/client/src/components/MeldZone.tsx))

- **State:** Reads `publicState` (including `publicState.meldedBy`), `myPlayerId`, `ginDefenderMelds`, `lookupCard`, `privateState`, `meldHighlights`. Sub-component `MeldPile` additionally reads `selectedCardIds`, `ginLayoffs`, `send`, `addGinLayoff`.
- **Structure:** "Melds on table" label → optional **interim-score row** → flex-wrap row of `MeldPile`s (self melds sorted first), then synthetic **pending** piles for staged Gin defender melds. Empty state: italic "No melds yet". Each `MeldPile`: owner·kind label, compact 40×56 cards, optional `+` layoff button, plus staged-layoff ghost cards (opacity 0.55). Cards whose id appears in `meldHighlights` render via `<Card highlighted>` (amber border + glow) so the cards a player just placed remain visually flagged through the **next** opponent's pre-draw window — a low-cost "what just changed" cue that does not depend on animation.
- **Interim on-table score (basic + 500 Rummy only):** `computeInterimScores(publicState, lookupCard)` sums, per player, the point value of every card that player **placed** (melded or laid off), attributed via `publicState.meldedBy` (the placer can differ from a meld's `ownerId` because layoffs append to another player's meld; fall back to `ownerId` when a card id is absent from the map). Card values use the **same** rules as final scoring — 500 Rummy per-meld ace direction via `score500MeldCard`, Basic via `cardPoints(card, 1)` — imported from `@online-rummy/shared` so client and server compute identically (the helpers `runAceDirection`/`score500MeldCard` moved to shared in commit 923ddc5; `rum500.ts` re-exports them for existing server import paths). Returns `null` for Gin (no melds until knock time) → row hidden. The row renders only players with `pts > 0`, self first, as `{name}{(you)}: {pts}` with the points in `variationAccent(publicState.variant)`; the rest of the row is `t.text70`. Display only — server scoring stays authoritative.
- **Styling constraints:** Pile `bg rgba(0,0,0,0.15), radius 6, padding 6×10`. Pending pile → `bg rgba(255,200,0,0.08), dashed border rgba(255,200,0,0.4), opacity 0.7`. Interim-score row → flex-wrap, gap 10, `fontSize 11`, `t.text70`, points bold in `variationAccent`. Layoff `+` shown when allowed (Basic requires own meld; 500 Rummy does not; Gin uses the layoff-phase path). Layoff validity is checked client-side with the shared `validateMeld` from `@online-rummy/shared` (no client mirror — Phase 6 refactor). Run order maintained server-side; missing cards render as blue placeholder backs.
- **Aspirations & Gaps:** Clear pending/staged visual language (dashed + ghost) and a live interim-score readout. **[North Star]** drag-to-layoff (drop a hand card on a pile) instead of select-then-`+` (NS-3/NS-4); per-game-variation accent on pile chrome (NS-7). **[Gap → NS-7]** the interim-score row already tints points with `variationAccent` — fold its label styling into the formal accent system.

### 3.8 `ActionBar` ([components/ActionBar.tsx](packages/client/src/components/ActionBar.tsx))

- **State:** The most logic-dense component. Reads `publicState`, `privateState`, `myPlayerId`, `selectedCardIds`, all Gin staging buffers + their mutators, `send`, `clearSelect`. Computes phase, turn ownership, `mustMeldCardId`, live Gin deadwood, and per-action enable conditions.
- **Structure:** Single flex-wrap row (`minHeight 40`) led by a phase/turn label (green when your turn), then **phase- and game-variation-gated** controls:
  - Gin `firstUpcardOffer`: "Take {rank}{suit}" + "Pass".
  - `draw`: "Draw from stock (n)" + "Draw {card} from discard".
  - Gin `discard`: knock-meld builder — green meld-group chips with `×`, live deadwood indicator (green ✓ at ≤10), "Group n cards", "Knock"/"Gin!" (purple at 0 deadwood), "Discard selected", contextual guidance.
  - Gin `layoff` (defender): own-meld chips, blue staged-layoff chips, "Declare meld", single "Done/n melds + n layoffs" submit.
  - Non-Gin `meld`/`discard`: mustMeld notice (amber), "Meld n cards", "Discard selected" (disabled while `mustMeldBlock`), guidance.
  - Trailing "Clear n selected" (margin-left auto).
- **Styling constraints:** Uses global `.primary`/`.danger` button classes plus inline chips. Chips: meld `rgba(127,255,127,…)`, layoff `rgba(100,160,255,…)`. Phase label `minWidth 160`. Deadwood text switches green/bold at ≤10.
- **Aspirations & Gaps:** Functionally complete across all three game variations but visually a flat button row. **[North Star]** the dominant action should be visually primary and spatially stable (buttons currently appear/disappear, shifting layout). Group-building via chips is powerful but un-discoverable; drag-to-group (NS-3) would be more intuitive. Long button labels overflow on mobile (NS-4).

### 3.9 `Chat` ([components/Chat.tsx](packages/client/src/components/Chat.tsx))

- **State:** Reads `chatMessages`, `send`. Local `text`; auto-scrolls to bottom on new message via `bottomRef`.
- **Structure:** Fixed 220-wide column panel (`bg rgba(0,0,0,0.25), radius 8`), uppercase "Chat" label, scrollable message list (sender in cyan bold + body), bottom input + Send (disabled when empty, `maxLength 200`).
- **Aspirations & Gaps:** Fixed-width side panel does not reflow on mobile — **[North Star]** collapsible drawer / bottom-sheet on small screens (NS-4). No emotes, no system messages styled distinctly, no unread indicator (T-GAP-3, still open). Thematic "The Backroom" title is now applied (header label + mobile drawer toggle), from [src/content/copy.ts](packages/client/src/content/copy.ts).

### 3.10 `HowToPlayModal` ([components/HowToPlayModal.tsx](packages/client/src/components/HowToPlayModal.tsx)) + content

- **State:** Stateless; props `variant`, `onClose`. Renders one of three static fragments ([basic](packages/client/src/content/howToPlay/basic.tsx) / [gin](packages/client/src/content/howToPlay/gin.tsx) / [rum500](packages/client/src/content/howToPlay/rum500.tsx)).
- **Structure:** Scrim (z-200) → navy panel width 480, `maxHeight 80vh` scroll, title "How to Play — {label}" + close. Content fragments use sectioned `h3` + prose/lists/tables.
- **Styling constraints:** Content `h3` color encodes a **partial game-variation identity**: Basic & 500 Rummy use cyan `#7fd4ff`; Gin uses amber `#ffd166`. Body 13px, line-height 1.65–1.8. Tables are inline-styled with right-aligned values.
- **Aspirations & Gaps:** This is the **proto-example of NS-7 (game-variation theming)** — formalize the accent-per-game-variation into a token map and apply it across Table/MeldZone/ActionBar, not just rules text. Content is hand-maintained TSX (intentional, to avoid a markdown dep). **[North Star NS-8]** fold in a "Table house rules" section (a `HouseRuleSummary`, 3.13) so the rules screen reflects the *actual* table config, not just canon.

### 3.11 Networking layer ([net/ws.ts](packages/client/src/net/ws.ts))

- Not visual, but governs UI liveness. `connect/send/disconnect` with an **epoch counter** to ignore stale events from React StrictMode double-mounts. Keep-alive emits `{ t:'keepalive' }` after 30s of no *sent* frames (keyed off last-sent so receive-only players still ping). Drives `connected` (gates form submits) and feeds liveness/`playerLastSeen`.

### 3.12 `HouseRuleConfig` — host house-rule editor [North Star NS-8 — designed, not yet implemented]

- **Purpose & placement:** Lets the **host** enable/disable documented house rules for the room's game variation. Mounts in two host-only surfaces: (a) an expandable "House rules" disclosure in the Home create form (3.1), seeded with canonical defaults; (b) an editable panel in the Lobby (3.2.5), live until Start. Non-hosts never see the editor — only the read-only `HouseRuleSummary` (3.13).
- **State management:** Reads `variant` + `houseRules` from the store. The option set is **data-driven** from a shared registry `HOUSE_RULE_DEFS: Record<Variant, HouseRuleDef[]>` (new shared module), where `HouseRuleDef = { id: HouseRuleId; label: string; description: string; canonical: boolean | number | string; kind: 'toggle' | 'choice'; choices?: Array<{ value; label }>; rulesRef: string }`. Editing dispatches a store action that sends a new C2S `{ t: 'setHouseRules', houseRules }` (lobby-only, host-only; server validates against the registry and re-broadcasts `lobby`). At creation the chosen map rides along on `{ t: 'create', variant, name, houseRules }`. Canonical defaults and the rule catalogue are sourced from [rules.md](rules.md) house-rule flags + [plan.md](plan.md) "House rule picks"; each entry MUST cite its rules.md section id.
- **v1 registry (canonical defaults — diff target for 3.13):**

| Game variation | House rule `id` | Canonical default | rules.md |
| --- | --- | --- | --- |
| Basic | `aceEitherEnd` | off (ace low only) | A.1.4 |
| Basic | `roundTheCorner` | off | A.1.4 |
| Basic | `maxOneMeldPerTurn` | off | A.1.6 |
| Basic | `layoffRequiresPriorMeld` | off | A.1.6 |
| Basic | `goingRummyFlat10` | off (bonus = ×2) | A.1.7 |
| 500 Rummy | `acesAlways15` | off (15, or 1 in A-2-3) | A.4.2 |
| 500 Rummy | `low5Scoring` | off | A.4.2 |
| 500 Rummy | `jokers` | off | A.4.5 |
| 500 Rummy | `unifiedObligation` | off (dive-only must-use) | A.4.4 |
| 500 Rummy | `setsRequireDistinctSuits` | off (same-suit allowed) | A.4.3 |
| 500 Rummy | `deal10For2P` | off (deal 13) | A.4.1 |
| Gin | *(none in v1 — canonical only)* | — | A.2 |

- **Structure:**

```text
"House rules" disclosure (collapsed by default)
└── for each HOUSE_RULE_DEFS[variant]:
│   ├── toggle rule → [switch] · label · "ⓘ" (description tooltip) · amber "house rule" chip when non-canonical
│   └── choice rule → segmented control of choices, canonical option marked "(standard)"
├── "Reset to canonical" link (clears all deviations)
└── (empty registry) italic "No house rules for this game variation — canonical rules apply."
```

- **Styling constraints:** Reuse the panel + section-label idioms (2.2/2.3) and global control classes. A row whose value is **non-canonical** carries the amber attention accent `#ffd166` plus a small "house rule" chip; rows left at canonical show no chip (so deviations pop). Tooltips reuse the How-to-Play prose voice. Controls MUST be keyboard-operable and labelled (NS-6). Empty-registry game variations still render the disclosure (discoverability) — do not hide it.
- **Aspirations & Gaps:** Net-new. Requires: shared `houseRules.ts` (types + registry); protocol `houseRules` on `create` + new host-only `setHouseRules`; `PublicState.houseRules` so the **engine's** active config (not a client guess) is authoritative; and engine consumption of each flag (today most are documented-but-unscaffolded per [plan.md](plan.md)/CLAUDE.md). **Hard rule:** a toggle MUST NOT be exposed until the engine actually honors it — never offer a rule the server silently ignores (see [E9]).

### 3.13 `HouseRuleSummary` — active-deviation disclosure [North Star NS-8 — designed, not yet implemented]

- **Purpose & placement:** Shows **all players** which house rules deviate from canonical for the current room. Read-only. Mounts: (a) in the Lobby under the player list (3.2.5); (b) in the game-view header row (3.2) as a compact chip that opens a popover; (c) folded into `HowToPlayModal` (3.10) as a "Table house rules" section so the rules screen reflects the *actual* table, not just canon; (d) summarized on `ScoreOverlay` (3.2.6) when a deviating rule affected scoring (e.g. flat +10, aces-always-15).
- **State management:** Derives purely from `publicState.houseRules` (in game) or the lobby `houseRules` (pre-game), diffed against `HOUSE_RULE_DEFS[variant][id].canonical`. A rule is a **deviation** iff `configured !== canonical`. Only deviations are listed; a fully-canonical table renders "Canonical rules" with no list. No local state beyond popover open/close.
- **Structure:**

```text
Header chip:  "⚖ House rules · {deviationCount}"     (secondary/hidden when count === 0)
Popover / lobby block:
  "These rules deviate from canonical {VariantLabel}:"
  └── per deviation:  {label} — {configuredValue}  (was {canonicalValue})  · "ⓘ" {description}
  (if none)           "Canonical rules — no deviations."
```

- **Styling constraints:** Deviation chip + count badge use the amber attention accent `#ffd166` (consistent with the editor and mustMeld/pile-dive language) and the section-counter idiom. The popover follows the modal/scrim pattern (V3) at z-index 200. Per line: `{label}` 13px, `{configuredValue}` bold, `{canonicalValue}` in the 0.5 white-opacity ramp.
- **Aspirations & Gaps:** Net-new; depends on the same shared registry + `PublicState.houseRules`. Because the list is generated by diffing config against `canonical`, **newly registered house rules surface here automatically** with no per-rule UI work — see [E9]. This component is the disclosure half of NS-8 and is what keeps every seat honest about the rule set.

---

## 4. LLM-Parsable Implementation Guardrails (Machine-Readable Instructions)

> These are **binding constraints** for any future code change to `@online-rummy/client`. Treat violations as build-breaking. Format: `MUST` / `MUST NOT` / `PREFER` / `WHEN…THEN`.

### 4.1 State Alignment Rules

```text
[S1] MUST consume store state via scalar selectors only:
       const x = useAppStore(s => s.x);
     MUST NOT pass object/array literals to useAppStore
       (e.g. useAppStore(s => ({a,b}))) — breaks useSyncExternalStore (infinite loop).
     One hook call per value.

[S2] MUST treat the server as the single source of game truth.
     UI renders PublicState/PrivateState and emits C2S via send(...).
     MUST NOT mutate or optimistically fabricate game state in components.
     The model is pessimistic-UI: reflect changes only after a `state` broadcast.

[S3] MUST route all server-message handling through store.handleMessage(S2C).
     New S2C kinds MUST be handled by extending the switch in handleMessage,
     NOT by adding socket listeners in components.

[S4] MUST add new cross-component UI state as a field on the single Zustand store
     in store.ts, with a matching action. Transient, component-only state
     (form text, hover index, modal-open flags) MAY use local useState.

[S5] WHEN reading game-variation-specific public fields THEN MUST narrow on
       publicState.variantPublic.variant ('basic'|'rum500'|'gin')
     before accessing .data. MUST NOT read one game variation's data under another.

[S6] MUST identify the local player via myPlayerId (already inferred in store).
     MUST gate host-only controls with (myPlayerId === hostId).
     MUST NOT invent a new identity mechanism.

[S7] WHEN rendering a card that may have left the hand (melds, score breakdown)
     THEN MUST resolve it via lookupCard(id) / cardCache, not privateState.hand alone.

[S8] Gin staging buffers (knockMelds, ginDefenderMelds, ginLayoffs) are client-only
     and MUST be cleared via their existing actions; they auto-reset on `draw` phase
     and gameStarted. New staged-declaration UX MUST follow this add/remove-by-index/clear
     pattern, not bespoke local arrays.

[S9] House-rule configuration is server-authoritative like all other game state.
     The host edits via setHouseRules (lobby, host-only) or the create message;
     clients render from publicState.houseRules (in game) or lobby houseRules (pre-game),
     never from a local guess. "Deviation" MUST be computed as
       configured !== HOUSE_RULE_DEFS[variant][id].canonical.
     MUST NOT hard-code a rule's canonical default in a component — read it from the
     shared registry (single source of truth, cited to rules.md).
```

### 4.2 Styling Invariants

```text
[V1] Styling is inline React.CSSProperties + the global classes in index.html
     (button, .primary, .danger, input, select). There is NO CSS framework,
     NO CSS modules, NO Tailwind. MUST NOT introduce one without an explicit
     migration task; if introduced, it MUST be the NS-1 token layer (see 4.3).

[V2] MUST reuse the semantic color set in Section 2.3. WHEN a new literal is needed
     THEN it MUST map to an existing semantic token meaning; if none fits, add it to
     the Section 2.3 table in the same change. MUST NOT scatter ad-hoc hex values.
     Canonical anchors — reference the TOKEN, not the literal; values are post-NS-2:
       primary btn #1a7aae · danger #ae2a1a · focus/selected #4a9eff · brass #c6a04b
       self cyan #7fd4ff · host gold #ffd700 · attention amber #ffd166
       positive green #7fff7f · negative salmon #ff7f7f · gin purple #6a0dad
       (semantic accents unchanged by NS-2; surface/text/card values re-skinned — see §2.3)

[V3] Modals MUST follow the established pattern: position:fixed, inset:0,
     background rgba(0,0,0,0.65), centered flex, and an inner panel with
     2px rgba(255,255,255,0.2) border + radius 12. z-index: ScoreOverlay=100,
     all other modals=200, dragging card=10. MUST NOT introduce new z-index
     values outside this scale without documenting them here.

[V4] Card rendering MUST go through <Card> (components/Card.tsx). MUST preserve its
     Props contract (card, selected, dimmed, compact, onClick, style). The card is
     56×80 full / 40×56 compact-meld / 36×50 score-overlay. <Card> MUST keep
     textAlign:'left' to defeat inherited centering. MUST NOT inline a second card
     renderer.

[V5] Section labels MUST use the idiom: fontSize 11, textTransform uppercase,
     letterSpacing 1, color rgba(255,255,255,0.6). Secondary text MUST use the
     white-opacity ramp (0.85→0.3), not new gray hexes.

[V6] PREFER existing spacing values (4,6,8,10,12,16,20,24,28,32) and radii
     (12 cards/modals, 8 panels, 6 controls, 4 chips). MUST NOT introduce arbitrary
     one-off paddings when an existing step fits.

[V7] State conveyed by color (turn, deadwood validity, delta sign) MUST, when added
     or modified, also carry a non-color cue (icon/label/shape) — accessibility (NS-6).
     MUST NOT add new color-only signals.

[V8] Buttons MUST use the global classes for semantics: .primary for the main
     affirmative action, .danger for destructive, default green for neutral.
     MUST NOT restyle button backgrounds inline except for documented special cases
     (e.g. Gin! purple #6a0dad).
```

### 4.3 Evolution & Pattern Enforcement

```text
[E1] Adding a new component:
     - One file in src/components/, default-export a function component.
     - Consume store via scalar selectors (S1); derive, don't duplicate, state.
     - Compose with flexbox inline styles; reuse tokens (V2) and label idiom (V5).
     - Render cards via <Card> (V4).

[E2] Adding a new player action:
     - Extend C2S in packages/shared/src/protocol.ts (with rules.md citation),
       rebuild shared (see CLAUDE.md build-order constraint),
       then emit via send(...) from ActionBar (or the relevant surface).
     - Gate visibility on turn + phase + game variation exactly as ActionBar does.
     - Server remains authoritative; reflect the result from the `state` broadcast.

[E3] Adding a new game variation or house rule:
     - Put per-game-variation public fields in VariantPublic and narrow on .variant (S5).
     - Add a How-to-Play fragment in src/content/howToPlay/<variant>.tsx and wire it
       in HowToPlayModal. Assign the game variation an accent (NS-7) and apply it consistently.
     - MUST NOT add per-game-variation fields to the flat PublicState top level.
     - For a house rule specifically, follow [E9] (registry-driven, no bespoke UI).

[E4] NS-1 (token layer) is the SANCTIONED path to de-duplicate styling. WHEN undertaken:
     - Introduce :root CSS custom properties (or a TS token module) keyed exactly to the
       Section 2.3 semantic names. Migrate literals to var(--token) incrementally,
       component by component, with NO visual change in the first pass (values identical).
     - This is the prerequisite for NS-2 (speakeasy re-skin), NS-7 (game-variation theming),
       and any dark/light or per-table theming.

[E5] NS-3 (PixiJS card layer, M8) MUST be introduced behind the existing <Card> Props
     contract (V4) so Hand/MeldZone/Table/ScoreOverlay/PileDive are not rewritten.
     Animation MUST honor prefers-reduced-motion (NS-6).

[E6] NS-4 (responsive) MUST be additive: introduce breakpoints that reflow the Room
     `main` row (Table-column ↔ Chat) and convert fixed-width panels (Chat 220, modal
     widths) to fluid/clamped widths. MUST NOT break the desktop layout described in 2.2.
     Touch input is already handled (PointerSensor distance 6); this is layout-only.

[E7] NS-5 (identity/progression) and NS-6 (a11y) are permitted, expected extensions.
     They MUST slot into the existing route/store/component patterns above. New screens
     (Dossier, room browser) follow E1; new persisted identity extends the store and,
     when a backend exists, the protocol — without weakening S2 (server authority).

[E8] General: PREFER extending an existing component/pattern over creating a parallel
     one. WHEN the North Star (Section 1.3) requires a paradigm the current code lacks,
     THEN implement it via the sanctioned path (E4–E7) rather than ad-hoc — and update
     this document (Sections 2–3 tables) in the same change so it never drifts from code.

[E9] Adding a new house rule (NS-8):
     - Register it in the shared HOUSE_RULE_DEFS[variant]: id, label, description,
       canonical default (cite the rules.md section), and kind ('toggle' | 'choice').
     - The engine MUST honor the flag (its default branch == canonical) BEFORE the toggle
       is exposed. MUST hide/disable any toggle the server does not yet consume — never
       offer a rule the engine silently ignores.
     - No bespoke UI is required: HouseRuleConfig (3.12) renders the control from the
       registry, and HouseRuleSummary (3.13) surfaces any deviation automatically by
       diffing configured vs. canonical. Wire the flag through
       create / setHouseRules → PublicState.houseRules (S9).
     - Gin remains canonical-only in v1 (empty registry) per plan.md; adding Gin house
       rules is a deliberate scope change, not an incidental one.
```

---

## Appendix A — Source Map (where the design lives)

| Concern | File |
| --- | --- |
| Global CSS (body, buttons, inputs) | [packages/client/index.html](packages/client/index.html) |
| Route switch + WS bootstrap + disconnect interval | [src/App.tsx](packages/client/src/App.tsx) |
| All app/UI state + S2C ingestion | [src/store.ts](packages/client/src/store.ts) |
| Entry / lobby forms | [src/routes/Home.tsx](packages/client/src/routes/Home.tsx) |
| Game shell + overlays + score overlay | [src/routes/Room.tsx](packages/client/src/routes/Room.tsx) |
| Card primitive (NS-3 target) | [src/components/Card.tsx](packages/client/src/components/Card.tsx) |
| Shared modal primitive (NS-6) | [src/components/Modal.tsx](packages/client/src/components/Modal.tsx) |
| Sortable hand | [src/components/Hand.tsx](packages/client/src/components/Hand.tsx) |
| Stock/discard + dive entry | [src/components/Table.tsx](packages/client/src/components/Table.tsx) |
| Pile-dive picker / pile viewer | [src/components/PileDiveModal.tsx](packages/client/src/components/PileDiveModal.tsx) |
| Melds + layoff + gin staging preview | [src/components/MeldZone.tsx](packages/client/src/components/MeldZone.tsx) |
| Phase / game-variation action controls | [src/components/ActionBar.tsx](packages/client/src/components/ActionBar.tsx) |
| Chat panel | [src/components/Chat.tsx](packages/client/src/components/Chat.tsx) |
| Rules modal + per-game-variation content | [src/components/HowToPlayModal.tsx](packages/client/src/components/HowToPlayModal.tsx), [src/content/howToPlay/](packages/client/src/content/howToPlay/) |
| WS transport / keep-alive / epoch | [src/net/ws.ts](packages/client/src/net/ws.ts) |
| Wire protocol (C2S/S2C) | [packages/shared/src/protocol.ts](packages/shared/src/protocol.ts) |
| Shared meld runtime (NS-1 cross-package) | [packages/shared/src/meld.ts](packages/shared/src/meld.ts) |
| Design tokens (NS-1) | [src/theme/tokens.ts](packages/client/src/theme/tokens.ts) + [packages/client/index.html](packages/client/index.html) `:root` |
| Game-variation accent + label (NS-7) | [src/theme/variations.ts](packages/client/src/theme/variations.ts) |
| Responsive breakpoint hook (NS-4) | [src/theme/useBreakpoint.ts](packages/client/src/theme/useBreakpoint.ts) |
| Reduced-motion hook (NS-6) | [src/theme/useReducedMotion.ts](packages/client/src/theme/useReducedMotion.ts) |
| Central thematic copy (T-GAP-2) | [src/content/copy.ts](packages/client/src/content/copy.ts) |
| Host house-rule editor (NS-8 target) | `src/components/HouseRuleConfig.tsx` (designed §3.12; not yet created) |
| Active house-rule deviation display (NS-8 target) | `src/components/HouseRuleSummary.tsx` (designed §3.13; not yet created) |
| House-rule registry + types (NS-8 target) | `packages/shared/src/houseRules.ts` (designed; not yet created) |
| Brand direction (NS-2 source) | [docs/branding.md](branding.md) |
| Architecture decisions & house rules | [docs/plan.md](plan.md) |

## Appendix B — North Star Traceability

| ID | Concept | Primary files to evolve | Sanctioned path |
| --- | --- | --- | --- |
| NS-1 | Design tokens | index.html, all components | E4 |
| NS-2 | Speakeasy re-skin | tokens, Card, body | E4 → re-skin |
| NS-3 | PixiJS card layer | Card.tsx (contract preserved) | E5 |
| NS-4 | Responsive layout | Room.tsx, Chat.tsx, modals | E6 |
| NS-5 | Identity/progression | new routes, store, protocol | E7 |
| NS-6 | Accessibility/motion | all interactive + modals + Card | V7, E5, E7 |
| NS-7 | Game-variation theming | HowToPlay (proto), Table, MeldZone, ActionBar | E3, E4 |
| NS-8 | House-rule config & disclosure | shared `houseRules.ts`, HouseRuleConfig (3.12), HouseRuleSummary (3.13), Home, Lobby, Room header, HowToPlay, ScoreOverlay; protocol `create`/`setHouseRules` + `PublicState.houseRules` | S9, E9 |
