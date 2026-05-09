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
  totalWords: number;
};

const EMPTY_VIEW: HomeLessonsView = {
  progressMap: {},
  unlockedIds: [],
  currentLessonId: "",
  totalWords: 0,
};

export const projectHomeLessonsView = (
  lessons: Lesson[],
  userWords: Record<string, WordStats>,
): HomeLessonsView => {
  if (lessons.length === 0) return EMPTY_VIEW;

  return {
    progressMap: Object.fromEntries(
      lessons.map((lesson) => [lesson.meta.id, computeLessonProgress(lesson, userWords)]),
    ),
    unlockedIds: computeUnlockedLessonIds(lessons, userWords),
    currentLessonId: findCurrentLessonId(lessons, userWords),
    totalWords: lessons.reduce((sum, l) => sum + l.entries.length, 0),
  };
};
