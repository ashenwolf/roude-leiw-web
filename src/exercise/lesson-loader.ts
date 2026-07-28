import { parseLetzContent } from "./letz-parser";

import type { Lesson } from "./letz-parser";

/** Light catalog row — loaded from the manifest alone (no .letz fetch required). */
export type LessonMeta = {
  id: string;           // e.g., "A1.01"
  level: string;        // e.g., "A1"
  sectionId: string;    // e.g., "A1.1"
  sectionTitle: string; // e.g., "Basics"
  title: string;        // e.g., "Greetings"
  file: string;         // path relative to the level folder, e.g. "A1.1/A1_01_greetings.letz"
};

/**
 * Manifest structure that lists all available lessons.
 *
 * `title` is the user-facing lesson title from the `.letz` `@lesson` directive,
 * duplicated into the manifest so Home can render lesson cards without fetching
 * any `.letz` content (see CLAUDE.md > Architecture Reference > Migration note).
 *
 * Sections group lessons within a level (e.g. "A1.1 — Basics"); Home renders one
 * lesson grid per section. Lesson IDs remain flat within their level for
 * lexicographic ordering by unlock logic.
 */
export type LessonManifest = {
  levels: {
    id: string; // e.g., "A1", "A2"
    sections: {
      id: string;    // e.g., "A1.1"
      title: string; // e.g., "Basics"
      lessons: {
        id: string;    // e.g., "A1.01"
        file: string;  // path relative to the level folder
        title: string; // e.g., "Greetings"
      }[];
    }[];
  }[];
};

// All LessonMeta-producing flatteners go through this single helper so they
// stay in sync if the manifest schema evolves again.
const flattenManifest = (manifest: LessonManifest): LessonMeta[] =>
  manifest.levels.flatMap((level) =>
    level.sections.flatMap((section) =>
      section.lessons.map((lesson) => ({
        id: lesson.id,
        level: level.id,
        sectionId: section.id,
        sectionTitle: section.title,
        title: lesson.title,
        file: lesson.file,
      })),
    ),
  );

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
 * Load only the manifest — O(1) fetch, no .letz content.
 * Returns a flat list of LessonMeta sorted in manifest order (lexicographic by level+id).
 * Use this to render lesson card titles and the lesson grid without waiting for content.
 */
export const loadLessonMeta = (): Promise<LessonMeta[]> =>
  fetchManifest().then(flattenManifest);

/**
 * Sequentially loads .letz files starting from the first lesson, stopping when
 * `shouldContinue(justLoaded)` returns false (i.e., the next lesson would be locked).
 * Caller provides the unlock predicate so this function stays free of progression logic.
 *
 * Example:
 *   loadLessonsUpToCursor(metas, lesson =>
 *     computeLessonProgress(lesson, userWords).percentage >= MASTERY.unlockThreshold
 *   )
 */
export const loadLessonsUpToCursor = async (
  metas: LessonMeta[],
  shouldContinue: (justLoaded: Lesson) => boolean,
): Promise<Lesson[]> => {
  const loaded: Lesson[] = [];
  for (const meta of metas) {
    const lesson = await fetchLesson(meta.level, meta.file);
    loaded.push(lesson);
    const hasMore = loaded.length < metas.length;
    if (!hasMore || !shouldContinue(lesson)) break;
  }
  return loaded;
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
  return await parseLetzContent(content, `${level}/${filename}`);
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
            level.sections.flatMap((section) =>
              section.lessons.map((lesson) => fetchLesson(level.id, lesson.file)),
            ),
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
