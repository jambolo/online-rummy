# Rum Runner — UX Implementation Plan

> **Purpose:** Execution plan to close the North-Star gaps (NS-1…NS-8) and smaller `[Gap]` items catalogued in [docs/ux-design.md](ux-design.md) and `docs/ns-8.md`.
>
> **Audience:** An LLM (or human) implementing the client/shared/server changes. Optimized for direct execution: every task is self-contained with files, steps, guardrails, and a verify command.
>
> **Authoritative sources (read before editing):** [docs/ux-design.md](ux-design.md) (the UIDD — binding §4 guardrails), [docs/branding.md](branding.md) (NS-2 visual direction), [docs/plan.md](plan.md) (house-rule picks, architecture), [docs/rules.md](rules.md) (rule citations). When this plan and the UIDD disagree, the UIDD wins; update both in the same change (UIDD rule [E8]).

**Progress (as of 2026-05-30):** Phase A (NS-1 tokens) and Phase B (NS-6 a11y) complete — T-NS1-1, T-NS1-2, T-NS6-1, T-NS6-2, T-NS6-3 landed (commits 5073f18, 9d8a5de). All other phases (NS-7, NS-2, NS-4, NS-8, NS-5, NS-3, smaller gaps) not started. See §4 master checklist.

---

## 0. How to use this document

Each task is a card:

```text
[T-<phase>-<n>]  title
  NS:        which North-Star item(s) it advances
  depends:   task IDs that MUST land first
  files:     files created (+) or edited (~)
  steps:     ordered imperative actions
  guards:    binding constraints from UIDD §4 (cite the rule, e.g. [S1])
  accept:    done-when conditions
  verify:    command(s) to prove it
```

**Execution order:** follow the phase order in §3. Within a phase, follow task order unless `depends` says otherwise. Tasks in different phases with no shared `depends` may run in parallel (see the graph in §2).

**Global verify (run after every task that touches TS):**

```sh
pnpm --filter @online-rummy/shared build   # MUST precede any tsc --noEmit (CLAUDE.md build-order)
pnpm --filter @online-rummy/client exec tsc --noEmit
pnpm --filter @online-rummy/server exec tsc --noEmit
pnpm test
```

### 0.1 GitHub-issue reporting (MANDATORY after every step)

37 GitHub issues track this work. **After completing each `[T-*]` task (and each `flag` sub-task in T-NS8-3), you MUST notify the user** with a per-step report:

1. **Resolved issues** — issue numbers this step fully resolves (its `accept` conditions cover everything the issue asks). If a step only advances an issue, list it under **Partial** with what remains — do NOT mark resolved.
2. **Per-issue resolution comment** — for each resolved issue, a ready-to-paste comment stating *how* it was resolved: task ID, files changed, behavior now delivered, and the `verify` command proving it. Self-contained — issue readers lack this plan's context.

Report format (one block per completed step):

```text
Step <task-id> complete — <title>

Resolved issues:
  #<n> <issue title>
    comment: "Resolved by <task-id>. <files + behavior delivered>.
              Verified via <verify command>. Acceptance: <accept condition met>."

Partial (advanced, not resolved):
  #<k> <issue title> — <what this step did; what still blocks closure>

No issue mapped: <state explicitly when the step touches no filed issue>
```

Rules:

- Use the issue→step map in §0.2. When one issue spans multiple steps (e.g. NS-8 across T-NS8-1…5), mark it resolved only on the **last** satisfying step; earlier steps report it as **Partial**.
- Do NOT close or edit issues yourself — only surface the list + draft comments; the user posts/closes.
- If a step maps to no issue, say so. Silence is not acceptable; the user audits coverage step by step.

### 0.2 Issue → step map

Resolve an issue only on the step in its **Resolves** column; report it as **Partial** on every earlier step in its **Advanced-by** column.

Resolve an issue only on the step in its **Resolves** column; report it as **Partial** on every earlier step in its **Advanced-by** column.

| Task | Resolves (close on this step) | Partial / advanced-by |
| --- | --- | --- |
| T-NS1-1 | #3 (weight-token scale declared) | #1, #2 (tokens declared, not yet migrated) |
| T-NS1-2 | #1, #2 | — |
| T-NS6-1 | #20 | — |
| T-NS6-2 | #21 | — |
| T-NS6-3 | #22, #23 | — |
| T-NS4-1 | #10, #11 | — |
| T-NS4-2 | #12, #13 | — |
| T-NS7-1 | — | #24 |
| T-NS7-2 | #24, #26, #27 | #25 (accent+label only; themed-art cards unscoped) |
| T-NS2-1 | — | #4 |
| T-NS2-2 | #4, #34, #35 | — |
| T-NS8-1 | #28 | — |
| T-NS8-2 | #29, #30 | — |
| T-NS8-3 | #31 | — (jokers flag stays `supported:false` — note in #31 comment) |
| T-NS8-4 | #32 | — |
| T-NS8-5 | #33, #37 | — |
| T-NS5-1 | #14, #15, #17, #19 | #16 |
| T-NS3-1 | #5, #6, #7, #8, #9 | — |
| T-GAP-2 | — | #16, #35 (copy module) |
| T-GAP-3 | #16, #36 | — |

**Out of this plan's scope — do NOT report against any step:**

- **#18** — spectator mode + mid-hand reconnect. Explicit plan.md v1 non-goal (see T-NS5-1 notes). Resolve only as a deliberate scope change, never incidentally.

**Notes:**

- #5–#9 are the five NS-3 sub-tasks (sprite, hand fan, deal/discard animation, pile-dive stack, drag-to-layoff/group); T-NS3-1 delivers all five — report each by number in that step.
- #1–#3 are the three NS-1 sub-tasks (color tokens, spacing/radius scales, weight scale). T-NS1-1 declares all tokens (resolves #3); T-NS1-2 finishes the migration that satisfies #1 and #2's "no ad-hoc hex / magic numbers remain" acceptance.

---

## 1. Binding invariants (apply to EVERY task)

Distilled from UIDD §4. Treat violations as build-breaking.

- **[S1] Scalar selectors only.** `const x = useAppStore(s => s.x)`. Never pass an object/array literal to `useAppStore` — breaks `useSyncExternalStore` (infinite loop). One hook call per value.
- **[S2] Server-authoritative, pessimistic UI.** Components render `PublicState`/`PrivateState` and emit `C2S` via `send(...)`. Never mutate or optimistically fabricate game truth.
- **[S3] One ingestion point.** All `S2C` handling extends the `switch` in `store.handleMessage`. Never add socket listeners in components.
- **[S4] One store.** New cross-component state is a field + action on the Zustand store in [store.ts](packages/client/src/store.ts). Transient UI state (form text, hover, open flags) may use local `useState`.
- **[S5] Variant narrowing.** Read per-variation public fields only after narrowing on `publicState.variantPublic.variant`. Never read one variation's data under another. Never add per-variation fields to top-level `PublicState`.
- **[S6] Identity.** Local player is `myPlayerId`; gate host-only controls with `myPlayerId === hostId`.
- **[S7] Card resolution.** Cards that may have left the hand (melds, score breakdown) resolve via `lookupCard(id)`/`cardCache`.
- **[V1] No CSS framework.** Inline `React.CSSProperties` + the global classes in [index.html](packages/client/index.html). The only sanctioned styling-system change is the NS-1 token layer.
- **[V2] No ad-hoc literals.** Every color maps to a semantic token (§4 of this plan). A new literal must be added to the token set in the same change.
- **[V3] Modal pattern.** `position:fixed; inset:0; background var(--scrim); centered flex`; inner panel `2px var(--border-modal) border; radius 12`. z-index: ScoreOverlay 100, all other modals 200, dragging card 10. No new z-index without documenting it.
- **[V4] One card renderer.** All cards go through [Card.tsx](packages/client/src/components/Card.tsx) with its exact Props contract (`card, selected, dimmed, compact, onClick, style`). Keep `textAlign:'left'`. Never inline a second renderer.
- **[V5] Section-label idiom.** `fontSize 11; textTransform uppercase; letterSpacing 1; color var(--text-60)`. Secondary text uses the white-opacity ramp, not new grays.
- **[V7] No color-only state.** Any state signalled by color (turn, deadwood validity, delta sign) MUST also carry a non-color cue (icon/label/shape).
- **Terminology (CLAUDE.md, strict).** Prose/UI copy: "game variation" and "house rule" — never "variant". **Code identifiers keep their names** (`Variant`, `variant`, `variantPublic`, `VariantEngine`, …).

---

## 2. Dependency graph & recommended sequence

```text
Phase A  NS-1 tokens ───────────────┬─────────────┬───────────────┐
                                     ▼             ▼               ▼
Phase D  NS-7 variation theming   Phase E  NS-2 re-skin     (consumed by all later visual work)
Phase B  NS-6 a11y baseline  (independent; touches modal primitive + Card + cues)
Phase C  NS-4 responsive     (independent; layout-only)
Phase F  NS-8 house rules    (shared registry → protocol → engine → UI; independent track)
Phase G  NS-5 identity/progression  (NEEDS PERSISTENCE DECISION — see T-NS5-0)
Phase H  NS-3 PixiJS card layer (M8)  (behind Card contract; after a11y reduced-motion hook)
Phase I  smaller [Gap] items  (fold-ins + standalone)
```

**Critical fact:** NS-1 (Phase A) is the prerequisite for NS-2 and NS-7. Do it first. NS-6, NS-4, and NS-8 are independent tracks that can proceed in parallel with the visual work. NS-5 is gated on a persistence decision and is the largest new surface. NS-3 is the existing M8 milestone — keep it last and behind the `<Card>` contract.

---

## 3. Token reference (canonical — NS-1 target, do not re-derive)

This is the single source of truth for the token migration. Names are the semantic tokens; values are the current literals (migration pass 1 keeps values identical → zero visual change). Source: UIDD §2.3 + §4.2 [V2].

### 3.1 Surface & brand

| Token | Value | Usage |
| --- | --- | --- |
| `--surface-felt` | `#1a6b1a` | body background |
| `--surface-panel` | `rgba(0,0,0,0.35)` | Home/Lobby cards |
| `--surface-panel-muted` | `rgba(0,0,0,0.2)` | Hand, Chat, opponent chip, meld pile |
| `--surface-modal-green` | `#1a4a1a` | ScoreOverlay, ConfirmModal |
| `--surface-modal-navy` | `#1a2a4a` | HowToPlay, PileDive |
| `--scrim` | `rgba(0,0,0,0.65)` | all modal backdrops |
| `--border-modal` | `rgba(255,255,255,0.2)` | 2px modal borders |
| `--card-face` | `#fff` | card background |
| `--card-face-dimmed` | `#e8e8e8` | dimmed card |
| `--card-back` | `#1a3a8a` | stock back, meld placeholder |
| `--card-border` | `#bbb` | default card border |
| `--card-red` | `#c0392b` | ♦♥ |
| `--card-black` | `#111` | ♣♠ |

### 3.2 Text ramp (white at decreasing opacity)

`--text-100 #fff` · `--text-85` · `--text-70` · `--text-60` · `--text-55` · `--text-50` · `--text-45` · `--text-40` · `--text-30`. NS-2 rebases these onto aged-parchment off-white.

### 3.3 Controls

| Token | Base / Hover | Usage |
| --- | --- | --- |
| `--btn-default` | `#2a7a2a` / `#3a9a3a` | neutral button |
| `--btn-primary` | `#1a7aae` / `#2a8abe` | `.primary` |
| `--btn-danger` | `#ae2a1a` / `#c03a2a` | `.danger` |
| `--focus-ring` | `#4a9eff` | input/select focus, selected-card border, selection shadow |

### 3.4 Semantic accents

| Token | Value | Meaning |
| --- | --- | --- |
| `--accent-self` | `#7fd4ff` cyan | "(you)" tag, chat sender, Basic/500 rule headings |
| `--accent-host` | `#ffd700` gold | "host" tag |
| `--accent-attention` | `#ffd166` amber | mustMeld outline, pile-dive highlight, Gin rule headings, knock hints, **house-rule deviation chips (NS-8)** |
| `--accent-positive` | `#7fff7f` green | active-turn outline, positive delta, deadwood-OK |
| `--accent-negative` | `#ff7f7f` salmon | negative delta, "forfeited", Leave text |
| `--accent-gin` | `#6a0dad` purple | "Gin!" button |
| `--accent-meld-credit` | `#2a7a2a` | "+pts" badge on melded cards |
| `--accent-deadwood-badge` | `#555` | pts badge on unmelded cards |

### 3.5 Type & space

- **Type scale (px):** 22, 20, 18, 16, 15, 14, 13, 12, 11, 10, 9 (UIDD §2.3). Promote section-label to `--type-section-label`.
- **Weights (NS-1 new):** `--weight-regular 400`, `--weight-medium 500`, `--weight-semibold 600`, `--weight-bold 700`.
- **Space scale:** 3, 4, 6, 8, 10, 12, 16, 20, 24, 28, 32 → `--space-1…` ramp.
- **Radius:** `--radius-card 12`, `--radius-panel 8`, `--radius-control 6`, `--radius-chip 4`.
- **z-index:** `--z-card-drag 10`, `--z-score-overlay 100`, `--z-modal 200`.

---

## Phase A — NS-1 Design-token layer (foundation)

Goal: one source of truth for color/type/space/radius/z. **Pass 1 changes no pixels** — values identical to current literals (UIDD [E4]).

### [T-NS1-1] Declare tokens

```text
NS:      NS-1
depends: —
files:   ~ packages/client/index.html
         + packages/client/src/theme/tokens.ts
steps:
  1. In index.html <style>, add a :root block declaring every CSS custom property
     in §3 of this plan, set to its current literal value.
  2. Repoint the existing global rules (body, button, .primary, .danger, input,
     :focus) to var(--token) — identical resolved values.
  3. Create src/theme/tokens.ts exporting a typed map of the same names →
     'var(--token)' strings, e.g. `export const t = { accentSelf: 'var(--accent-self)', … } as const`.
     This gives inline-style ergonomics + type safety while CSS vars remain the
     runtime source of truth (enables NS-2 reskin / per-table theming without recompile).
guards:  [V1] tokens ARE the sanctioned styling-system change; [V2] names = §3 exactly.
accept:  app renders pixel-identical to pre-change (diff is value→var only).
verify:  pnpm --filter @online-rummy/client exec tsc --noEmit; visual smoke (dev server).
```

### [T-NS1-2] Migrate components to tokens (incremental, no visual change)

```text
NS:      NS-1
depends: T-NS1-1
files:   ~ all of src/components/*, src/routes/*  (one file per commit)
steps:
  1. Component by component, replace hardcoded literals with `t.*` from tokens.ts.
  2. Replace the section-label literal cluster with a shared style const
     (`sectionLabel` in tokens.ts or src/theme/styles.ts) per [V5].
  3. Replace magic spacing/radius numbers with the space/radius tokens where an
     existing step fits ([V6]); leave one-offs flagged with a `// NS-1 one-off` comment.
guards:  [V2][V5][V6]; do NOT change resolved values in this pass.
accept:  every component imports from tokens.ts; no raw hex outside tokens.ts/index.html
         (grep `#[0-9a-fA-F]{3,6}` in src/components + src/routes returns only comments).
verify:  tsc --noEmit; visual smoke; `pnpm test`.
```

---

## Phase B — NS-6 Accessibility & motion baseline

Independent of tokens. Highest leverage = the shared modal primitive (every modal inherits the fix).

### [T-NS6-1] Modal primitive with focus trap + roles + Esc

```text
NS:      NS-6
depends: —
files:   + packages/client/src/components/Modal.tsx
         ~ Room.tsx (ConfirmModal, ScoreOverlay), HowToPlayModal.tsx, PileDiveModal.tsx
steps:
  1. Create <Modal> implementing [V3] (fixed inset-0 scrim, centered panel, z per token):
     - role="dialog", aria-modal="true", aria-labelledby pointing at the title node.
     - Focus trap: on mount focus the panel/first focusable; Tab/Shift+Tab cycle within;
       restore focus to the opener on close.
     - Esc closes (calls onClose). Backdrop click closes; inner click stopPropagation.
  2. Refactor ConfirmModal, ScoreOverlay, HowToPlayModal, PileDiveModal to render through <Modal>.
     Preserve each one's existing width/surface token and z-index (ScoreOverlay stays 100).
guards:  [V3] z-index scale unchanged; [S4] open/close stays local useState or store as today.
accept:  keyboard-only user can open, tab within, and Esc-close every modal; screen reader
         announces dialog role + title.
verify:  tsc --noEmit; manual keyboard pass on each modal.
```

### [T-NS6-2] Non-color state cues

```text
NS:      NS-6
depends: —
files:   ~ Room.tsx (OpponentStrip), ActionBar.tsx, ScoreOverlay, MeldZone.tsx, Hand.tsx
steps:
  1. Turn ownership: add a non-color cue beside the green outline — a "● your turn" /
     "▸ {name}'s turn" label or ▶ marker on the active chip ([V7]).
  2. Score delta sign: prefix +/− glyph AND an arrow (▲/▼); do not rely on green/salmon alone.
  3. Deadwood validity: pair the green ✓ with the word "OK"/"≤10" (already partly present —
     ensure the icon+text both appear, not color alone).
  4. mustMeld / pile-dive: keep amber but add a text/▲ marker.
guards:  [V7] every existing color-only signal gains a redundant cue; [V2] reuse accent tokens.
accept:  with a grayscale filter, turn, delta sign, and deadwood validity remain distinguishable.
verify:  tsc --noEmit; grayscale visual check.
```

### [T-NS6-3] Reduced-motion + keyboard reorder hooks

```text
NS:      NS-6 (also unblocks NS-3 [E5])
depends: —
files:   + src/theme/useReducedMotion.ts ; ~ Hand.tsx ; ~ PileDiveModal.tsx
steps:
  1. Add useReducedMotion() (matchMedia('(prefers-reduced-motion: reduce)')) → boolean.
     Components gate transitions/animations off when true. Wire into Card transitions and
     any new motion. (Contract for NS-3 [E5].)
  2. Hand: add keyboard reordering (arrow keys move the focused card; dnd-kit
     KeyboardSensor) so reorder is not pointer-only.
  3. PileDiveModal: arrow-key navigation across the pile + Enter to pick; mirror the hover
     "willTake" highlight on focus.
guards:  [S1] scalar selectors; preserve PointerSensor distance:6 tap-vs-drag behavior.
accept:  prefers-reduced-motion disables transitions; Hand + PileDive operable by keyboard.
verify:  tsc --noEmit; manual keyboard + OS reduced-motion toggle.
```

---

## Phase C — NS-4 Responsive layout (additive, layout-only)

Touch *input* already works (PointerSensor distance:6). This is layout reflow only; MUST NOT break desktop ([E6]).

### [T-NS4-1] Breakpoint helper + Room reflow

```text
NS:      NS-4
depends: —  (PREFER after T-NS1-1 so widths are tokenized)
files:   + src/theme/useBreakpoint.ts ; ~ routes/Room.tsx
steps:
  1. Add useBreakpoint() → 'mobile' | 'tablet' | 'desktop' via matchMedia
     (e.g. <=640, <=900, >900). One scalar value, [S1]-safe.
  2. Room main row: at 'mobile', stack the table-column above Chat (column flex) instead of
     the fixed table+220 row; let the left column take full width.
  3. Convert fixed panel widths (Chat 220; lobby/home 360) to clamp()/min() fluid widths.
guards:  [E6] desktop layout in UIDD §2.2 unchanged at >900; [V6] reuse space tokens.
accept:  at 375px width the table, meld zone, action bar, and hand are usable with no
         horizontal scroll; desktop visually unchanged.
verify:  tsc --noEmit; responsive devtools at 375/768/1280.
```

### [T-NS4-2] Chat drawer + ActionBar label fit

```text
NS:      NS-4
depends: T-NS4-1
files:   ~ components/Chat.tsx ; ~ components/ActionBar.tsx ; ~ Room.tsx
steps:
  1. Chat: on 'mobile', render as a collapsible bottom-sheet/drawer toggled by a header
     button (unread count badge optional, see T-GAP-3); on desktop keep the side panel.
  2. ActionBar: allow labels to wrap/shrink; shorten on 'mobile' (icon + short text) so
     "Draw from stock (n)" etc. don't overflow. Keep the dominant action visually primary.
guards:  [V8] keep .primary/.danger semantics; [S1].
accept:  no ActionBar overflow at 375px; chat reachable on mobile without covering the table.
verify:  tsc --noEmit; mobile viewport manual pass.
```

---

## Phase D — NS-7 Game-variation-identity theming

Depends on tokens (accent map lives in the token layer). Formalize the implicit Basic/500-cyan, Gin-amber convention into a map applied across Table/MeldZone/ActionBar/chips, plus friendly labels.

### [T-NS7-1] Accent map + friendly labels

```text
NS:      NS-7
depends: T-NS1-1
files:   + src/theme/variations.ts
steps:
  1. Export VARIATION_ACCENT: Record<Variant, { accent: string; label: string }>.
     - basic:  accent var(--accent-self) (cyan), label "Classic Rummy"
     - rum500: label "500 Rum"  [DECISION: keep cyan (matches current pairing) OR assign a
                distinct accent for true per-variation identity — default keep cyan, flag in PR]
     - gin:    accent var(--accent-attention) (amber), label "Gin Rummy"
  2. Export a helper variationAccent(variant) and variationLabel(variant).
guards:  terminology — label strings use friendly names; code keys stay 'basic'|'rum500'|'gin'.
accept:  single import point for per-variation accent + label.
verify:  tsc --noEmit.
```

### [T-NS7-2] Apply accent + labels across surfaces

```text
NS:      NS-7  (folds smaller [Gap]: Lobby raw-variant subtitle)
depends: T-NS7-1
files:   ~ routes/Home.tsx, routes/Room.tsx (Lobby + header), components/Table.tsx,
           components/MeldZone.tsx, components/ActionBar.tsx, HowToPlayModal.tsx
steps:
  1. Lobby subtitle + Room header + ScoreOverlay: replace raw `variant` string with
     variationLabel(variant).
  2. MeldZone pile chrome, Table slot accents, ActionBar phase label: tint with
     variationAccent(variant) (border/label accent only — keep surfaces neutral).
  3. HowToPlay h3 headings: read accent from the map instead of the inline per-file literal.
guards:  [V2] no new literals — all via the map/tokens; [S5] no per-variation data leakage.
accept:  each game variation reads coherently (accent + friendly label) on every surface;
         no "basic"/"rum500" raw strings in UI.
verify:  tsc --noEmit; visual check all three variations.
```

---

## Phase E — NS-2 Speakeasy art-deco re-skin

Token re-skin, NOT a re-architecture ([E4]→re-skin). Component tree + state flow unchanged. Per [docs/branding.md](branding.md): brass/gold, deep navy/charcoal, mahogany/felt texture, art-deco display + humanist body face, parchment off-white text, branded RR card back.

### [T-NS2-1] Typography faces

```text
NS:      NS-2
depends: T-NS1-1
files:   ~ index.html ; ~ src/theme/tokens.ts
steps:
  1. Add --font-display (geometric art-deco) + --font-body (humanist) tokens; load faces
     (self-host woff2 in packages/client/public/fonts; link in index.html). Set body to
     --font-body; headings/labels/logo wordmark to --font-display.
guards:  [V1] global block only; no framework.
accept:  display face on headings/section labels, body face on prose; FOUT controlled.
verify:  tsc --noEmit; visual.
```

### [T-NS2-2] Re-skin surface token VALUES

```text
NS:      NS-2  (folds smaller [Gap]: Home banner art-direction, branding copy)
depends: T-NS1-2, T-NS2-1
files:   ~ index.html (:root values), src/theme/tokens.ts; ~ Card.tsx (card back);
           ~ src/content/copy.ts (new — see T-GAP-2)
steps:
  1. Re-point surface/text token VALUES to the speakeasy palette: charcoal/navy panels with
     brass-edge borders, mahogany/felt textured --surface-felt (CSS gradient/texture),
     parchment off-white text ramp, brass-rimmed buttons. Accents (cyan/amber/etc.) stay.
  2. Card back (--card-back): replace flat blue with the branded RR monogram (SVG/CSS).
     Keep <Card> Props contract intact [V4].
  3. Apply branding copy (T-GAP-2): "Enter the High-Stakes Room", "The Backroom" (chat),
     etc., from the central copy module.
guards:  [V4] Card contract unchanged; [V3] modal structure unchanged (only values change);
         component tree untouched.
accept:  app reads as the branding.md speakeasy direction; no structural/JSX changes beyond
         card-back art + copy.
verify:  tsc --noEmit; full visual pass across Home/Lobby/Room/modals.
```

---

## Phase F — NS-8 House-rule configuration & disclosure

Largest cross-cutting feature. **Hard ordering ([E9]): the engine MUST honor a flag BEFORE its toggle is exposed.** Sequence: shared registry → protocol/state wiring → engine consumption → UI (config + summary). A flag the engine ignores MUST stay hidden/disabled.

### [T-NS8-1] Shared registry + types

```text
NS:      NS-8
depends: —
files:   + packages/shared/src/houseRules.ts ; ~ packages/shared/src/index.ts (barrel)
steps:
  1. Define:
     type HouseRuleId = 'aceEitherEnd'|'roundTheCorner'|'maxOneMeldPerTurn'
        |'layoffRequiresPriorMeld'|'goingRummyFlat10'|'acesAlways15'|'low5Scoring'
        |'jokers'|'unifiedObligation'|'setsRequireDistinctSuits'|'deal10For2P';
     type HouseRuleValue = boolean | number | string;
     type HouseRules = Partial<Record<HouseRuleId, HouseRuleValue>>;
     type HouseRuleDef = { id: HouseRuleId; label: string; description: string;
        canonical: HouseRuleValue; kind: 'toggle'|'choice';
        choices?: Array<{ value: HouseRuleValue; label: string }>; rulesRef: string;
        supported: boolean };   // supported=false ⇒ engine does not honor yet ⇒ UI hides it [E9]
  2. Export HOUSE_RULE_DEFS: Record<Variant, HouseRuleDef[]> per the v1 table below
     (canonical defaults from plan.md "House rule picks"; each entry cites rules.md).
  3. Export helpers: canonicalHouseRules(variant): HouseRules;
     isDeviation(variant, id, value): boolean  (value !== def.canonical);
     supportedDefs(variant): HouseRuleDef[]  (def.supported === true).
guards:  CLAUDE.md — code keeps identifier spellings; prose uses "house rule".
         Single source of truth for `canonical` ([S9]); never duplicate a default in a component.
accept:  shared builds; registry importable from client + server.
verify:  pnpm --filter @online-rummy/shared build; tsc --noEmit (client+server).
```

**v1 registry (canonical defaults — diff target for the summary). `supported` flips to true only when its T-NS8-3 sub-task lands.**

| Variation | id | canonical | kind | rules.md | supported (v1 target) |
| --- | --- | --- | --- | --- | --- |
| basic | `aceEitherEnd` | `false` | toggle | A.1.4 | yes |
| basic | `roundTheCorner` | `false` | toggle | A.1.4 | yes |
| basic | `maxOneMeldPerTurn` | `false` | toggle | A.1.6 | yes |
| basic | `layoffRequiresPriorMeld` | `false` | toggle | A.1.6 | yes |
| basic | `goingRummyFlat10` | `false` | toggle | A.1.7 | yes |
| rum500 | `acesAlways15` | `false` | toggle | A.4.2 | yes |
| rum500 | `low5Scoring` | `false` | toggle | A.4.2 | yes |
| rum500 | `unifiedObligation` | `false` | toggle | A.4.4 | yes |
| rum500 | `setsRequireDistinctSuits` | `false` | toggle | A.4.3 | yes |
| rum500 | `deal10For2P` | `false` | toggle | A.4.1 | yes |
| rum500 | `jokers` | `false` | toggle | A.4.5 | **no** (engine work heavy — keep hidden until a dedicated task) |
| gin | — | — | — | A.2 | empty registry (canonical-only v1, plan.md) |

### [T-NS8-2] Protocol + state plumbing (no engine behavior yet)

```text
NS:      NS-8
depends: T-NS8-1
files:   ~ packages/shared/src/protocol.ts, packages/shared/src/cards.ts
         ~ packages/server/src/ws.ts, packages/server/src/room.ts
         ~ packages/server/src/engine/types.ts (GameState)
         ~ packages/client/src/store.ts
steps:
  1. protocol.ts:
     - `create` gains `houseRules?: HouseRules`.
     - add `{ t: 'setHouseRules'; houseRules: HouseRules }` (lobby + host-only).
     - `lobby` S2C gains `houseRules: HouseRules` (pre-game disclosure source).
  2. cards.ts: `PublicState` gains top-level `houseRules: HouseRules` (cross-variation →
     NOT in variantPublic, per [S5] exception: it is variation-agnostic config).
  3. room.ts: Room stores `houseRules: HouseRules` (default canonicalHouseRules(variant) at
     create; replaced by validated setHouseRules in lobby).
  4. ws.ts:
     - create handler: validate incoming houseRules against HOUSE_RULE_DEFS (reject unknown
       id/kind; reject any id with supported=false → ERR_UNSUPPORTED_HOUSE_RULE); store on Room.
     - new setHouseRules handler: host-only + lobby-only (ERR_NOT_HOST / ERR_WRONG_STATE),
       validate, store, re-broadcast lobby.
     - broadcastLobby includes room.houseRules; buildPublicState includes it.
     - start handler: pass room.houseRules into createBasicGame/createRum500Game →
       GameState.houseRules.
  5. engine/types.ts: GameState gains `houseRules: HouseRules`.
  6. store.ts: add `houseRules` field (from lobby + publicState); add `setHouseRules(hr)`
     action sending the C2S; handleMessage stores houseRules from lobby + state. Add
     ERR_UNSUPPORTED_HOUSE_RULE / ERR_NOT_HOST mapping to ERROR_MESSAGES.
guards:  [S2][S3][S9]; server validates — never trust client values. Engine still ignores the
         flags at this step (behavior unchanged) — that is intentional; UI not yet exposed.
accept:  create/setHouseRules round-trip; lobby + state carry houseRules; engine behavior
         identical to today (flags stored, not yet consumed).
verify:  shared build; tsc --noEmit (all); pnpm test (existing tests green — defaults canonical).
```

### [T-NS8-3] Engine consumption (one sub-task per flag; gate `supported`)

```text
NS:      NS-8
depends: T-NS8-2
files:   ~ engine/variants/basic.ts, rum500.ts, engine/meld.ts (validateMeld opts),
           engine/scoring.ts, engine/deck.ts (deal counts), + engine __tests__
rule:    For EACH flag below, implement + add golden tests proving canonical (default) AND
         enabled behavior, THEN flip its registry `supported:true`. Do NOT expose before tested.
flags:
  basic.aceEitherEnd            → pass aceEitherEnd:true into the basic meld-validation opts
                                  (mirror rum500's existing path); A=11 in run scoring when high.
  basic.roundTheCorner          → set roundTheCorner from config in core meld check (K-A-2 legal).
  basic.maxOneMeldPerTurn       → applyMeld rejects a 2nd meld this turn (track meldedThisTurn).
  basic.layoffRequiresPriorMeld → applyLayoff requires the player has ≥1 own meld placed.
  basic.goingRummyFlat10        → hand scoring: flat +10 to winner instead of ×2 doubling.
  rum500.acesAlways15           → score500MeldCard: ace = 15 even in A-2-3.
  rum500.low5Scoring            → 2-9 and A-in-A23 score 5.
  rum500.unifiedObligation      → applyDraw{from:'discard'} also sets mustMeldCardId.
  rum500.setsRequireDistinctSuits → set validation requires distinct suits (2-deck play).
  rum500.deal10For2P            → 2P deal = 10 instead of 13.
  rum500.jokers                 → DEFERRED: keep supported:false until a dedicated jokers task
                                  (deck + wild meld validation is large).
guards:  [E9] engine default branch == canonical; rule citations `// rules.md A.x.y`;
         server engine coverage thresholds (90% line/fn, 85% branch) hold.
accept:  each supported flag changes behavior only when enabled; defaults reproduce current
         golden scores; coverage thresholds met.
verify:  pnpm --filter @online-rummy/server exec vitest run --coverage.
```

### [T-NS8-4] HouseRuleConfig (host editor) — UIDD §3.12

```text
NS:      NS-8
depends: T-NS8-2, T-NS8-3 (renders only supportedDefs)
files:   + packages/client/src/components/HouseRuleConfig.tsx
         ~ routes/Home.tsx (create form disclosure), routes/Room.tsx (Lobby panel)
steps:
  1. Build a data-driven editor from supportedDefs(variant): toggle rows (switch · label ·
     ⓘ description · amber "house rule" chip when non-canonical) and choice rows (segmented,
     canonical option marked "(standard)"). "Reset to canonical" link. Empty registry (gin) →
     italic "No house rules for this game variation — canonical rules apply." (still render the
     disclosure for discoverability).
  2. Home create form: collapsed "House rules" disclosure seeded with canonicalHouseRules;
     chosen map rides on `create`.
  3. Lobby: host-only editable panel; each edit dispatches store.setHouseRules → C2S; non-hosts
     never see the editor.
guards:  [S1][S4][S6][S9]; [V2] amber = --accent-attention; controls keyboard-operable + labelled
         (NS-6); read canonical from registry, never hardcode.
accept:  host toggles a supported rule in Home or Lobby; lobby re-broadcasts; only supported
         rules appear; canonical rows show no chip.
verify:  tsc --noEmit; 2-client manual: host edits, both see update.
```

### [T-NS8-5] HouseRuleSummary (all-players disclosure) — UIDD §3.13

```text
NS:      NS-8  (folds smaller [Gap]: HowToPlay reflects actual config)
depends: T-NS8-2
files:   + packages/client/src/components/HouseRuleSummary.tsx
         ~ routes/Room.tsx (Lobby block + header chip→popover + ScoreOverlay),
           HowToPlayModal.tsx ("Table house rules" section)
steps:
  1. Derive deviations purely by diffing configured houseRules (publicState in game / lobby
     houseRules pre-game) against HOUSE_RULE_DEFS[variant][id].canonical. List only deviations;
     fully-canonical → "Canonical rules — no deviations."
  2. Mount: (a) Lobby under player list; (b) game header compact chip "⚖ House rules · {n}"
     opening a popover (modal/scrim pattern, z 200); (c) HowToPlay "Table house rules" section;
     (d) ScoreOverlay line when a deviating rule affected scoring (goingRummyFlat10, acesAlways15,
     low5Scoring).
guards:  [S9] deviation = configured !== canonical (registry); [V3] popover follows modal pattern;
         [V2] amber accent + section-counter idiom. New rules surface automatically — no per-rule UI.
accept:  changing any supported rule shows it as a deviation everywhere the summary mounts;
         canonical table shows none.
verify:  tsc --noEmit; 2-client manual across lobby/header/howto/score.
```

---

## Phase G — NS-5 Identity & progression

Largest NEW surface. Requires persistence, which plan.md currently fixes as **"None, in-memory."** This phase is **blocked on a product decision** — do not start implementation tasks until resolved.

### [T-NS5-0] DECISION GATE — persistence backend

```text
NS:      NS-5
depends: —
type:    decision (no code)
question: Accounts/Dossier/rank/history/stats need durable storage. plan.md says no DB.
options:
  a. Defer NS-5 entirely (keep guest-only) — recommended for v1 scope.
  b. Add a minimal persistence layer (e.g. SQLite/file) + auth — new architecture, large.
  c. Local-only progression (browser localStorage Dossier; no cross-device, no server trust).
output:  record the choice in plan.md "Decisions" before any T-NS5-n task.
```

### [T-NS5-1…] (only if T-NS5-0 ≠ defer)

```text
NS:      NS-5
depends: T-NS5-0
notes:   New routes (Dossier, room browser) follow [E1]; persisted identity extends store and,
         when a backend exists, the protocol — without weakening [S2] server authority.
         Thematic rank ladder (Associate→The Don) + terminology ("The Dossier", "The Backroom")
         from branding.md. Avatars/rank on OpponentStrip chips. Spectator mode + mid-hand
         reconnect are explicit plan.md non-goals for v1 — treat as separate scope changes.
         ScoreOverlay rank-change announcement ("you advanced to Bootlegger") lands here.
```

---

## Phase H — NS-3 PixiJS card layer (M8)

This is the existing **M8** milestone (plan.md). Keep last. MUST sit behind the `<Card>` Props contract so Hand/MeldZone/Table/ScoreOverlay/PileDive are untouched ([E5]).

### [T-NS3-1] PixiJS card behind the Card contract

```text
NS:      NS-3
depends: T-NS6-3 (reduced-motion), T-NS2-2 (final card-back art)
files:   ~ components/Card.tsx (internal swap only) + a Pixi stage layer
steps:
  1. Replace Card internals with a GPU-rendered sprite while preserving exact Props
     (card, selected, dimmed, compact, onClick, style) and the 56×80 / 40×56 / 36×50 sizes.
  2. Add deal/flip/meld animation + fanned/arc hand layout with overlap; animated deal-from-
     stock, discard fan, overlapped pile-dive stack visualization.
  3. Optional NS-4 synergy: drag-to-layoff (drop hand card on a meld pile), drag-to-group in
     the knock builder.
guards:  [V4] Props contract unchanged; [E5] honor prefers-reduced-motion via useReducedMotion.
accept:  callers unchanged; animations respect reduced-motion; no regression in turn flow.
verify:  tsc --noEmit; full play-through of all three variations.
```

---

## Phase I — Smaller `[Gap]` items

Fold where noted; the rest are small standalone tasks.

| ID | Item | Disposition |
| --- | --- | --- |
| T-GAP-1 | Home banner `maxHeight 180` crop not art-directed | fold into **T-NS2-2** (re-skin pass) |
| T-GAP-2 | Branding language not applied | **standalone:** `+ src/content/copy.ts` central copy module ("Enter the High-Stakes Room", "The Backroom", rank names); consumed by NS-2/NS-5. Do this before T-NS2-2. |
| T-GAP-3 | Chat: no emotes, no system-message styling, no unread indicator | **standalone (small):** style system messages distinctly; unread badge feeds T-NS4-2 drawer; emotes optional. Thematic "The Backroom" label via copy.ts. |
| T-GAP-4 | HowToPlay static, ignores actual table config | fold into **T-NS8-5** ("Table house rules" section) |
| T-GAP-5 | Lobby subtitle raw variant string | fold into **T-NS7-2** |

---

## 4. Master checklist

```text
Phase A — NS-1 tokens
  [x] T-NS1-1 declare tokens (zero visual change)         (commit 5073f18; issues #1,#2,#3)
  [x] T-NS1-2 migrate components to tokens                (commit 5073f18; issues #1,#2)
Phase B — NS-6 a11y
  [x] T-NS6-1 modal primitive (focus trap, role, Esc)     (commit 9d8a5de; issue #20)
  [x] T-NS6-2 non-color cues                              (commit 9d8a5de; issue #21)
  [x] T-NS6-3 reduced-motion + keyboard reorder           (commit 9d8a5de; issues #22,#23)
Phase C — NS-4 responsive
  [ ] T-NS4-1 breakpoint helper + Room reflow
  [ ] T-NS4-2 chat drawer + ActionBar fit
Phase D — NS-7 variation theming
  [ ] T-NS7-1 accent map + friendly labels
  [ ] T-NS7-2 apply across surfaces
Phase E — NS-2 speakeasy re-skin
  [ ] T-NS2-1 typography faces
  [ ] T-NS2-2 re-skin token values + card back + copy
Phase F — NS-8 house rules
  [ ] T-NS8-1 shared registry + types
  [ ] T-NS8-2 protocol + state plumbing
  [ ] T-NS8-3 engine consumption per flag (+ tests, flip supported)
  [ ] T-NS8-4 HouseRuleConfig editor
  [ ] T-NS8-5 HouseRuleSummary disclosure
Phase G — NS-5 identity/progression
  [ ] T-NS5-0 DECISION GATE (persistence)
  [ ] T-NS5-1… (only if not deferred)
Phase H — NS-3 PixiJS (M8)
  [ ] T-NS3-1 Pixi card behind Card contract
Phase I — smaller gaps
  [ ] T-GAP-2 central copy module
  [ ] T-GAP-3 chat system/unread/emotes
  (T-GAP-1/4/5 folded)
```

## 5. Definition of done (per task)

- `pnpm --filter @online-rummy/shared build` then `tsc --noEmit` clean on client + server.
- `pnpm test` green; engine coverage thresholds (90% line/fn, 85% branch) hold for NS-8 engine work.
- No new color literal outside the token layer ([V2]); no new z-index outside the scale ([V3]).
- UIDD §2–§3 tables updated in the SAME change when behavior/structure changed ([E8]) — this plan and [docs/ux-design.md](ux-design.md) never drift from code.
