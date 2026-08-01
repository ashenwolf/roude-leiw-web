# Exam track (Sproochentest Prep) — design decisions

**Date:** 2026-07-26 · **Landed on branch:** `claude/themed-lessons-talking-exam-q81jtf`

The exam track prepares for the Sproochentest speaking exam via theme-scoped
SubLessons (themes mirror the Sproochentest/TWAL oral-exam topics from
learnluxembourgish.com). Expected learner level ~B1, but level is deliberately
**not** modeled anywhere — it's an authoring guideline in file comments only.

## Settled decisions (don't re-litigate without new information)

- **Parallel catalog, not a pseudo-level.** `public/assets/exam/manifest.json`
  is theme-first (`themes → subLessons`), a separate schema from the course
  manifest. We explicitly rejected encoding the exam track as a `level: "Exam"`
  entry in the course manifest: it would leak into `loadAllLessons` consumers
  (Word Mix pools, `selectErrorPool`, `collectLessonKeys`/"Learned X/Y") and
  lie about ordering semantics. Course pipelines never see exam content **by
  construction**, not by filtering.
- **No tier/level dimension on themes.** TWAL itself is tiered (A1/A2/B1); we
  are Sproochentest-scoped so themes are a flat list. If depth tiers are ever
  wanted: additive `tier` field on the theme row or separate themes — no
  migration required. Considered and deferred, not forgotten.
- **Manifest id is authoritative; in-file `@lesson` id is a label.** The lexer's
  `LessonId` token (`/[A-Za-z]\d+\.\d+/`) can't express `vacation.01`, and
  relaxing it widens a latent LessonId-vs-Text tie-break ambiguity. So exam
  files use compact ids (`V1.01`) and everything (play-gate, progress keys,
  navigation) keys off the manifest id. The exam integration test deliberately
  does NOT assert in-file id == manifest id (the course one does).
- ~~**Play-gate, not mastery-gate.**~~ **SUPERSEDED 2026-08-01 — the gate is now
  mastery, see [[exam-and-lesson-pass-gate]].** The original decision: a
  SubLesson unlocks the next in its theme once **played to completion**, with
  mastery-gating rejected because shared stat keys can pre-complete a SubLesson
  the user never opened (stats are content-addressed `lu|en`). That objection is
  answered at a 100% gate (each SubLesson's `@sentence` Elements are unique to
  it) and defensively by `passed => unlocked` in `toSubLessonView`.
  What survives unchanged: the manifest id is still pushed through the existing
  `newlyUnlockedLessons` sync channel on a completed Session — no new `UserData`
  field, no validator change (`LESSON_ID_RX` already admits the ids; pinned by a
  validator test), abandoning marks nothing — but it now records the SubLesson
  as *played* (sticky access + content-load / error-pool scope) rather than
  opening the next step. Lesson Mode's course unlock-check still runs on abandon.
- **Themes all open, mutually independent, independent of course progress.**
  The ~B1 audience may skip the A1 course entirely.
- **Exam Mode plans deterministically** (`planExamMode`): every element once,
  words chunked into 5-pair WordMatch slots (trailing <3 merges), one
  SentenceBuilder slot per sentence, slot list shuffled. No stats input, no
  buckets.
- **Modes own coverage/order only; exercise construction is shared** (PR #10
  review). `chunkIntoWordMatchExercises` and the `@question` → en→lu rule
  (`resolveSentenceDirection`, applied inside `buildSentenceExercise`) live in
  Layer 1, so course lessons can use `@question` with identical behaviour and
  future Exercise types reach every Mode. What is deliberately NOT unified:
  Lesson samples from weighted buckets while Exam covers everything once —
  different strategies, same bricks. Merging the planners would mean one
  function with a mode flag, which is what the layering exists to avoid.
- **Fix Errors is GLOBAL; Word Mix and Home stats stay course-scoped.**
  (User decision 2026-07-28, superseding the earlier exam-scoped-Fix-Errors
  plan.) `selectErrorPool` is scope-agnostic — the lessons argument defines
  the scope. Fix Errors call sites (session planner + Home button) pass the
  global scope via `src/exercise/error-scope.ts` (`loadErrorScopeLessons` =
  all course lessons + exam sub-lessons that are played or unlocked; locked
  sub-lessons can't carry stats). Failed exam Q&A phrases are rebuilt with
  their `question` in the failed direction. Word Mix still passes
  course-up-to-cursor only, and `collectLessonKeys` keeps Home's
  "Learned X/Y" course-scoped. Words shared between tracks cross-pollinate
  via the shared stat key — accepted and desirable.

## Implementation notes

- `shuffle()` now takes an optional injectable rng (default `Math.random`) so
  mode planners can be tested deterministically. Still the one shuffle.
- The section-milestone number in `AppExercise` now derives from crossed
  `blockBoundaries` (`session.completedSections`) instead of `slotIndex/5` —
  this also fixed the wrong section label Word Mix had.
- `buildSentenceExercise` drops `question` for lu→en presentations (the LU
  sentence would already be visible).
- Service worker: `/assets/exam/` mirrors the lessons cache rules
  (manifest NetworkFirst, `.letz` StaleWhileRevalidate) in `vite.config.ts`.
- XP: `SESSION_XP.exam = 100`. Streak/duration needed nothing (mode-agnostic).

## Content conventions

- **Every SubLesson mixes `@word` and `@sentence`** (PR #10 review) so a Session
  alternates word-match and sentence-builder slots instead of being all one
  type. The three-step path still sets the emphasis: 01 vocabulary-heavy
  (~40 words + 3 sentences), 02 phrases, 03 Q&A — the latter two carry ~10-12
  supporting words each. Enforced by `tests/integration/exam-manifest-letz.test.ts`.

## Follow-ups (P1/P2)

- **Vocabulary verification via LOD:** the `lod` MCP tools return 403 from the
  remote CI environment (network policy, retried across sessions), so both
  themes were authored from standard textbook vocabulary but are NOT
  dictionary-verified. Re-run `lod_lookup` on the LU sides locally before
  treating the content as final — genders, plurals, and Eifeler-Regel forms
  are the risk areas.
- Theme-completion/readiness stat; audio playback on prompts;
  speaking-prompt Exercise type (self-graded); more themes (work, free time,
  housing, health, past/future, Luxembourg).
