/**
 * Types for .letz lesson files.
 *
 * File format:
 * - Lines starting with # are comments
 * - @lesson ID "Title" defines lesson metadata
 * - LU = EN defines word pairs (Luxembourgish = English)
 * - Same LU word can have multiple EN translations (multiple lines)
 *
 * Parsing is delegated to src/lib/letz-parser (Chevrotain-based). The parser
 * module is loaded dynamically so Chevrotain stays out of the initial bundle —
 * Home's first paint doesn't depend on it.
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

export type SentenceEntry = {
  luVariants: string[];
  enVariants: string[];
  distractorsEn?: string[];
  distractorsLu?: string[];
};

export type Lesson = {
  meta: LessonMeta;
  entries: WordEntry[];
  sentences: SentenceEntry[];
};

export const parseLetzContent = async (content: string, fallbackId = "unknown"): Promise<Lesson> => {
  const { parseLetz } = await import("../lib/letz-parser");
  return parseLetz(content, fallbackId);
};

/**
 * Convert WordEntry array to WordPair format used by WordMatch
 * WordPair is [left, right] where left is Luxembourgish and right is English
 */
export const entriesToWordPairs = (entries: WordEntry[]): [string, string][] => entries.map(({ lu, en }) => [lu, en]);
