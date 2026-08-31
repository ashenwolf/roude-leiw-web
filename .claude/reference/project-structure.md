# Project structure — where things live and why

**This is not an inventory.** It states the *conventions* that decide where a file goes, plus the
handful of files whose location is load-bearing. Glob or `ls` for the current contents — a list of
every file would be stale within a commit, and a stale reference doc is worse than a missing one.

Update this file when a **rule** changes (a new top-level directory, a new naming convention, a
new layering constraint), not when a file is added under an existing rule.

## Top level

| Path | Holds |
|---|---|
| `src/` | the SPA — see the directory table below |
| `worker/` | Cloudflare Worker: auth + persistence API |
| `tests/` | mirrors `src/`/`worker/` paths, plus `tests/integration/` for authored content |
| `public/assets/` | the content catalogs (`lessons/` course, `exam/` Sproochentest) + `_headers` |
| `scripts/` | plain-ESM Node utilities (content audit, audio generation/sync) — no build step |
| `tools/lod-mcp/` | zero-dep MCP server over lod.lu, registered in `.mcp.json` |
| `vscode-letz/` | unpublished VS Code extension: `.letz` syntax highlighting |
| `CLAUDE.md` · `AGENTS.md` · `.claude/` | agent guidance (hub, redirect, reference + memory + skills) |

## `src/` — one directory per role in the pipeline

Ordered bottom-up. **Imports go downward only**; a module never imports from a row above it.

| Directory | Role | Rule for what belongs |
|---|---|---|
| `lib/` | generic utilities, no app concepts | must be explainable without the word "lesson" |
| `exercise/` | the session engine — planners, SessionMachine, exercises, selection, pure derivations | the 5-layer stack; see [mode-specs.md](mode-specs.md) |
| `exam/` | the exam catalog + its pure progression | parallel to the course catalog, never merged into it |
| `persistence/` | server sync + guest storage | the only place that writes progress |
| `context/` | app-wide React state (auth, navigation) | provider + types + hook, one concept per trio |
| `page/` | top-level screens | composition and data wiring, no game logic |
| `ui/` | reusable presentation | no imports from `exercise/` internals |

Cross-cutting conventions inside `src/`:

- **Entry points stay thin.** `main.tsx` and `worker/index.ts` are wiring only.
- **A game is four files.** Each exercise type is its own directory under `exercise/` with the
  same split: `index.tsx` (UI) · `use-*-game.ts` (wiring) · `*-logic.ts` (pure) · `types.ts`.
  The pure file is what tests call; the hook is deliberately untested.
- **Pure vs wiring is a file boundary, not a comment.** If something needs a mock to test, split
  it instead — that split is what keeps the no-mocks rule affordable
  ([testing.md](testing.md)).
- **Context trio**: `<Name>Context.tsx` (provider) + `<name>.ts` (types) + `use<Name>.ts` (hook).
- **Icons** are hand-copied Phosphor duotone paths in `ui/icons/`, each wrapping the shared
  `IconBase` — zero runtime dependency. Recipe in `CLAUDE.md` § Icons.
- **Barrel exports** only where they already exist (`ui/index.ts`, `ui/icons/index.ts`).

## `worker/` — router, handlers, lib

`index.ts` wires the table-driven `router.ts`; `handlers/` are thin and hold no logic worth
testing; every transform that *is* worth testing lives in `lib/` as a pure function. `lib/oauth/`
is per-provider. Shared types sit in `worker/types.ts`.

## `public/assets/` — the two catalogs

```
lessons/manifest.json     course index: levels → sections → lessons
lessons/<level>/<section>/*.letz
exam/manifest.json        exam index: themes → subLessons, each theme `kind: topic | picture`
exam/topic/<theme>/*.letz     01_vocabulary, 02_phrases, 03_questions
exam/picture/<theme>/*.letz   01_general, 02_people, 03_weather  (+ img/*.webp)
exam/picture/<theme>/img/     optimized photo: 16:9, ≤880px
tmp/                      gitignored image staging — never commit, never delete
```

A manifest id is authoritative for progression; the in-file `@lesson` id is cosmetic on the exam
track. Audio lives under `lessons/**/audio/`, gitignored, with R2 as the source of truth
([audio-pipeline.md](../memory/audio-pipeline.md)).

## Files whose location is load-bearing

These are the ones worth naming, because moving or bypassing them breaks something non-obvious.

| File | Why it matters |
|---|---|
| `src/exercise/constants.ts` | every mode/slot/threshold number; no magic numbers below it |
| `src/lib/letz-parser/` | Chevrotain lives here and must **never** be statically imported from Home's eager tree — `parseLetzContent` is `async` because that dynamic import *is* the chunk split ([frontend-decisions.md](../memory/frontend-decisions.md)) |
| `src/exercise/letz-parser.ts` | the type-only facade that lets consumers avoid the above |
| `worker/lib/validators.ts` | must admit every stat-key prefix; a missing one rejects the whole sync batch ([persistence.md](persistence.md)) |
| `src/lib/stats-merge.ts` + `worker/lib/user.ts` | client and server merges must stay byte-identical; a test enforces it |
| `src/lib/streak.ts` | the one module imported by both client and worker |
| `src/ui/PinnedBottomBar.tsx` | encodes the `<main>`-has-no-bottom-padding contract |
| `src/exercise/ExerciseLayout.tsx` | encodes the constant-height rule (nothing may grow on tap) |
| `public/_headers` | CSP/HSTS; extend it when adding an external origin ([security.md](security.md)) |
