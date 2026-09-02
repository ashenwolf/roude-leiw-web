# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. It is the **lean hub** — task-scoped detail lives in `.claude/reference/*.md` (binding technical detail, loaded on demand) and `.claude/memory/*.md` (design rationale — read `.claude/memory/MEMORY.md` first). Follow the pointers below rather than expecting everything inline. At the end of every development, check if there was anything worth writing to memory (see "Memory" section at the bottom).

## Commands

```bash
npm run dev          # Start Vite dev server (includes local worker + KV emulation)
npm run build        # vitest run && eslint . && tsc -b && vite build
                     # Tests, lint, and typecheck must all pass before bundling.
npm run lint         # ESLint
npm run preview      # Preview production build locally
npm run deploy       # Build and deploy to Cloudflare Pages

npm run generate-audio    -- <path-to-lesson.letz>   # Sproochmaschinn TTS for @lu phrases (needs ffmpeg)
npm run generate-question-audio -- [path]            # Sproochmaschinn TTS for @question prompts (default: all content)
npm run sync-audio:upload -- [path]                  # push local mp3s to R2
npm run sync-audio:download -- [path]                # pull mp3s from R2 (auto-runs in prebuild)
```

Audio files are gitignored. R2 is the source of truth. See [`.claude/memory/audio-pipeline.md`](.claude/memory/audio-pipeline.md).

Tests run with `npx vitest run` (config in `vitest.config.ts`). Tests live under `tests/` mirroring the source tree. Full coverage table and the no-mocks rule: [`.claude/reference/testing.md`](.claude/reference/testing.md).

## What This App Is

**Roude Leiw** is a Luxembourgish language learning SPA. Users match Luxembourgish words to their English translations across levels (A1–C2), build sentences from token tiles, and revisit content they've struggled with. Three exercise Modes from Home: **Lesson** (focused practice within one lesson and its prerequisites), **Word Mix** (broader pair matching across all unlocked words), and **Fix Errors** (drills on the user's struggling Elements).

A separate **Exam track** ("Sproochentest Prep", reachable from Home) prepares for the Luxembourgish citizenship speaking exam. It is theme-scoped (Vacation, Family, … — mirroring the Sproochentest/TWAL oral-exam topics), has no level dimension, and progresses Duolingo-style: each Theme is a short path of SubLessons (vocabulary → phrases → Q&A) unlocked sequentially — a SubLesson opens the next once it is **fully passed**, the same mastery gate the course track uses between lessons. Exam content is a parallel catalog — it never enters Word Mix or Home's stats. **Fix Errors is the one global Mode**: its error pool spans both tracks.

Deployed to Cloudflare Pages with a Cloudflare Worker backend for auth and persistence.

## Tech Stack

- React 19 + TypeScript (strict) + Tailwind CSS 4
- Vite 7 with `@cloudflare/vite-plugin` + Babel React Compiler (automatic memoization)
- Chevrotain 11 for parsing `.letz` lesson files
- Cloudflare Workers (backend API) + KV (persistence + sessions)
- Google OAuth 2.0 for authentication

## Glossary (binding vocabulary)

Canonical terms for the exercise/session system — use these in code, comments, PRs, and conversation.

**Content tier** (static): **Manifest** (catalog index) → **Lesson** (one `.letz` file's parsed content: `{ meta, entries[], sentences[], fills[] }`) → **Word** (`{lu, en}` pair) / **Sentence** (translatable phrase, may carry a `question`) / **Fill** (`@fill` block, bracketed blanks, one blank = one tile verbatim). **Element** = umbrella for Word/Sentence/Fill. **Theme** = exam-track topic; **SubLesson** = one step of a Theme's path (identity is the manifest id, e.g. `vacation.01`; the in-file `@lesson` id is cosmetic).

**Progression tier** (persisted): **Stats** `{shown, correct, incorrect}` per element key. **Cursor** = first unlocked lesson not yet passed (the Session focus). **Frontier** = max unlocked lesson id (bounds a review *pool*, never the focus). **Error pool** = derived struggling elements.

**Runtime tier** (ephemeral, one Session): **Mode** (`lesson | word-mix | fix-errors | exam`) → **Session** (one run) → **Block** (chunk of a Session; Lesson/Fix-Errors = 3 normal + ≤1 correction, Word-Mix = 3) → **Slot** (one unit of work, holds one **Exercise** — `word-match | sentence-builder | fill-blank`) → **Step** (smallest user action; WordMatch = one pair, SentenceBuilder/FillBlank = one submit).

**Retired terms — do not use in new code:** `batch` (→ Slot/Exercise), `madness` (→ word-mix), `mistakes mode` (→ fix-errors), `game` when ambiguous (→ Exercise or Session).

## Project Structure

Top level: `src/{context,page,exam,exercise,persistence,lib,ui}/`, `worker/{handlers,lib}/`, `public/assets/{lessons,exam}/`. **The conventions that decide where a file goes** — the per-directory rules, the four-file shape of an exercise, and the handful of files whose location is load-bearing — are in [`.claude/reference/project-structure.md`](.claude/reference/project-structure.md). Read it before adding a file or navigating an unfamiliar directory; glob for current contents rather than expecting a file list there.

## Architecture

The exercise/session system is a strict 5-layer stack (Mode planners → SessionMachine → Exercises → Selection primitives → Pure derivations), each layer importing only from layers below. **The full binding reference — encapsulation layering, pipeline invariants, every Mode's spec (Lesson/Word Mix/Fix Errors/Exam), the unlock rule, the centralized error pool, the post-Session refresh invariant, and the 3-step recipe for adding a new Exercise type — is in [`.claude/reference/mode-specs.md`](.claude/reference/mode-specs.md). Read it before touching any `src/exercise/modes/*.ts` planner or the SessionMachine.**

The codebase overall is a **producer/consumer pipeline**: pure functions transform named, plain data; React/fetch/KV writes only appear at the edges. **The data-flow diagrams (Data Pipeline, Screen Data Map), the on-pipeline rules, the anti-dogmatism exceptions, the Exercise Session Flow, and the State Machines (SessionStatus, WordMatch SlotState, SentenceGameState) are in [`.claude/reference/data-flow.md`](.claude/reference/data-flow.md).** Read it before adding, renaming, or moving a producer or data shape — and keep it in sync in the same change, since it's the single source of truth for how the pipeline is wired today.

### Authentication

Google OAuth 2.0 via Cloudflare Worker: sign-in → `GET /api/auth/google` → Google → `GET /api/auth/callback` (exchanges code, upserts KV user, creates session) → HttpOnly cookie (7-day TTL) → `GET /api/auth/me` on mount restores state. Guest mode is preserved — the app works without login; auth is additive.

### Data Persistence

Three storage tiers (server KV, client localStorage for guests, client in-memory view), a KV `words` map shared by two key families (plain word keys and `{kind}:{direction}:{firstEn}` keyed-element keys), and a set of core principles (derive-don't-store, deltas-not-snapshots, same-merge-logic-both-sides, single-blob-per-user). **Full binding reference — the KV ER diagram, the key-family disambiguation functions, all 8 core principles, the client read/write pattern, and the checklist for adding new persisted data — is in [`.claude/reference/persistence.md`](.claude/reference/persistence.md). Keep it accurate in the same change whenever you touch a KV key or merge function.** The *why* behind the fire-and-forget sync, focus-refetch, and migration tradeoffs: [`.claude/memory/persistence-and-sync.md`](.claude/memory/persistence-and-sync.md).

### Navigation

Context-based router (`src/context/`). Pages: `"home"` | `"exercise"` | `"word-mix"` | `"fix-errors"` | `"exam"` | `"exam-session"`. Navigate via `navigateTo()` from `useNavigation()`. Word Mix, Fix Errors, and exam-session (with `params.subLessonId`) all render via `<AppExercise />` with a different `SessionMode`; `"exam"` renders the theme page `<AppExam />`. Exam sessions navigate back to `"exam"`, not Home.

### API Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/auth/google` | No | Redirect to Google OAuth |
| GET | `/api/auth/callback` | No | OAuth callback → create session |
| GET | `/api/auth/me` | No | Current user + progress (or null) |
| POST | `/api/auth/logout` | Yes | Clear session |
| POST | `/api/progress/sync` | Yes | Merge word results + daily session |

### Security

**Read [`.claude/reference/security.md`](.claude/reference/security.md) before adding a new endpoint, a new persisted field, or a new external resource.** Covers trust boundaries, the `/api/progress/sync` validation contract and bounds, KV blob caps, cookie rules, the two-layer CSRF defense, the no-PII-in-logs contract, and step-by-step checklists for new endpoints and new external resources. Incident history and the owner-facing hardening plan: [`.claude/security-plan.md`](.claude/security-plan.md).

### Lesson File Format (`.letz`)

Custom DSL parsed by Chevrotain. Course files: `public/assets/lessons/{level}/{filename}.letz`. Exam files: `public/assets/exam/{kind}/{theme}/{file}.letz` — `{kind}` is `topic` or `picture`, mirroring the manifest's `kind` discriminator (in-file `@lesson` id is a cosmetic label there; the manifest id is authoritative).

Directives: `@lesson`, `@word` (→ `entries[]`), `@sentence` + `@lu`/`@en`/`@question`/`@distractor-en`/`@distractor-lu` (→ `sentences[]`, used by `SentenceBuilder`), `@fill` + `@lu`/`@en`/`@distractor-*` with `[bracketed]` blanks (→ `fills[]`, used by `FillBlank`), `@image`/`@image-alt` (lesson-level, quoted values). The parser hard-errors on unknown `@`-tokens — adding a directive means touching `lexer.ts`/`parser.ts`/`visitor.ts` together, and a new directive that's also a new **Element kind** is the wider change flagged in [`.claude/reference/mode-specs.md`](.claude/reference/mode-specs.md).

`@fill` is a **distinct Element kind** from `@sentence` (own stat key `fill:{direction}:{firstEn}`, own error pool) — one blank = one tile verbatim, exactly one `@lu`/`@en` per block, no `@question`, never the same sentence as a `@sentence`. **Exam SubLessons only** — `planLessonMode` schedules no fill Slots, so `@fill` under `public/assets/lessons/` would be unpassable.

**Full syntax, every mechanized bound, and authoring procedure live in the `letz-content-generator` skill** — read `references/letz-format.md` (syntax), `references/content-contract.md` (every bound + failing test, don't read the tests instead), and `references/luxembourgish-grammar.md` (connectors, inversion, homograph traps) before authoring. Design rationale: [fill-in-words-exercise](.claude/memory/fill-in-words-exercise.md), [picture-description-theme](.claude/memory/picture-description-theme.md), [exam-track](.claude/memory/exam-track.md).

### Testing

Tests run with **Vitest** (`npx vitest run`), and the pipeline architecture means most of the app is testable as plain function calls — the no-mocks rule depends on staying on-pattern. **Coverage table by area, what's intentionally NOT tested and why, and the shared fixture conventions (`s()`, `lesson()`, `slot.*()`, `fakeRng()`) are in [`.claude/reference/testing.md`](.claude/reference/testing.md).** Add tests in the same change as any new producer or pure module; if you can't test something without mocking, split it into a pure core + thin wiring first.

### Development

- Try to analyze several ideas and provide options to human to pick from.
- With every implementation check if it can be generalized and reused.

### Icons

Icons live in `src/ui/icons/`, hand-copied SVG paths from **Phosphor Icons** (duotone weight) — zero runtime dependency. To add one: find it at phosphoricons.com, temporarily `npm i @phosphor-icons/react`, copy the duotone paths from `node_modules/@phosphor-icons/react/dist/defs/<Name>.es.js` into `src/ui/icons/<Name>Icon.tsx` (follow an existing icon file's `IconBase` + two-`<path>` pattern), export from `index.ts`, then `npm uninstall @phosphor-icons/react`. `IconBase` uses `viewBox="0 0 256 256"`; size/color via `className`.

### Memory — required reading and writing

Persistent memory lives **in the repo** at `.claude/memory/`, not the home-dir auto-memory (deprecated — a thin redirect, do not write there). **Read `.claude/memory/MEMORY.md` at the start of every session** — it is the index and holds the writing rules (what's worth recording, what isn't) and the code-style rules. Read the specific file whose area you're about to touch before making architectural decisions there. `.claude/reference/*.md` is a separate, sibling store for binding technical detail (exact mechanics, diagrams, checklists) rather than design rationale — see `.claude/reference/README.md` for which goes where.

When you learn something a future session would benefit from — design rationale, a conscious tradeoff, a "we considered X and decided no" — write it to the matching memory file (or a new one) and add a one-line pointer in `MEMORY.md`, in the same commit as the change that motivated it. If instead you change a mechanic, bound, or diagram that a `.claude/reference/*.md` file states, update that file in the same commit — a stale reference doc is worse than a missing one.
