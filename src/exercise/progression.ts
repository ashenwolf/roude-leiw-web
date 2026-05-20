import {
  MIN_ANSWERS,
  UNLOCK_ELEMENT_THRESHOLD,
  UNLOCK_LESSON_THRESHOLD,
} from "./constants";

import type { Lesson } from "./letz-parser";
import type { WordStats } from "../context/auth";

// --- Mastery Thresholds (UI classification — separate from unlock rule) ---

export const MASTERY = {
  correctToMaster: 3,
  strugglingMaxAccuracy: 0.6,
  strugglingMinShown: 3,
  /** @deprecated Use UNLOCK_LESSON_THRESHOLD from constants.ts for the unlock check. */
  unlockThreshold: UNLOCK_LESSON_THRESHOLD,
} as const;

// --- Word Classification ---

export type WordMastery = "unseen" | "learning" | "struggling" | "mastered";

const accuracy = (s: WordStats): number =>
  s.correct + s.incorrect > 0 ? s.correct / (s.correct + s.incorrect) : 0;

export const classifyWord = (stats: WordStats | undefined): WordMastery => {
  if (!stats || stats.shown === 0) return "unseen";
  if (stats.correct >= MASTERY.correctToMaster) return "mastered";
  if (stats.shown >= MASTERY.strugglingMinShown && accuracy(stats) < MASTERY.strugglingMaxAccuracy) return "struggling";
  return "learning";
};

export const wordKey = (lu: string, en: string): string => `${lu}|${en}`;

export const phraseKey = (direction: "en-lu" | "lu-en", firstEn: string): string =>
  `phrase:${direction}:${firstEn}`;

export const isPhraseKey = (key: string): boolean => key.startsWith("phrase:");
export const isWordKey = (key: string): boolean => !isPhraseKey(key);

/**
 * All stat-keys defined by the given lessons (both word and phrase forms).
 * Use as the `validKeys` argument to overall-stat producers so that elements
 * deleted from `.letz` files don't keep contributing orphan data.
 *
 * Both phrase directions (`phrase:en-lu:...` and `phrase:lu-en:...`) are
 * included even though only the en-lu direction gates lesson unlock — both
 * directions are still real elements the user can encounter and earn XP on.
 */
export const collectLessonKeys = (lessons: Lesson[]): Set<string> =>
  new Set(
    lessons.flatMap((lesson) => [
      ...lesson.entries.map((e) => wordKey(e.lu, e.en)),
      ...lesson.sentences.flatMap((s) =>
        s.enVariants.length > 0
          ? [phraseKey("en-lu", s.enVariants[0]), phraseKey("lu-en", s.enVariants[0])]
          : [],
      ),
    ]),
  );

// --- Lesson Progress ---

export type LessonProgress = {
  total: number;
  /** Elements that pass the unlock check (shown >= MIN_ANSWERS AND correct/shown >= 0.8). */
  mastered: number;
  percentage: number;
  /** True when percentage >= UNLOCK_LESSON_THRESHOLD (80% of elements pass). */
  isComplete: boolean;
};

/** An element passes the unlock check iff it has been shown enough times with
 *  sufficient accuracy. This is the single source of truth for lesson progression. */
const isElementPassing = (stats: WordStats | undefined): boolean =>
  stats !== undefined &&
  stats.shown >= MIN_ANSWERS &&
  stats.correct / stats.shown >= UNLOCK_ELEMENT_THRESHOLD;

export const computeLessonProgress = (
  lesson: Lesson,
  userWords: Record<string, WordStats>,
): LessonProgress => {
  const wordTotal = lesson.entries.length;
  const wordPassing = lesson.entries.filter(
    (e) => isElementPassing(userWords[wordKey(e.lu, e.en)]),
  ).length;

  // Only EN→LU direction gates lesson progression for sentences
  const sentenceTotal = lesson.sentences.length;
  const sentencePassing = lesson.sentences.filter(
    (s) => s.enVariants.length > 0 && isElementPassing(userWords[phraseKey("en-lu", s.enVariants[0])]),
  ).length;

  const total = wordTotal + sentenceTotal;
  const mastered = wordPassing + sentencePassing;
  const percentage = total > 0 ? mastered / total : 0;
  return { total, mastered, percentage, isComplete: total > 0 && percentage >= UNLOCK_LESSON_THRESHOLD };
};

// --- Lesson Unlock ---

/**
 * Lessons the user can access right now.
 *
 * The set is the union of:
 *   - the first lesson (always unlocked);
 *   - every lesson whose previous lesson currently passes the unlock threshold;
 *   - every lesson in `persistedUnlocked` (sticky — once unlocked, always
 *     unlocked, even if the predecessor's `correct/shown` later drifts below
 *     threshold).
 *
 * The persisted set is the load-bearing part of stickiness: stats are
 * append-only but the ratio `correct/shown` is not monotonic, so without a
 * separate store the unlock set could shrink between renders.
 */
export const computeUnlockedLessonIds = (
  lessons: Lesson[],
  userWords: Record<string, WordStats>,
  persistedUnlocked: ReadonlyArray<string> = [],
): ReadonlyArray<string> => {
  const persisted = new Set(persistedUnlocked);
  return lessons.reduce<string[]>(
    (unlocked, lesson, idx) => {
      if (idx === 0) return [lesson.meta.id];
      if (persisted.has(lesson.meta.id)) return [...unlocked, lesson.meta.id];
      const prevProgress = computeLessonProgress(lessons[idx - 1], userWords);
      return prevProgress.percentage >= UNLOCK_LESSON_THRESHOLD
        ? [...unlocked, lesson.meta.id]
        : unlocked;
    },
    [],
  );
};

/**
 * The lesson the user should resume on "Start Learning". With sticky unlock,
 * the highest-unlocked lesson is the user's frontier — they may be working
 * on it, or have just passed it. Falling back to first/last lesson handles
 * the empty-state and all-done cases.
 */
export const findCurrentLessonId = (
  lessons: Lesson[],
  userWords: Record<string, WordStats>,
  persistedUnlocked: ReadonlyArray<string> = [],
): string => {
  const unlocked = computeUnlockedLessonIds(lessons, userWords, persistedUnlocked);
  return unlocked[unlocked.length - 1] ?? lessons[0]?.meta.id ?? "";
};

// --- Overall Stats ---

export type OverallStats = {
  totalWords: number;
  masteredWords: number;
  learningWords: number;
  strugglingWords: number;
  overallAccuracy: number;
  totalPhrases: number;
  masteredPhrases: number;
};

/**
 * Aggregate user-facing counters. When `validKeys` is provided, keys outside
 * the set (e.g. stats left over from words removed from `.letz` files) are
 * dropped so the UI doesn't display "mastered 12/10" with orphan data inflating
 * the numerator.
 */
export const computeOverallStats = (
  userWords: Record<string, WordStats>,
  validKeys?: ReadonlySet<string>,
): OverallStats => {
  const entries = validKeys
    ? Object.entries(userWords).filter(([k]) => validKeys.has(k))
    : Object.entries(userWords);
  const wordEntries = entries.filter(([k]) => isWordKey(k)).map(([, v]) => v);
  const phraseEntries = entries.filter(([k]) => isPhraseKey(k)).map(([, v]) => v);

  const wordClassified = wordEntries.map((s) => classifyWord(s));
  const totalShown = wordEntries.reduce((sum, s) => sum + s.correct + s.incorrect, 0);
  const totalCorrect = wordEntries.reduce((sum, s) => sum + s.correct, 0);

  return {
    totalWords: wordEntries.length,
    masteredWords: wordClassified.filter((c) => c === "mastered").length,
    learningWords: wordClassified.filter((c) => c === "learning").length,
    strugglingWords: wordClassified.filter((c) => c === "struggling").length,
    overallAccuracy: totalShown > 0 ? totalCorrect / totalShown : 0,
    totalPhrases: phraseEntries.length,
    masteredPhrases: phraseEntries.filter((s) => classifyWord(s) === "mastered").length,
  };
};
