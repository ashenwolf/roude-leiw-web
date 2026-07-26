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
- **Play-gate, not mastery-gate.** A SubLesson unlocks the next in its theme
  once **played to completion**. Persisted by pushing the manifest id through
  the existing `newlyUnlockedLessons` sync channel — no new `UserData` field,
  no validator change (`LESSON_ID_RX` already admits the ids; pinned by a
  validator test). Abandoning marks nothing (gated in
  `AppExercise.flushProgress` on `sessionCompleted`; note Lesson Mode's course
  unlock-check still runs on abandon — that behavior was intentionally kept).
  Mastery-gating was rejected because shared stat keys can pre-complete a
  SubLesson the user never opened (stats are content-addressed `lu|en`).
- **Themes all open, mutually independent, independent of course progress.**
  The ~B1 audience may skip the A1 course entirely.
- **Exam Mode plans deterministically** (`planExamMode`): every element once,
  words chunked into 5-pair WordMatch slots (trailing <3 merges), one
  SentenceBuilder slot per sentence, slot list shuffled. No stats input, no
  buckets. `@question` sentences are forced en→lu.
- **Exam content intentionally does NOT feed course Fix Errors / Word Mix /
  Home stats.** `selectErrorPool` and `collectLessonKeys` take a lessons
  argument and are only ever passed course lessons; exam-exclusive keys are
  orphan-filtered out of Home stats automatically. Words shared between both
  tracks DO cross-pollinate (same stat key) — accepted and desirable. An
  exam-scoped Fix Errors (reusing `selectErrorPool(stats, examLessons)`) is
  the planned P1 follow-up, not a mix-in to the course button.

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

## Follow-ups (P1/P2)

- **Vocabulary verification via LOD:** the `lod` MCP tools returned 403 from
  the remote CI environment, so the two shipped themes (vacation, family) were
  authored from standard textbook vocabulary but NOT dictionary-verified.
  Re-run `lod_lookup` on the LU sides locally before treating the content as
  final.
- Exam-scoped Fix Errors on the theme page; theme-completion/readiness stat;
  audio playback on prompts; speaking-prompt Exercise type (self-graded);
  more themes (work, free time, housing, health, past/future, Luxembourg).
