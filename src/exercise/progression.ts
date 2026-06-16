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
  /** Correct count for the monotonic pass gate (lesson progress, unlock, XP). */
  correctToMaster: MASTERY_CORRECT_COUNT,       // 3
  /** Accuracy boundary used by the live classifyWord and error pool. */
  accuracyThreshold: UNLOCK_ELEMENT_THRESHOLD,  // 0.8
  /** Minimum showings before an element can be mastered or struggling (live view only). */
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
 * An element is mastered when it has been answered correctly enough times in
 * total (`correct >= MASTERY_CORRECT_COUNT`). There is no minimum-shown gate and
 * no accuracy ratio — three correct answers passes the element regardless of how
 * many times it was missed. `correct` only ever grows, so this predicate can
 * only flip from false → true.
 *
 * Use this for lesson progress, XP, and the "Learned X/Y" display stat.
 * A word can simultaneously pass this gate AND be `struggling` in `classifyWord`
 * (meaning: it was mastered historically but accuracy has since dropped and the
 * user should practise it again via the error pool).
 */
export const isElementMastered = (stats: WordStats | undefined): boolean =>
  stats !== undefined && stats.correct >= MASTERY.correctToMaster;

export const wordKey = (lu: string, en: string): string => `${lu}|${en}`;

export type Direction = "en-lu" | "lu-en";

/**
 * Single source of truth for phrase stat-keys.
 *
 * Keys are **per presentation direction** so the error pool can repeat the exact
 * direction a user failed (en→lu assembly vs lu→en assembly are tracked apart).
 * The first EN variant is the stable identity for a sentence in both directions;
 * `combinedPhraseStats` / `phraseIdentity` recombine the two keys when a phrase
 * must be treated as ONE element (lesson progress, unlock, "Learned X/Y").
 *
 * `firstEn` is truncated to 64 chars to stay in lockstep with `PHRASE_KEY_RX`
 * in `worker/lib/validators.ts` (max part length 64) — a longer component would
 * make the server reject the entire sync batch containing it. The slice is a
 * no-op for sentences ≤64 chars. Two sentences sharing the same first 64 chars
 * of their first EN variant collide onto one key — an accepted tradeoff (their
 * stats merge).
 */
export const phraseKey = (direction: Direction, firstEn: string): string =>
  `phrase:${direction}:${firstEn.slice(0, 64)}`;

export const isPhraseKey = (key: string): boolean => key.startsWith("phrase:");
export const isWordKey = (key: string): boolean => !isPhraseKey(key);

const EMPTY_STATS: WordStats = { shown: 0, correct: 0, incorrect: 0 };

const addStats = (a: WordStats, b: WordStats): WordStats => ({
  shown: a.shown + b.shown,
  correct: a.correct + b.correct,
  incorrect: a.incorrect + b.incorrect,
});

/**
 * A phrase is one logical element: its stats are the sum of both presentation
 * directions. Answers in either direction accumulate toward the same pass gate,
 * so practising en→lu and lu→en both count toward mastering the one phrase.
 */
export const combinedPhraseStats = (
  userWords: Record<string, WordStats>,
  firstEn: string,
): WordStats =>
  addStats(
    userWords[phraseKey("en-lu", firstEn)] ?? EMPTY_STATS,
    userWords[phraseKey("lu-en", firstEn)] ?? EMPTY_STATS,
  );

/** The direction-agnostic identity of a phrase key (its first EN variant). */
export const phraseIdentity = (key: string): string =>
  key.replace(/^phrase:(?:en-lu|lu-en):/, "");

/**
 * All stat-keys defined by the given lessons (both word and phrase forms).
 * Use as the `validKeys` argument to overall-stat producers so that elements
 * deleted from `.letz` files don't keep contributing orphan data.
 *
 * Each sentence contributes both directional phrase keys; they are recombined
 * into one Element by `combinedPhraseStats` wherever progress is counted.
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
  /** Elements that pass the unlock check (correct >= MASTERY_CORRECT_COUNT). */
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

  // Each sentence is one element; both directions are summed before the gate.
  const sentenceTotal = lesson.sentences.length;
  const sentencePassing = lesson.sentences.filter(
    (s) => s.enVariants.length > 0 && isElementPassing(combinedPhraseStats(userWords, s.enVariants[0])),
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
  /** Mastered words + mastered sentences (each sentence = both directions summed). */
  masteredElements: number;
  /** Accuracy across all valid elements (words + both phrase directions). */
  overallAccuracy: number;
  /** How many distinct sentences are tracked (directions collapsed to one). */
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

  const wordPairs = entries.filter(([k]) => isWordKey(k));
  const phrasePairs = entries.filter(([k]) => isPhraseKey(k));

  // Both directional keys of a phrase collapse into one logical sentence whose
  // stats are the sum of the two directions.
  const sentenceStats = [
    ...phrasePairs
      .reduce<Map<string, WordStats>>((m, [k, v]) => {
        const id = phraseIdentity(k);
        return m.set(id, addStats(m.get(id) ?? EMPTY_STATS, v));
      }, new Map())
      .values(),
  ];

  const wordStats = wordPairs.map(([, v]) => v);
  const allStats = entries.map(([, v]) => v);  // words + both phrase directions

  const wordClassified = wordStats.map(classifyWord);
  // Accuracy uses all valid elements for a more complete signal.
  const totalShown = allStats.reduce((sum, s) => sum + s.correct + s.incorrect, 0);
  const totalCorrect = allStats.reduce((sum, s) => sum + s.correct, 0);

  const masteredWords = wordStats.filter(isElementMastered).length;
  const masteredSentences = sentenceStats.filter(isElementMastered).length;

  return {
    totalWords: wordPairs.length,
    masteredWords,
    learningWords: wordClassified.filter((c) => c === "learning").length,
    strugglingWords: wordClassified.filter((c) => c === "struggling").length,
    // Combined — used for "Learned X/Y". Each sentence counted once.
    masteredElements: masteredWords + masteredSentences,
    overallAccuracy: totalShown > 0 ? totalCorrect / totalShown : 0,
    totalSentences: sentenceStats.length,
    masteredSentences,
  };
};
