// Edge loaders for the GLOBAL error-pool scope.
//
// Fix Errors drills struggling Elements across BOTH tracks: every course
// lesson plus the exam sub-lessons the user can have stats on (played or
// currently unlocked — a locked sub-lesson has never been shown, so it cannot
// carry errors). The pure pool rule stays in error-pool.ts; this module only
// decides which lessons are in scope and fetches them.

import { loadExamMeta, fetchSubLesson } from "../exam/exam-catalog";
import { selectSubLessonsToLoad } from "../exam/exam-progression";
import { loadAllLessons } from "./lesson-loader";

import type { Lesson } from "./letz-parser";

/**
 * Exam-track lessons in error-pool scope. Resolves to [] when the exam
 * catalog is unreachable so Fix Errors degrades to course-only rather
 * than failing the session.
 */
export const loadExamErrorLessons = (
  persistedUnlocked: ReadonlyArray<string>,
): Promise<Lesson[]> =>
  loadExamMeta()
    .then((metas) => Promise.all(selectSubLessonsToLoad(metas, persistedUnlocked).map(fetchSubLesson)))
    .catch(() => []);

/** Full global scope: all course lessons + in-scope exam sub-lessons. */
export const loadErrorScopeLessons = (
  persistedUnlocked: ReadonlyArray<string>,
): Promise<Lesson[]> =>
  Promise.all([loadAllLessons(), loadExamErrorLessons(persistedUnlocked)])
    .then(([course, exam]) => [...course, ...exam]);
