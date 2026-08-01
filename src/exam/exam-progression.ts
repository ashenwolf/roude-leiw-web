// Pure derivations for the exam track. No React, no I/O.
//
// The pass-gate: a sub-lesson unlocks the next one in its theme once it is
// PASSED — every one of its Elements mastered, i.e. the same
// `computeLessonProgress(...).isComplete` gate the course track uses between
// lessons. Completing a session no longer opens the next step by itself.
//
// Completing a session still records the sub-lesson as PLAYED, by pushing its
// manifest id through the existing `newlyUnlockedLessons` sync channel into
// `unlockedLessons` — exam ids and course lesson ids coexist inertly in that
// array (course logic only ever looks up course ids). Played-ness now serves two
// narrower jobs: it keeps an already-opened sub-lesson unlocked (sticky, so the
// stricter gate can never take back access the user already had), and it tells
// the theme page / error-pool scope which sub-lessons can carry stats.

import { computeLessonProgress } from "../exercise/progression";

import type { WordStats } from "../context/auth";
import type { Lesson } from "../exercise/letz-parser";
import type { LessonProgress } from "../exercise/progression";
import type { SubLessonMeta } from "./exam-catalog";

export type SubLessonView = {
  meta: SubLessonMeta;
  /** Playable now: first in its theme, already played, or the previous one passed. */
  unlocked: boolean;
  /** Fully mastered — the gate that opens the next sub-lesson in the theme. */
  passed: boolean;
  /** Completed at least once (id present in the persisted unlockedLessons set). */
  played: boolean;
  /** Mastery ring — null while the sub-lesson's content is not loaded. */
  progress: LessonProgress | null;
};

export type ThemeView = {
  id: string;
  title: string;
  subLessons: SubLessonView[];
};

/** Everything AppExam needs to render. Themes appear in manifest order. */
export type ExamView = {
  themes: ThemeView[];
};

// `previous` is the already-projected view of the preceding sub-lesson in the
// same theme, so the gate reads its `passed` flag rather than recomputing it.
// `passed` requires `unlocked`, so the chain advances exactly one step at a
// time: a locked sub-lesson can never open the one after it, even if shared
// stat keys happened to master its content before the user got there.
const toSubLessonView = (
  meta: SubLessonMeta,
  previous: SubLessonView | undefined,
  played: ReadonlySet<string>,
  loaded: Record<string, Lesson>,
  userWords: Record<string, WordStats>,
): SubLessonView => {
  const progress = loaded[meta.id] ? computeLessonProgress(loaded[meta.id], userWords) : null;
  const unlocked = previous === undefined || previous.passed || played.has(meta.id);
  return {
    meta,
    unlocked,
    passed: unlocked && (progress?.isComplete ?? false),
    played: played.has(meta.id),
    progress,
  };
};

/**
 * Projects the exam catalog + user state into the theme page's view.
 *
 * All themes are open (no theme-level or course-level gating — a deliberate
 * decision, see .claude/memory/exam-track.md); only sub-lessons within a theme
 * gate sequentially on the pass-gate.
 */
export const computeExamView = (
  metas: SubLessonMeta[],
  loaded: Record<string, Lesson>,
  userWords: Record<string, WordStats>,
  persistedUnlocked: ReadonlyArray<string>,
): ExamView => {
  const played = new Set(persistedUnlocked);
  const themeOrder = [...new Set(metas.map((m) => m.themeId))];

  return {
    themes: themeOrder.map((themeId) => {
      const subs = metas.filter((m) => m.themeId === themeId);
      return {
        id: themeId,
        title: subs[0].themeTitle,
        // Fold, not map: each view's unlock reads the previous view's `passed`.
        subLessons: subs.reduce<SubLessonView[]>(
          (acc, meta) => [
            ...acc,
            toSubLessonView(meta, acc[acc.length - 1], played, loaded, userWords),
          ],
          [],
        ),
      };
    }),
  };
};

/**
 * Sub-lessons whose content the theme page should fetch: every played one, plus
 * the step right after it (the next node, so its ring is ready the moment the
 * pass-gate opens it) and the first of each theme.
 *
 * Deliberately keyed on played-ness, not on the pass-gate: this is the set that
 * can carry stats, which is also exactly what the global error-pool scope needs
 * (`src/exercise/error-scope.ts`, where nothing is loaded yet). A user who passes
 * a sub-lesson without ever finishing a session unlocks the next one anyway —
 * it simply has no ring until its first completed session.
 */
export const selectSubLessonsToLoad = (
  metas: SubLessonMeta[],
  persistedUnlocked: ReadonlyArray<string>,
): SubLessonMeta[] => {
  const played = new Set(persistedUnlocked);
  return metas.filter((meta, i) => {
    const previous = metas[i - 1];
    const sameTheme = previous?.themeId === meta.themeId;
    return played.has(meta.id) || !sameTheme || played.has(previous.id);
  });
};
