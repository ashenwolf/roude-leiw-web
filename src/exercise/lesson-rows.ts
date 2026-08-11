import {
  computeLessonProgress,
  computeUnlockedLessonIds,
  findCurrentLessonId,
} from "./progression";

import type { WordStats } from "../context/auth";
import type { Lesson } from "./letz-parser";
import type { LessonProgress } from "./progression";

/** Everything AppHome (and any other lesson-list consumer) needs to render. */
export type HomeLessonsView = {
  progressMap: Record<string, LessonProgress>;
  unlockedIds: ReadonlyArray<string>;
  currentLessonId: string;
  /** Vocabulary words across loaded lessons. */
  totalWords: number;
  /** Sentences across loaded lessons (one per @sentence block, direction-agnostic). */
  totalSentences: number;
  /** Fill-in-words items across loaded lessons (one per @fill block, direction-agnostic). */
  totalFills: number;
  /** totalWords + totalSentences + totalFills — the denominator for "Learned X/Y". */
  totalElements: number;
};

const EMPTY_VIEW: HomeLessonsView = {
  progressMap: {},
  unlockedIds: [],
  currentLessonId: "",
  totalWords: 0,
  totalSentences: 0,
  totalFills: 0,
  totalElements: 0,
};

export const projectHomeLessonsView = (
  lessons: Lesson[],
  userWords: Record<string, WordStats>,
  persistedUnlocked: ReadonlyArray<string> = [],
): HomeLessonsView => {
  if (lessons.length === 0) return EMPTY_VIEW;

  return {
    progressMap: Object.fromEntries(
      lessons.map((lesson) => [lesson.meta.id, computeLessonProgress(lesson, userWords)]),
    ),
    unlockedIds: computeUnlockedLessonIds(lessons, userWords, persistedUnlocked),
    currentLessonId: findCurrentLessonId(lessons, userWords, persistedUnlocked),
    totalWords: lessons.reduce((sum, l) => sum + l.entries.length, 0),
    totalSentences: lessons.reduce((sum, l) => sum + l.sentences.length, 0),
    totalFills: lessons.reduce((sum, l) => sum + l.fills.length, 0),
    totalElements: lessons.reduce(
      (sum, l) => sum + l.entries.length + l.sentences.length + l.fills.length,
      0,
    ),
  };
};
