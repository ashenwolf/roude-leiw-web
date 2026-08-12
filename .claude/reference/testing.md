# Testing — binding reference

Tests run with **Vitest** (`npx vitest run`). The pipeline architecture means most of the app is testable as plain function calls — **the no-mocks rule below depends on staying on-pattern**. If you find yourself reaching for mocks, that's a signal the code under test should be split into a pure core + thin wiring.

## What's covered

Run `npx vitest run` for the current count — per-module counts are deliberately not listed here, because they drift on every commit.

| Area | Modules | What the tests pin down |
|---|---|---|
| Exercise logic | `WordMatch/game-logic`, `SentenceBuilder/sentence-logic`, `FillBlank/fill-logic` | selection/match accounting, the one-way `checkResult` lock, all-or-nothing fill grading, duplicate-text tiles |
| Progression | `progression`, `error-pool`, `exam-progression` | classify vs mastery split, per-kind progress, the `isWordKey` inflation guard, primary/fallback pools per kind and direction, the pass-gate chain |
| Planning | `selection`, `exercise-builders`, `modes/*` | bucket boundaries and re-roll, both sentence directions, `@question` direction override, chunk merge edges, per-mode Session shape, failed-direction rebuilds |
| Session | `session-reducer`, `session-progress` | every action × every state, boundary-based section detection, overflow |
| Parser | `lib/letz-parser`, `lesson-image`, `exam-catalog` | grammar and every directive, image view fallback, manifest flattening order |
| Persistence | `worker/lib/{user,session,validators}`, `persistence/migration`, `auth-stats-delta` | merge arithmetic and caps, legacy shape normalization, every validator bound and key shape, chunk splitting with exact total reconstruction, client/server merge byte-identity |
| Authored content | `tests/integration/*` | every `.letz` parses; theme contracts keyed on `kind`; duplicate `@word` per theme; every mechanized `@fill` bound; image budget |

One environment quirk: `guest-progress.jsdom.test.tsx` patches Node 22's experimental `localStorage` in-file via `Object.defineProperty`.

## No-mocks rule

Tests should call pure functions with hand-built fixtures. Do not introduce `vi.mock()`, `vi.spyOn()`, fake fetch, fake KV, or React Testing Library unless a future change genuinely requires it. The existing tests achieve full coverage of business logic via plain function calls — replicate that style.

## What is intentionally NOT tested

- **Hooks (`use-game.ts`, `useExerciseSession`, `useProgress`, `useGuestProgress`)** — wiring only. Their bug surface is dependency arrays, ref lifecycles, and effect ordering, which are caught by the build + manual smoke test more cheaply than by `@testing-library/react` setups.
- **Worker handlers (`worker/handlers/*.ts`)** — thin routing over already-tested `worker/lib/*` transforms. Adding handler tests would require KV mocks for marginal coverage.
- **UI components (`src/ui/*`, `src/page/*`, `<WordMatch>`)** — render functions. Visual correctness lives in browser smoke tests, not unit tests.

**When adding a new producer or pure module, add tests in the same change.** If you can't write a test without mocking something, the code isn't on-pattern — fix the code, not the test.

## Test fixture conventions

- `s(shown, correct, incorrect)` for `WordStats` (see `progression.test.ts`, `error-pool.test.ts`)
- `lesson(id, words, sentences?)` for `Lesson` (see `progression.test.ts`, `modes/lesson.test.ts`)
- `slot.{active|selected|fail|fading|empty}(...)` for `SlotState` (see `game-logic.test.ts`)
- `fakeRng(...values)` for deterministic RNG in mode planner tests (see `selection.test.ts`)

Reuse these helpers; don't re-invent fixture shapes.
