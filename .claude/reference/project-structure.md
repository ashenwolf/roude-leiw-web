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
| `zed-letz/` | Zed dev extension: `.letz` highlighting via a Tree-sitter grammar pinned to a commit — regenerate + re-pin per its README |
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

## The design system is `src/ui/` — use it or extend it

**No feature code writes a raw `<button>` or hand-rolls a control's classes.** If the
system cannot express what you need, *extend the system* in the same change and use
the new component — do not inline "just this once". An inlined control is invisible
to every later change: the four hand-written "Back" links drifted into two sizes and
two different arrow conventions before anyone noticed, and the audio button's
36px touch target was duplicated as three separate `w-9 h-9` literals that had to
stay in sync by luck.

The surface, and what each is *for* (the distinction is the point — picking by
appearance is how a system rots):

| Component | For |
|---|---|
| `Button` | the primary action — full-width label pill carrying a `UiColor` |
| `ButtonText` | a quiet text control that must not compete with it (`Back`) |
| `IconButton` / `IconButtonSpacer` | an icon-only secondary control; the spacer reserves its exact width so centred text does not shift when the control appears |
| `Pill` | a word tile, standalone (`sm`/`md`/`lg`) or inline in running text (`inline`) |
| `PillGap` | the *empty* counterpart of an inline `Pill` — a gap in a sentence, rendered as an underline |
| `PillTile` | one tile in a pool: tappable, or spent and holding its space |

`PillGap` and `Pill` must keep identical geometry — they alternate in the same
position as a `@fill` blank is filled, and a mismatch moves the sentence under the
learner's finger. That is why the gap lives in `src/ui/` beside the pill rather
than in the exercise that uses it.

Colour and size live in the lookup maps at the top of each component
(`UiColorMap`, `PillStatusColors`, `*SizeMap`). Add a key there; never pass a
Tailwind colour in from a call site.

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
| `src/exercise/answer-text.ts` | the ONE definition of "same text" — tile identity, answer grading, and `@fill`/`@sentence` disjointness all compare through `normalizeAnswer`. Layer 1, so both mechanics and the builders can reach it downward; it previously lived inside `SentenceBuilder/` and was imported sideways |
| `src/exercise/mode-config.ts` | the Layer-3 contract plus `modeConfig()` — every planner assembles its result there, so a new field lands once per Mode |
| `src/ui/index.ts` | the design system's public surface — a component not exported here is not part of it |
| `src/exercise/ExerciseLayout.tsx` | encodes the constant-height rule (nothing may grow on tap) |
| `src/exercise/ExercisePrompt.tsx` | the ONE prompt header (question + prompt + audio) both SentenceBuilder and FillBlank render |
| `public/_headers` | CSP/HSTS; extend it when adding an external origin ([security.md](security.md)) |
