/**
 * Parser for .letz lesson files
 *
 * File format:
 * - Lines starting with # are comments
 * - @lesson ID "Title" defines lesson metadata
 * - LU = EN defines word pairs (Luxembourgish = English)
 * - Same LU word can have multiple EN translations (multiple lines)
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

const LESSON_HEADER_REGEX = /^@lesson\s+(\S+)\s+"([^"]+)"/;
const WORD_PAIR_REGEX = /^([^=]+)\s*=\s*(.+)$/;

/**
 * Parse a single .letz file content into a Lesson object
 */
export const parseLetzContent = (content: string, fallbackId = "unknown"): Lesson => {
  const lines = content.split("\n");

  let meta: LessonMeta = {
    id: fallbackId,
    title: "Untitled Lesson",
    level: extractLevel(fallbackId),
  };

  const entries: WordEntry[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Skip empty lines and comments
    if (!line || line.startsWith("#")) {
      continue;
    }

    // Check for lesson header
    const headerMatch = line.match(LESSON_HEADER_REGEX);
    if (headerMatch) {
      const [, id, title] = headerMatch;
      meta = {
        id,
        title,
        level: extractLevel(id),
      };
      continue;
    }

    // Check for word pair
    const pairMatch = line.match(WORD_PAIR_REGEX);
    if (pairMatch) {
      const [, lu, en] = pairMatch;
      entries.push({
        lu: lu.trim(),
        en: en.trim(),
      });
    }
  }

  return { meta, entries };
};

/**
 * Extract level (e.g., "A1", "A2", "B1") from lesson ID
 * Assumes format like "A1.01" or "A1/01"
 */
const extractLevel = (id: string): string => {
  const match = id.match(/^([A-Z]\d)/i);
  return match ? match[1].toUpperCase() : "A1";
};

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
