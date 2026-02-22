import { parseLetz } from "../lib/letz-parser";

/**
 * Types for .letz lesson files.
 *
 * File format:
 * - Lines starting with # are comments
 * - @lesson ID "Title" defines lesson metadata
 * - LU = EN defines word pairs (Luxembourgish = English)
 * - Same LU word can have multiple EN translations (multiple lines)
 *
 * Parsing is delegated to src/lib/letz-parser (Chevrotain-based).
 */

export type LessonMeta = {
  id: string;
  title: string;
  level: string;
};

export type WordEntry = {
  lu: string;
  en: string;
};

export type Lesson = {
  meta: LessonMeta;
  entries: WordEntry[];
};

/**
 * Parse a single .letz file content into a Lesson object.
 */
export const parseLetzContent = (content: string, fallbackId = "unknown"): Lesson =>
  parseLetz(content, fallbackId);

/**
 * Convert WordEntry array to WordPair format used by WordMatch
 * WordPair is [left, right] where left is Luxembourgish and right is English
 */
export const entriesToWordPairs = (entries: WordEntry[]): [string, string][] => entries.map(({ lu, en }) => [lu, en]);

/**
 * Combine entries from multiple lessons, shuffling the result
 */
export const combineAndShuffleEntries = (lessons: Lesson[]): WordEntry[] => {
  const allEntries = lessons.flatMap((lesson) => lesson.entries);

  // Fisher-Yates shuffle
  const shuffled = [...allEntries];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
};
