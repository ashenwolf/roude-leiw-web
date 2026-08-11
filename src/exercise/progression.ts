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
 * Directional stat-key prefixes — the "keyed element" family.
 *
 * A word key is `{lu}|{en}` (no prefix); every other Element kind is
 * `{prefix}:{direction}:{firstEn}`. Adding a kind here is the ONE place that
 * teaches the whole app about it: `isWordKey`, `elementIdentity`, and
 * `combinedElementStats` all derive from this list.
 *
 * Each prefix added here MUST also gain a matching regex in `isValidKey`
 * (`worker/lib/validators.ts`) in the same change — an unrecognized key makes the
 * server reject the **entire sync batch** containing it, silently losing all of
 * that Session's progress.
 */
export const KEYED_ELEMENT_PREFIXES = ["phrase", "fill"] as const;

export type KeyedElementKind = (typeof KEYED_ELEMENT_PREFIXES)[number];

/**
 * Single source of truth for directional element stat-keys (phrases and fills).
 *
 * Keys are **per presentation direction** so the error pool can repeat the exact
 * direction a user failed (en→lu assembly vs lu→en assembly are tracked apart).
 * The first EN variant is the stable identity for an element in both directions;
 * `combinedElementStats` / `elementIdentity` recombine the two keys when the
 * element must be treated as ONE (lesson progress, unlock, "Learned X/Y").
 *
 * `firstEn` is truncated to 64 chars to stay in lockstep with `PHRASE_KEY_RX` /
 * `FILL_KEY_RX` in `worker/lib/validators.ts` (max part length 64) — a longer
 * component would make the server reject the entire sync batch containing it. The
 * slice is a no-op for sentences ≤64 chars. Two elements of the same kind sharing
 * the same first 64 chars collide onto one key — an accepted tradeoff (their stats
 * merge). Distinct kinds never collide: the prefix separates them, which is why
 * `fill:` is a new prefix rather than a reuse of `phrase:`.
 */
export const elementKey = (
  kind: KeyedElementKind,
  direction: Direction,
  firstEn: string,
): string => `${kind}:${direction}:${firstEn.slice(0, 64)}`;

export const phraseKey = (direction: Direction, firstEn: string): string =>
  elementKey("phrase", direction, firstEn);

/** Stat key for a @fill item in one presentation direction. */
export const fillKey = (direction: Direction, firstEn: string): string =>
  elementKey("fill", direction, firstEn);

const hasKeyedPrefix = (key: string, kind: KeyedElementKind): boolean =>
  key.startsWith(`${kind}:`);

export const isPhraseKey = (key: string): boolean => hasKeyedPrefix(key, "phrase");
export const isFillKey = (key: string): boolean => hasKeyedPrefix(key, "fill");

/**
 * A word key is anything that is NOT a known keyed-element prefix.
 *
 * Deliberately an explicit check rather than `!isPhraseKey`: with more than one
 * prefix in the family, a negation of a single kind would silently count `fill:`
 * keys as vocabulary and inflate `totalWords`/`masteredWords` on Home.
 */
export const isWordKey = (key: string): boolean =>
  !KEYED_ELEMENT_PREFIXES.some((kind) => hasKeyedPrefix(key, kind));

const EMPTY_STATS: WordStats = { shown: 0, correct: 0, incorrect: 0 };

const addStats = (a: WordStats, b: WordStats): WordStats => ({
  shown: a.shown + b.shown,
  correct: a.correct + b.correct,
  incorrect: a.incorrect + b.incorrect,
});

/**
 * A keyed element is one logical element: its stats are the sum of both
 * presentation directions. Answers in either direction accumulate toward the same
 * pass gate, so practising en→lu and lu→en both count toward mastering the one
 * phrase / fill.
 */
export const combinedElementStats = (
  kind: KeyedElementKind,
  userWords: Record<string, WordStats>,
  firstEn: string,
): WordStats =>
  addStats(
    userWords[elementKey(kind, "en-lu", firstEn)] ?? EMPTY_STATS,
    userWords[elementKey(kind, "lu-en", firstEn)] ?? EMPTY_STATS,
  );

export const combinedPhraseStats = (
  userWords: Record<string, WordStats>,
  firstEn: string,
): WordStats => combinedElementStats("phrase", userWords, firstEn);

export const combinedFillStats = (
  userWords: Record<string, WordStats>,
  firstEn: string,
): WordStats => combinedElementStats("fill", userWords, firstEn);

const IDENTITY_RX = new RegExp(`^(?:${KEYED_ELEMENT_PREFIXES.join("|")}):(?:en-lu|lu-en):`);

/**
 * The direction-agnostic identity of a keyed-element key (its first EN variant).
 * Works for any prefix in the family; a word key passes through unchanged.
 */
export const elementIdentity = (key: string): string => key.replace(IDENTITY_RX, "");

/** @deprecated alias kept for existing call sites — use `elementIdentity`. */
export const phraseIdentity = elementIdentity;

/**
 * All stat-keys defined by the given lessons (word, phrase and fill forms).
 * Use as the `validKeys` argument to overall-stat producers so that elements
 * deleted from `.letz` files don't keep contributing orphan data.
 *
 * Each sentence and each fill contributes both of its directional keys; they are
 * recombined into one Element by `combinedElementStats` wherever progress is
 * counted.
 *
 * A fill's identity is its `@en` line **verbatim, brackets included** — moving a
 * blank changes the exercise, so it is correct for it to be a different Element.
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
      ...lesson.fills.flatMap((f) => [fillKey("en-lu", f.en), fillKey("lu-en", f.en)]),
    ]),
  );

// --- Lesson Progress ---

export type LessonProgress = {
  total: number;
  /** Elements that pass the unlock check (correct >= MASTERY_CORRECT_COUNT). */
  mastered: number;
  percentage: number;
  /** True when percentage >= UNLOCK_LESSON_THRESHOLD (every element passes). */
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

  // Each fill is one element, on the same terms as a sentence.
  const fillTotal = lesson.fills.length;
  const fillPassing = lesson.fills.filter(
    (f) => isElementPassing(combinedFillStats(userWords, f.en)),
  ).length;

  const total = wordTotal + sentenceTotal + fillTotal;
  const mastered = wordPassing + sentencePassing + fillPassing;
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
 * The highest-unlocked lesson — the outer edge of what the user may practise.
 *
 * Use this to bound a *pool* (Word Mix draws from everything up to here). Do NOT
 * use it as the lesson a Session should focus on: unlock is sticky, so the
 * frontier can sit above lessons the user never finished. `findCurrentLessonId`
 * is the focus cursor.
 */
export const findFrontierLessonId = (
  lessons: Lesson[],
  userWords: Record<string, WordStats>,
  persistedUnlocked: ReadonlyArray<string> = [],
): string => {
  const unlocked = computeUnlockedLessonIds(lessons, userWords, persistedUnlocked);
  return unlocked[unlocked.length - 1] ?? lessons[0]?.meta.id ?? "";
};

/**
 * The lesson the user should resume on "Start Learning": the **first unlocked
 * lesson that has not passed yet**, falling back to the frontier when every
 * unlocked lesson is complete (and to the first lesson in the empty state).
 *
 * Not the frontier. Unlock is sticky and used to be granted at 80% of Elements,
 * so an unlocked set routinely contains earlier lessons stalled at 80–99%.
 * Lesson Mode scopes its entire straggler apparatus — the not-yet-mastered
 * bucket AND the adaptive slot-type split — to the last lesson of its pool, i.e.
 * to this cursor. Pointing the cursor at the frontier left those earlier lessons
 * reachable only through the `previous` bucket (~15–20% of picks spread over
 * every earlier Element, ~0.01 draws per Element per Session), so they never
 * completed: simulated on a 9-lesson sticky-unlocked state, 1/9 lessons finished
 * after 60 Sessions with a frontier cursor vs 9/9 with this one.
 *
 * Lessons with no Elements are skipped — `isComplete` is false for them by
 * definition, and a content-less lesson would otherwise capture the cursor
 * permanently.
 */
export const findCurrentLessonId = (
  lessons: Lesson[],
  userWords: Record<string, WordStats>,
  persistedUnlocked: ReadonlyArray<string> = [],
): string => {
  const unlocked = computeUnlockedLessonIds(lessons, userWords, persistedUnlocked);
  const byId = new Map(lessons.map((l) => [l.meta.id, l]));
  const firstUnfinished = unlocked.find((id) => {
    const lesson = byId.get(id);
    if (!lesson) return false;
    const progress = computeLessonProgress(lesson, userWords);
    return progress.total > 0 && !progress.isComplete;
  });
  return firstUnfinished ?? unlocked[unlocked.length - 1] ?? lessons[0]?.meta.id ?? "";
};

// --- Overall Stats ---

export type OverallStats = {
  totalWords: number;
  masteredWords: number;
  learningWords: number;
  strugglingWords: number;
  /** Mastered words + sentences + fills (each keyed element = both directions summed). */
  masteredElements: number;
  /** Accuracy across all valid elements (words + both directions of each keyed element). */
  overallAccuracy: number;
  /** How many distinct sentences are tracked (directions collapsed to one). */
  totalSentences: number;
  masteredSentences: number;
  /** How many distinct @fill items are tracked (directions collapsed to one). */
  totalFills: number;
  masteredFills: number;
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

  /**
   * Both directional keys of a keyed element collapse into one logical element
   * whose stats are the sum of the two directions. Identities are namespaced by
   * kind here (the caller filters by prefix first), so a phrase and a fill sharing
   * the same English can never merge.
   */
  const collapseByIdentity = (predicate: (key: string) => boolean): WordStats[] => [
    ...entries
      .filter(([k]) => predicate(k))
      .reduce<Map<string, WordStats>>((m, [k, v]) => {
        const id = elementIdentity(k);
        return m.set(id, addStats(m.get(id) ?? EMPTY_STATS, v));
      }, new Map())
      .values(),
  ];

  const sentenceStats = collapseByIdentity(isPhraseKey);
  const fillStats = collapseByIdentity(isFillKey);

  const wordStats = wordPairs.map(([, v]) => v);
  const allStats = entries.map(([, v]) => v);  // words + both directions of each keyed element

  const wordClassified = wordStats.map(classifyWord);
  // Accuracy uses all valid elements for a more complete signal.
  const totalShown = allStats.reduce((sum, s) => sum + s.correct + s.incorrect, 0);
  const totalCorrect = allStats.reduce((sum, s) => sum + s.correct, 0);

  const masteredWords = wordStats.filter(isElementMastered).length;
  const masteredSentences = sentenceStats.filter(isElementMastered).length;
  const masteredFills = fillStats.filter(isElementMastered).length;

  return {
    totalWords: wordPairs.length,
    masteredWords,
    learningWords: wordClassified.filter((c) => c === "learning").length,
    strugglingWords: wordClassified.filter((c) => c === "struggling").length,
    // Combined — used for "Learned X/Y". Each sentence and fill counted once.
    masteredElements: masteredWords + masteredSentences + masteredFills,
    overallAccuracy: totalShown > 0 ? totalCorrect / totalShown : 0,
    totalSentences: sentenceStats.length,
    masteredSentences,
    totalFills: fillStats.length,
    masteredFills,
  };
};
