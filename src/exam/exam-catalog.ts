// Exam-track catalog — parallel to the course catalog (src/exercise/lesson-loader.ts),
// deliberately separate so course pipelines (Word Mix, Fix Errors, Home stats) never
// see exam content. Theme-first, no level dimension: themes correspond to
// Sproochentest oral-exam topics; sub-lesson order within a theme is manifest order.
// See .claude/memory/exam-track.md.

import { fetchLetzFile } from "../exercise/lesson-loader";

import type { Lesson } from "../exercise/letz-parser";

/**
 * What kind of exam task a theme drills. This is the authoritative discriminator
 * for the two content contracts — `topic` themes require `@question` with
 * first-person answers, `picture` themes forbid both `@question` and personal
 * attitude and require `@image-alt` (see .claude/memory/picture-description-theme.md).
 *
 * It replaces the old `id === "picture"` string check, which only worked while
 * there was exactly one picture theme. Each picture gets its own theme now
 * ("Schueberfouer", "Christmas Market", …), so the id can no longer carry it.
 */
export type ThemeKind = "topic" | "picture";

/** Section heading prefix per kind — the one place this copy lives. */
export const THEME_KIND_PREFIX: Record<ThemeKind, string> = {
  topic: "Theme",
  picture: "Describing a Picture",
};

/** `"Theme: Vacation & Travel"` / `"Describing a Picture: Schueberfouer"`. */
export const themeHeading = (kind: ThemeKind, title: string): string =>
  `${THEME_KIND_PREFIX[kind]}: ${title}`;

/**
 * Manifest structure for the exam track. The manifest id (e.g. "vacation.01")
 * is the authoritative sub-lesson identity — used for the play-gate persisted
 * in `unlockedLessons` — while the in-file `@lesson` id is only a label.
 */
export type ExamManifest = {
  themes: {
    id: string;    // e.g. "vacation"
    kind: ThemeKind;
    title: string; // e.g. "Vacation & Travel" — bare, no prefix (see themeHeading)
    subLessons: {
      id: string;    // e.g. "vacation.01" — must satisfy the sync validator's LESSON_ID_RX
      file: string;  // path relative to the exam base, e.g. "vacation/01_vocabulary.letz"
      title: string; // e.g. "Vocabulary"
    }[];
  }[];
};

/** Light catalog row — loaded from the exam manifest alone (no .letz fetch). */
export type SubLessonMeta = {
  id: string;
  themeId: string;
  themeKind: ThemeKind;
  themeTitle: string;
  title: string;
  file: string;
};

const EXAM_BASE_PATH = "/assets/exam";

/** Pure: manifest → flat SubLessonMeta list in manifest order. */
export const flattenExamManifest = (manifest: ExamManifest): SubLessonMeta[] =>
  manifest.themes.flatMap((theme) =>
    theme.subLessons.map((sub) => ({
      id: sub.id,
      themeId: theme.id,
      themeKind: theme.kind,
      themeTitle: theme.title,
      title: sub.title,
      file: sub.file,
    })),
  );

export const fetchExamManifest = async (): Promise<ExamManifest> => {
  const response = await fetch(`${EXAM_BASE_PATH}/manifest.json`);
  if (!response.ok) {
    throw new Error(`Failed to fetch exam manifest: ${response.statusText}`);
  }
  return response.json();
};

/**
 * Load only the exam manifest — O(1) fetch, no .letz content.
 * Powers the theme page's first paint and sub-lesson id → file resolution.
 */
export const loadExamMeta = (): Promise<SubLessonMeta[]> =>
  fetchExamManifest().then(flattenExamManifest);

// Per-sub-lesson cache — exam sessions load one file at a time, so caching by id
// (rather than one all-lessons promise) avoids refetching across sessions while
// keeping unplayed themes unfetched. Reset per entry on error to allow retry.
const subLessonCache = new Map<string, Promise<Lesson>>();

/** Fetch and parse one sub-lesson's .letz content (cached per id). */
export const fetchSubLesson = (meta: SubLessonMeta): Promise<Lesson> => {
  const cached = subLessonCache.get(meta.id);
  if (cached) return cached;
  const loading = fetchLetzFile(`${EXAM_BASE_PATH}/${meta.file}`, meta.id).catch((err) => {
    subLessonCache.delete(meta.id);
    throw err;
  });
  subLessonCache.set(meta.id, loading);
  return loading;
};

// Dev: bust caches on hot reload so stale parses are never served after a code change.
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    subLessonCache.clear();
  });
}
