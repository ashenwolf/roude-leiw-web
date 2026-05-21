import {
  MIN_ANSWERS,
  MASTERY_CORRECT_COUNT,
  UNLOCK_ELEMENT_THRESHOLD,
  UNLOCK_LESSON_THRESHOLD,
} from "./constants";

import type { Lesson } from "./letz-parser";
import type { WordStats } from "../context/auth";

// --- Mastery Thresholds ---

/**
 * Reference constants for the two classification systems.
 * Import individual constants from `constants.ts` for logic; use MASTERY only
 * when you need all thresholds together (e.g. display, tests).
 */
export const MASTERY = {
  /** Minimum correct count for the monotonic gate (lesson progress, XP). */
  correctToMaster: MASTERY_CORRECT_COUNT,       // 4
  /** Accuracy boundary used by the live classifyWord and error pool. */
  accuracyThreshold: UNLOCK_ELEMENT_THRESHOLD,  // 0.8
  /** Minimum showings before an element can be mastered or struggling. */
  minShown: MIN_ANSWERS,                        // 5
} as const;

// --- Word Classification ---

export type WordMastery = "unseen" | "learning" | "struggling" | "mastered";

/** Live accuracy: correct / (correct + incorrect). Returns 0 when never attempted. */
const accuracy = (s: WordStats): number =>
  s.correct + s.incorrect > 0 ? s.correct / (s.correct + s.incorrect) : 0;

/**
 * Live classification — can change as `correct` and `incorrect` accumulate.
 *
 * Rules:
 *   unseen    — never shown (shown = 0)
 *   learning  — shown < MIN_ANSWERS (not enough data to classify)
 *   mastered  — shown >= MIN_ANSWERS AND accuracy >= 0.8
 *   struggling— shown >= MIN_ANSWERS AND accuracy < 0.8
 *
 * Use this for error-pool selection and UI mastery labels.
 * Do NOT use this for lesson progress or XP — use `isElementMastered` instead.
 */
export const classifyWord = (stats: WordStats | undefined): WordMastery => {
  if (!stats || stats.shown === 0) return "unseen";
  if (stats.shown < MASTERY.minShown) return "learning";
  return accuracy(stats) >= MASTERY.accuracyThreshold ? "mastered" : "struggling";
};

/**
 * Monotonic mastery gate — once `true`, never reverts.
 *
 * An element is mastered when it has been shown enough times (`shown >= MIN_ANSWERS`)
 * AND answered correctly enough times in total (`correct >= MASTERY_CORRECT_COUNT`).
 * Both counters only ever grow, so this predicate can only flip from false → true.
 *
 * Use this for lesson progress, XP, and the "Learned X/Y" display stat.
 * A word can simultaneously pass this gate AND be `struggling` in `classifyWord`
 * (meaning: it was mastered historically but accuracy has since dropped and the
 * user should practise it again via the error pool).
 */
export const isElementMastered = (stats: WordStats | undefined): boolean =>
  stats !== undefined &&
  stats.shown >= MASTERY.minShown &&
  stats.correct >= MASTERY.correctToMaster;

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

/** Lesson-progress gate — delegates to the monotonic isElementMastered so
 *  lesson completion percentages never decrease as the user keeps practising. */
const isElementPassing = isElementMastered;

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
  /** Mastered words + mastered sentences (en-lu direction only, so each sentence counts once). */
  masteredElements: number;
  /** Accuracy across all valid elements (words + both phrase directions). */
  overallAccuracy: number;
  /** How many distinct sentences (en-lu keys) are tracked in userWords. */
  totalSentences: number;
  masteredSentences: number;
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

  // Words and phrases kept as [key, stats] pairs so we can filter by direction.
  const wordPairs = entries.filter(([k]) => isWordKey(k));
  const phrasePairs = entries.filter(([k]) => isPhraseKey(k));
  // en-lu is the canonical direction: one key per sentence, aligns with unlock gate.
  const enLuPairs = phrasePairs.filter(([k]) => k.startsWith("phrase:en-lu:"));

  const wordStats = wordPairs.map(([, v]) => v);
  const allStats = entries.map(([, v]) => v);  // words + both phrase directions

  const wordClassified = wordStats.map(classifyWord);
  // Accuracy uses all valid elements for a more complete signal.
  const totalShown = allStats.reduce((sum, s) => sum + s.correct + s.incorrect, 0);
  const totalCorrect = allStats.reduce((sum, s) => sum + s.correct, 0);

  const masteredWords = wordStats.filter(isElementMastered).length;
  const masteredSentences = enLuPairs.filter(([, s]) => isElementMastered(s)).length;

  return {
    totalWords: wordPairs.length,
    masteredWords,
    learningWords: wordClassified.filter((c) => c === "learning").length,
    strugglingWords: wordClassified.filter((c) => c === "struggling").length,
    // Combined — used for "Learned X/Y". Each sentence counted once via en-lu key.
    masteredElements: masteredWords + masteredSentences,
    overallAccuracy: totalShown > 0 ? totalCorrect / totalShown : 0,
    totalSentences: enLuPairs.length,
    masteredSentences,
  };
};
