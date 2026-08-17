# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Package-specific guidance lives in `packages/server/CLAUDE.md` and `packages/client/CLAUDE.md`; those load automatically when working under their directory.

## Terminology (strict)

Use this vocabulary in **all documentation and user-facing UI strings**:

- **Game variation** — a distinct game in the suite (Classic Rummy, Gin Rummy, 500 Rummy, Knock Rummy, …). Never call one a "variant".
- **House rule** — a configurable rule option within a game variation (e.g. "Maximum one meld per turn", "Layoff requires prior meld", "Going Rummy bonus"). Never call one a "variant".

This convention governs prose and UI copy only. **Code identifiers keep their existing names** — `Variant` type, `variant` field, `VariantEngine`, `variantPublic`, `variantFns`, `variantLimits`, etc. — do not rename them. When prose names such an identifier, keep the identifier's spelling; describe the concept around it as a "game variation".

## Setup not covered by the manifests

Package scripts cover install/build/test/typecheck. What they don't tell you:

```sh
# Start server (after build). Required env vars:
#   SESSION_SECRET   ≥32 chars
#   ALLOWED_ORIGINS  comma-separated
# Example (dev):
SESSION_SECRET="dev-secret-32-chars-minimum-here" ALLOWED_ORIGINS="http://localhost:5173" node packages/server/dist/index.js

# Client dev server connects directly to the server on :8080 — no Vite proxy.
# Optional override: VITE_WS_URL=ws://localhost:8080 (that value is the default when the env var is absent)
```

- **Build order:** `pnpm --filter @online-rummy/shared build` must run before `tsc --noEmit` on server or client. Server imports from `@online-rummy/shared` dist, not source; stale or missing dist causes `TS2353` "property does not exist" errors on types that exist in source but not yet compiled output. `vitest` bypasses this via a path alias in each package's `vitest.config.ts`.

## Repo-wide constraints

- `strict: true` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` everywhere. No `any` without a comment.
- All imports within the monorepo use `.js` extensions (NodeNext resolution).
- **Server shuffles with `node:crypto` only — never `Math.random`.**
- All rule citations in code use `// rules.md A.x.y` section IDs.
- Engine errors are thrown as `Error` with `ERR_*` prefixed messages (e.g. `ERR_NOT_YOUR_TURN`, `ERR_WRONG_PHASE`). The WS layer translates these to `{ t: 'error', code, msg }`.

## Docs

Reference material lives in `docs/` — `rules.md` (canonical game rules, with the section IDs used in code comments), `plan.md` (architecture decisions, house rule picks, milestone status), `client-server-protocol.md` (complete WS protocol reference), `branding.md`, `ux-design.md`, `ux-implementation-plan.md`.

## Assets

Source art lives in `assets/` (not served directly); deployed copies in `packages/client/public/`. When regenerating favicons, copy the new files to **both** `assets/favicon/` and `packages/client/public/`, and check the links in `packages/client/index.html`.
