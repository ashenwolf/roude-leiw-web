import { parseLetzContent } from "./letz-parser";

import type { Lesson, WordEntry } from "./letz-parser";

/**
 * Manifest structure that lists all available lessons
 */
export type LessonManifest = {
  levels: {
    id: string; // e.g., "A1", "A2"
    lessons: {
      id: string; // e.g., "01_greetings"
      file: string; // e.g., "01_greetings.letz"
    }[];
  }[];
};

const LESSONS_BASE_PATH = "/assets/lessons";

/**
 * Fetch the lesson manifest
 */
export const fetchManifest = async (): Promise<LessonManifest> => {
  const response = await fetch(`${LESSONS_BASE_PATH}/manifest.json`);
  if (!response.ok) {
    throw new Error(`Failed to fetch manifest: ${response.statusText}`);
  }
  return response.json();
};

/**
 * Fetch and parse a single lesson file
 */
export const fetchLesson = async (level: string, filename: string): Promise<Lesson> => {
  const url = `${LESSONS_BASE_PATH}/${level}/${filename}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch lesson ${url}: ${response.statusText}`);
  }
  const content = await response.text();
  return parseLetzContent(content, `${level}/${filename}`);
};

/**
 * Level ordering for comparison
 */
const LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];

const getLevelIndex = (level: string): number => {
  const index = LEVEL_ORDER.indexOf(level.toUpperCase());
  return index >= 0 ? index : 0;
};

/**
 * Check if a level should be included based on user's current level
 * Returns true if levelToCheck is <= userLevel
 */
const shouldIncludeLevel = (levelToCheck: string, userLevel: string): boolean => {
  return getLevelIndex(levelToCheck) <= getLevelIndex(userLevel);
};

/**
 * Load all lessons up to and including the specified user level
 */
export const loadLessonsForLevel = async (userLevel: string): Promise<Lesson[]> => {
  const manifest = await fetchManifest();

  // Filter levels based on user's current level
  const relevantLevels = manifest.levels.filter((level) => shouldIncludeLevel(level.id, userLevel));

  // Fetch all lessons in parallel
  const lessonPromises = relevantLevels.flatMap((level) =>
    level.lessons.map((lesson) => fetchLesson(level.id, lesson.file))
  );

  const lessons = await Promise.all(lessonPromises);
  return lessons;
};

/**
 * Load lessons and extract all word entries
 */
export const loadWordEntriesForLevel = async (userLevel: string): Promise<WordEntry[]> => {
  const lessons = await loadLessonsForLevel(userLevel);
  return lessons.flatMap((lesson) => lesson.entries);
};

// Module-level cache — all lessons, regardless of level.
// Reset on error so the next call retries the fetch.
let allLessonsCache: Promise<Lesson[]> | null = null;

/**
 * Load all lessons from the manifest (all levels).
 * Result is cached for the lifetime of the page — subsequent calls return the same promise.
 */
export const loadAllLessons = (): Promise<Lesson[]> => {
  if (!allLessonsCache) {
    allLessonsCache = fetchManifest()
      .then((manifest) =>
        Promise.all(
          manifest.levels.flatMap((level) =>
            level.lessons.map((lesson) => fetchLesson(level.id, lesson.file)),
          ),
        ),
      )
      .catch((err) => {
        allLessonsCache = null; // allow retry on next call
        throw err;
      });
  }
  return allLessonsCache;
};

// In dev mode, bust the cache whenever any module is hot-reloaded so stale
// parsed lessons (e.g. pre-@sentence grammar) are never returned after a code change.
if (import.meta.hot) {
  import.meta.hot.accept(() => { allLessonsCache = null; });
}
