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
  /**
   * Lesson-level photo (`@image "path"`), served from `public/` — e.g.
   * `/assets/exam/picture/schueberfouer/img/schueberfouer.webp`. Picture-description
   * sub-lessons need the learner to SEE what they are describing; other lessons
   * omit it. Photos must be optimized WebP (16:9, ≤880px) — enforced by
   * tests/integration/exam-manifest-letz.test.ts.
   */
  image?: string;
  /**
   * `@image-alt "text"` — the photo's alt text AND the caption of the placeholder
   * frame shown while `image` is absent, so a picture sub-lesson stays usable
   * before its photo lands. Not merely an a11y nicety.
   */
  imageAlt?: string;
};

export type WordEntry = {
  lu: string;
  en: string;
};

export type SentenceEntry = {
  luVariants: string[];
  enVariants: string[];
  /** Examiner-style question (in Luxembourgish) this sentence answers — exam-track Q&A. */
  question?: string;
  /**
   * URL of the question's pre-generated audio, stamped by `fetchLetzFile` from
   * the .letz file's own directory (`<dir>/audio/questions/<slug>.mp3`). The
   * parser never sets it — audio location is a serving concern, and only the
   * loader knows where the file came from. Optimistic: derived, not verified;
   * the player treats a 404 as "no audio".
   */
  questionAudioUrl?: string;
  distractorsEn?: string[];
  distractorsLu?: string[];
};

/**
 * A fill-in-words item: a mostly-complete sentence with 1–4 `[bracketed]` blanks
 * the learner drops tiles into. Structurally like a `SentenceEntry` but a
 * DISTINCT Element kind — its own stat key (`fill:`), its own error pool, its own
 * contribution to lesson progress.
 *
 * Exactly one variant per side (unlike `SentenceEntry`'s `luVariants[]`):
 * accepted variants ARE ambiguity for this mechanic, which requires exactly one
 * correct form. Blank counts and positions may differ between `lu` and `en`
 * because word order does — the two directions are keyed and graded independently
 * and no cross-language blank correspondence is implied.
 *
 * See .claude/memory/fill-in-words-exercise.md.
 */
export type FillEntry = {
  /** Luxembourgish sentence with blanks marked in place, e.g. `Am Hannergrond [gesinn] ech ...`. */
  lu: string;
  /** English sentence with blanks marked in place. */
  en: string;
  distractorsEn?: string[];
  distractorsLu?: string[];
};

export type Lesson = {
  meta: LessonMeta;
  entries: WordEntry[];
  sentences: SentenceEntry[];
  fills: FillEntry[];
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
