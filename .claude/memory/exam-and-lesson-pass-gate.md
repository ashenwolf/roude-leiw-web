# One pass-gate for both tracks (100%) — July 2026

**Date:** 2026-08-01 · **Branch:** `claude/eager-darwin-fy2b1y`

User report: *"The exam preparation behavior is weird: it progresses multiple
stages at once. But it should be gated — once previous passed, next opens. Also,
in normal lesson flow we open next on 80%; we need 100% to open next."*

Two changes, one idea: **a step opens the next step only when it is fully
mastered**, and that rule is now identical on the course track and the exam
track.

## What changed

- `UNLOCK_LESSON_THRESHOLD`: `0.8` → **`1.0`** (`src/exercise/constants.ts`).
  Every Element of a lesson must pass `correct >= MASTERY_CORRECT_COUNT` (3)
  before the next lesson unlocks. `computeLessonProgress(...).isComplete` and
  the Home lesson-card "complete" check inherit this automatically — they always
  read the constant.
- Exam track: **play-gate → pass-gate** (`src/exam/exam-progression.ts`). A
  SubLesson opens the next one in its Theme when its own
  `computeLessonProgress(...).isComplete` is true, not when a Session was
  completed. `SubLessonView` gained `passed`; `SubLessonPath`'s green check now
  means *passed*, not *played*, so a checked node is never followed by a locked
  one.

## Decisions worth keeping

- **The play-marker stayed.** A completed exam Session still pushes its manifest
  id through `newlyUnlockedLessons`. It no longer gates anything; it now means
  "opened" and does two jobs: (a) **sticky access** — an already-played SubLesson
  stays unlocked, so the stricter gate can never take back a step a user already
  had (this is what protects users who progressed under the old play-gate), and
  (b) it defines the content-load and error-pool scope
  (`selectSubLessonsToLoad`, `src/exercise/error-scope.ts`). Removing it would
  have broken both, for no gain. Rejected.
- **`passed` implies `unlocked`.** The 2026-07-26 reason for rejecting a
  mastery-gate was that content-addressed stat keys (`lu|en`) can pre-master a
  SubLesson the user never opened, letting the chain skip a step. Two things
  answer it: at 100% every `@sentence` must also pass, and those are unique per
  SubLesson; and defensively, `toSubLessonView` computes
  `passed = unlocked && progress.isComplete`, so a locked node can never open
  the one after it regardless of shared keys. That supersedes the "Play-gate,
  not mastery-gate" bullet in [[exam-track]].
- **`selectSubLessonsToLoad` still keys on played-ness, not the gate.** Making
  it pass-gate-aware would need `loaded` + `words` and turn the theme page's
  fetch effect into a self-feeding cascade. Not worth it: the loader's job is
  "which files can carry stats" (exactly what the error-pool scope needs, where
  nothing is loaded yet). Sole visible gap: a user who masters a SubLesson while
  abandoning every Session unlocks the next one with no progress ring until its
  first completed Session. Accepted.

## Consequence to watch

100% is a hard gate on **content size**. A1.02 is ~197 Elements — every one of
them now needs `correct >= 3` before A1.03 opens (see [[lesson-content-sizing]],
which already flagged splitting oversized lessons as the biggest lever; this
change raises its priority from "feels slow" to "blocks progression"). The
[[not-yet-mastered-bucket]] bias (30% of picks, keyed on `correct`, pool shrinks
as elements pass) is what makes the last stragglers reachable at all — do not
weaken it without re-checking that every Element can still be drawn.

On the exam track the same gate is much cheaper: a SubLesson is ~13–43 Elements
and `planExamMode` covers every Element exactly once per Session, so ~3 clean
Sessions pass it.
