import { MIN_ANSWERS, ERROR_THRESHOLD } from "./constants";
import { wordKey, phraseKey } from "./progression";

import type { WordStats } from "../context/auth";
import type { Direction } from "./progression";
import type { Lesson, WordEntry, SentenceEntry } from "./letz-parser";

/** A struggling phrase plus the exact direction the user failed it in. */
export type PhraseError = {
  sentence: SentenceEntry;
  direction: Direction;
};

export type ErrorPool = {
  words: WordEntry[];
  phrases: PhraseError[];
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
 * Primary pool  — shown >= MIN_ANSWERS AND correct/shown < ERROR_THRESHOLD (0.9).
 * Fallback pool — used when primary is empty for that type; all elements with
 *                 incorrect > 0, sorted ascending by correct/shown (worst first).
 *
 * Words and phrases are computed independently so a caller can get a non-empty
 * phrase pool even when the word pool is full (and vice-versa).
 */
export const selectErrorPool = (
  userStats: Record<string, WordStats>,
  lessons: Lesson[],
): ErrorPool => ({
  words: selectWordPool(userStats, lessons),
  phrases: selectPhrasePool(userStats, lessons),
});

// De-duplicates by key (same word pair may appear in multiple lessons).
const selectWordPool = (
  userStats: Record<string, WordStats>,
  lessons: Lesson[],
): WordEntry[] => {
  const byKey = new Map<string, WordEntry>();
  for (const lesson of lessons) {
    for (const entry of lesson.entries) {
      byKey.set(wordKey(entry.lu, entry.en), entry);
    }
  }

  const primary = [...byKey.entries()]
    .filter(([key]) => isPrimary(userStats[key]))
    .map(([, entry]) => entry);

  if (primary.length > 0) return primary;

  return [...byKey.entries()]
    .filter(([key]) => isFallback(userStats[key]))
    .sort(([a], [b]) => accuracy(userStats[a]!) - accuracy(userStats[b]!))
    .map(([, entry]) => entry);
};

// Each candidate is a (sentence, direction) pair keyed by its directional stat
// key, so a phrase failed in en→lu and the same phrase failed in lu→en are
// distinct error entries and Fix Errors repeats the exact failed direction.
const DIRECTIONS: ReadonlyArray<Direction> = ["en-lu", "lu-en"];

const selectPhrasePool = (
  userStats: Record<string, WordStats>,
  lessons: Lesson[],
): PhraseError[] => {
  const byKey = new Map<string, PhraseError>();
  for (const lesson of lessons) {
    for (const sentence of lesson.sentences) {
      if (sentence.enVariants.length === 0) continue;
      for (const direction of DIRECTIONS) {
        byKey.set(phraseKey(direction, sentence.enVariants[0]), { sentence, direction });
      }
    }
  }

  const primary = [...byKey.entries()]
    .filter(([key]) => isPrimary(userStats[key]))
    .map(([, phrase]) => phrase);

  if (primary.length > 0) return primary;

  return [...byKey.entries()]
    .filter(([key]) => isFallback(userStats[key]))
    .sort(([a], [b]) => accuracy(userStats[a]!) - accuracy(userStats[b]!))
    .map(([, phrase]) => phrase);
};
