import { MIN_ANSWERS, ERROR_THRESHOLD } from "./constants";
import { wordKey, phraseKey, fillKey } from "./progression";

import type { WordStats } from "../context/auth";
import type { Direction } from "./progression";
import type { FillEntry, Lesson, WordEntry, SentenceEntry } from "./letz-parser";

/** A struggling phrase plus the exact direction the user failed it in. */
export type PhraseError = {
  sentence: SentenceEntry;
  direction: Direction;
};

/** A struggling fill-in-words item plus the exact direction the user failed it in. */
export type FillError = {
  fill: FillEntry;
  direction: Direction;
};

export type ErrorPool = {
  words: WordEntry[];
  phrases: PhraseError[];
  /**
   * Kept separate from `phrases` rather than folded in: Fix Errors must rebuild a
   * failed fill as a fill (`buildFillExercise`), not as a sentence — the two
   * mechanics have different distractor semantics.
   */
  fills: FillError[];
};

/** Same formula as classifyWord — correct / (correct + incorrect). */
const accuracy = (stats: WordStats): number =>
  stats.correct + stats.incorrect > 0 ? stats.correct / (stats.correct + stats.incorrect) : 0;

const isPrimary = (stats: WordStats | undefined): boolean =>
  stats !== undefined &&
  stats.shown >= MIN_ANSWERS &&
  accuracy(stats) < ERROR_THRESHOLD;

const isFallback = (stats: WordStats | undefined): boolean =>
  (stats?.incorrect ?? 0) > 0;

/**
 * Single source of truth for "struggling content" across the app.
 *
 * Primary pool  — shown >= MIN_ANSWERS AND accuracy < ERROR_THRESHOLD.
 * Fallback pool — when primary is empty for that kind: all elements with
 *                 incorrect > 0, worst accuracy first.
 *
 * Each element kind is computed independently, so a caller can get a non-empty
 * phrase pool even when the word pool is empty (and vice-versa).
 */
export const selectErrorPool = (
  userStats: Record<string, WordStats>,
  lessons: Lesson[],
): ErrorPool => ({
  words: selectWordPool(userStats, lessons),
  phrases: selectPhrasePool(userStats, lessons),
  fills: selectFillPool(userStats, lessons),
});

/**
 * The primary-then-fallback rule, applied to any keyed candidate map.
 *
 * Candidates arrive de-duplicated by stat key (the same element may appear in
 * several lessons), and the key is what carries the direction — so this one
 * function serves words (direction-less keys) and directional elements alike.
 */
const pickStruggling = <T>(
  byKey: Map<string, T>,
  userStats: Record<string, WordStats>,
): T[] => {
  const primary = [...byKey.entries()]
    .filter(([key]) => isPrimary(userStats[key]))
    .map(([, candidate]) => candidate);

  if (primary.length > 0) return primary;

  return [...byKey.entries()]
    .filter(([key]) => isFallback(userStats[key]))
    .sort(([a], [b]) => accuracy(userStats[a]!) - accuracy(userStats[b]!))
    .map(([, candidate]) => candidate);
};

const selectWordPool = (
  userStats: Record<string, WordStats>,
  lessons: Lesson[],
): WordEntry[] =>
  pickStruggling(
    new Map(
      lessons.flatMap((lesson) =>
        lesson.entries.map((entry) => [wordKey(entry.lu, entry.en), entry] as const),
      ),
    ),
    userStats,
  );

// Each candidate is an (element, direction) pair keyed by its directional stat
// key, so an element failed in en→lu and the same element failed in lu→en are
// distinct error entries and Fix Errors repeats the exact failed direction.
const DIRECTIONS: ReadonlyArray<Direction> = ["en-lu", "lu-en"];

const selectPhrasePool = (
  userStats: Record<string, WordStats>,
  lessons: Lesson[],
): PhraseError[] =>
  pickStruggling(
    new Map(
      lessons.flatMap((lesson) =>
        lesson.sentences
          .filter((sentence) => sentence.enVariants.length > 0)
          .flatMap((sentence) =>
            DIRECTIONS.map(
              (direction) =>
                [phraseKey(direction, sentence.enVariants[0]), { sentence, direction }] as const,
            ),
          ),
      ),
    ),
    userStats,
  );

const selectFillPool = (
  userStats: Record<string, WordStats>,
  lessons: Lesson[],
): FillError[] =>
  pickStruggling(
    new Map(
      lessons.flatMap((lesson) =>
        lesson.fills.flatMap((fill) =>
          DIRECTIONS.map(
            (direction) => [fillKey(direction, fill.en), { fill, direction }] as const,
          ),
        ),
      ),
    ),
    userStats,
  );
