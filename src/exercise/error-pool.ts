import { MIN_ANSWERS, ERROR_THRESHOLD } from "./constants";
import { wordKey, phraseKey } from "./progression";

import type { WordStats } from "../context/auth";
import type { Lesson, WordEntry, SentenceEntry } from "./letz-parser";

export type ErrorPool = {
  words: WordEntry[];
  phrases: SentenceEntry[];
};

const successRate = (stats: WordStats): number =>
  stats.shown > 0 ? stats.correct / stats.shown : 0;

const isPrimary = (stats: WordStats | undefined): boolean =>
  stats !== undefined &&
  stats.shown >= MIN_ANSWERS &&
  successRate(stats) < ERROR_THRESHOLD;

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
    .sort(([a], [b]) => successRate(userStats[a]!) - successRate(userStats[b]!))
    .map(([, entry]) => entry);
};

// De-duplicates by phrase key (en-lu direction only gates unlock/errors).
const selectPhrasePool = (
  userStats: Record<string, WordStats>,
  lessons: Lesson[],
): SentenceEntry[] => {
  const byKey = new Map<string, SentenceEntry>();
  for (const lesson of lessons) {
    for (const sentence of lesson.sentences) {
      if (sentence.enVariants.length === 0) continue;
      byKey.set(phraseKey("en-lu", sentence.enVariants[0]), sentence);
    }
  }

  const primary = [...byKey.entries()]
    .filter(([key]) => isPrimary(userStats[key]))
    .map(([, sentence]) => sentence);

  if (primary.length > 0) return primary;

  return [...byKey.entries()]
    .filter(([key]) => isFallback(userStats[key]))
    .sort(([a], [b]) => successRate(userStats[a]!) - successRate(userStats[b]!))
    .map(([, sentence]) => sentence);
};
