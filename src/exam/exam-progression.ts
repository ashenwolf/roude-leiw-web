// Pure derivations for the exam track. No React, no I/O.
//
// The play-gate: a sub-lesson unlocks the next one in its theme once it has been
// PLAYED (session completed at least once), not once it is mastered. Played-ness
// is persisted by pushing the sub-lesson id through the existing
// `newlyUnlockedLessons` sync channel into `unlockedLessons` — exam ids and
// course lesson ids coexist inertly in that array (course logic only ever looks
// up course ids). Mastery is still shown as the progress ring via the shared
// computeLessonProgress, but it does not gate anything on this track.

import { computeLessonProgress } from "../exercise/progression";

import type { WordStats } from "../context/auth";
import type { Lesson } from "../exercise/letz-parser";
import type { LessonProgress } from "../exercise/progression";
import type { SubLessonMeta } from "./exam-catalog";

export type SubLessonView = {
  meta: SubLessonMeta;
  /** Playable now: first in its theme, or the previous sub-lesson was played. */
  unlocked: boolean;
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

export const isSubLessonPlayed = (
  id: string,
  persistedUnlocked: ReadonlyArray<string>,
): boolean => persistedUnlocked.includes(id);

const toSubLessonView = (
  meta: SubLessonMeta,
  previous: SubLessonMeta | undefined,
  played: ReadonlySet<string>,
  loaded: Record<string, Lesson>,
  userWords: Record<string, WordStats>,
): SubLessonView => ({
  meta,
  unlocked: previous === undefined || played.has(previous.id),
  played: played.has(meta.id),
  progress: loaded[meta.id] ? computeLessonProgress(loaded[meta.id], userWords) : null,
});

/**
 * Projects the exam catalog + user state into the theme page's view.
 *
 * All themes are open (no theme-level or course-level gating — a deliberate
 * decision, see .claude/memory/exam-track.md); only sub-lessons within a theme
 * gate sequentially on the play-gate.
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
        subLessons: subs.map((meta, i) =>
          toSubLessonView(meta, subs[i - 1], played, loaded, userWords),
        ),
      };
    }),
  };
};

/** Sub-lessons whose content the theme page should fetch: unlocked or played. */
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
