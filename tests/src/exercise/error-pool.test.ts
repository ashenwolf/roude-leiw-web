import { describe, it, expect } from "vitest";

import { selectErrorPool } from "../../../src/exercise/error-pool.ts";
import { MIN_ANSWERS, ERROR_THRESHOLD } from "../../../src/exercise/constants.ts";

import type { WordStats } from "../../../src/context/auth.ts";
import type { Lesson, SentenceEntry } from "../../../src/exercise/letz-parser.ts";

// ============================================================================
// Helpers
// ============================================================================

const s = (shown: number, correct: number, incorrect: number): WordStats =>
  ({ shown, correct, incorrect });

const lesson = (id: string, ...pairs: [string, string][]): Lesson => ({
  meta: { id, title: id, level: "A1" },
  entries: pairs.map(([lu, en]) => ({ lu, en })),
  sentences: [],
});

const lessonWithSentences = (
  id: string,
  pairs: [string, string][],
  sentences: SentenceEntry[],
): Lesson => ({
  meta: { id, title: id, level: "A1" },
  entries: pairs.map(([lu, en]) => ({ lu, en })),
  sentences,
});

const sentence = (firstEn: string, ...luVariants: string[]): SentenceEntry => ({
  luVariants,
  enVariants: [firstEn],
  distractorsEn: [],
  distractorsLu: [],
});

const wordKey = (lu: string, en: string) => `${lu}|${en}`;
const phraseKey = (firstEn: string) => `phrase:en-lu:${firstEn}`;

// ============================================================================
// Primary pool — shown >= MIN_ANSWERS AND correct/shown < ERROR_THRESHOLD
// ============================================================================

describe("selectErrorPool — primary pool", () => {
  it("returns words meeting primary criteria", () => {
    // shown = MIN_ANSWERS, correct = 0 → rate 0 < 0.9 ✓
    const stats = { [wordKey("Moien", "hi")]: s(MIN_ANSWERS, 0, MIN_ANSWERS) };
    const lessons = [lesson("L1", ["Moien", "hi"])];

    const pool = selectErrorPool(stats, lessons);

    expect(pool.words).toHaveLength(1);
    expect(pool.words[0]).toMatchObject({ lu: "Moien", en: "hi" });
    expect(pool.phrases).toHaveLength(0);
  });

  it("excludes from primary when shown < MIN_ANSWERS (falls to fallback if incorrect > 0)", () => {
    // shown < MIN_ANSWERS AND incorrect > 0 → not primary, but IS in fallback
    const stats = { [wordKey("Moien", "hi")]: s(MIN_ANSWERS - 1, 0, MIN_ANSWERS - 1) };
    const lessons = [lesson("L1", ["Moien", "hi"])];

    const pool = selectErrorPool(stats, lessons);

    // Fallback applies; word appears there (not gated by MIN_ANSWERS)
    expect(pool.words).toHaveLength(1);
  });

  it("excludes words with no errors and high accuracy", () => {
    // correct/shown = 1.0 ≥ 0.9 AND incorrect = 0 → neither primary nor fallback
    const stats = { [wordKey("Moien", "hi")]: s(MIN_ANSWERS, MIN_ANSWERS, 0) };
    const lessons = [lesson("L1", ["Moien", "hi"])];

    const pool = selectErrorPool(stats, lessons);

    expect(pool.words).toHaveLength(0);
  });

  it("boundary: rate exactly at ERROR_THRESHOLD (0.9) is excluded from primary", () => {
    // Use shown=10, correct=9 to hit 0.9 exactly with integers
    const stats = { [wordKey("Moien", "hi")]: s(10, 9, 1) };
    const lessons = [lesson("L1", ["Moien", "hi"])];

    const pool = selectErrorPool(stats, lessons);

    // 9/10 = 0.9 = ERROR_THRESHOLD → NOT < threshold → not primary
    // But incorrect = 1 → primary is empty → fallback kicks in
    expect(pool.words).toHaveLength(1);
  });

  it("boundary: rate just below ERROR_THRESHOLD enters primary", () => {
    // shown=10, correct=8 → rate=0.8 < 0.9 AND shown>=MIN_ANSWERS → primary
    const stats = { [wordKey("Moien", "hi")]: s(10, 8, 2) };
    const lessons = [lesson("L1", ["Moien", "hi"])];

    const pool = selectErrorPool(stats, lessons);

    expect(pool.words).toHaveLength(1);
  });

  it("includes words just below ERROR_THRESHOLD", () => {
    // correct = MIN_ANSWERS - 1 → rate = (n-1)/n < 0.9 for n=5 → 0.8 < 0.9 ✓
    const shown = MIN_ANSWERS;
    const correct = MIN_ANSWERS - 1;
    const stats = { [wordKey("Moien", "hi")]: s(shown, correct, shown - correct) };
    const lessons = [lesson("L1", ["Moien", "hi"])];

    const pool = selectErrorPool(stats, lessons);

    expect(pool.words).toHaveLength(1);
  });

  it("deduplicates words appearing in multiple lessons", () => {
    const stats = { [wordKey("Moien", "hi")]: s(MIN_ANSWERS, 0, MIN_ANSWERS) };
    const lessons = [
      lesson("L1", ["Moien", "hi"]),
      lesson("L2", ["Moien", "hi"]), // same pair
    ];

    const pool = selectErrorPool(stats, lessons);

    expect(pool.words).toHaveLength(1);
  });

  it("returns phrases meeting primary criteria", () => {
    const key = phraseKey("Good morning");
    const stats = { [key]: s(MIN_ANSWERS, 0, MIN_ANSWERS) };
    const lessons = [
      lessonWithSentences("L1", [], [sentence("Good morning", "Gudde Moien")]),
    ];

    const pool = selectErrorPool(stats, lessons);

    expect(pool.phrases).toHaveLength(1);
    expect(pool.phrases[0].enVariants[0]).toBe("Good morning");
  });

  it("excludes sentences with no enVariants", () => {
    const lessons = [
      lessonWithSentences("L1", [], [{ luVariants: ["Gudde Moien"], enVariants: [], distractorsEn: [], distractorsLu: [] }]),
    ];

    const pool = selectErrorPool({}, lessons);

    expect(pool.phrases).toHaveLength(0);
  });
});

// ============================================================================
// Fallback pool — all with incorrect > 0, sorted ascending by success rate
// ============================================================================

describe("selectErrorPool — fallback pool", () => {
  it("uses fallback when primary is empty", () => {
    // shown < MIN_ANSWERS but has incorrect — goes to fallback
    const stats = { [wordKey("Moien", "hi")]: s(1, 0, 1) };
    const lessons = [lesson("L1", ["Moien", "hi"])];

    const pool = selectErrorPool(stats, lessons);

    expect(pool.words).toHaveLength(1);
    expect(pool.words[0]).toMatchObject({ lu: "Moien", en: "hi" });
  });

  it("fallback excludes words with incorrect = 0", () => {
    const stats = { [wordKey("Moien", "hi")]: s(3, 3, 0) }; // no errors
    const lessons = [lesson("L1", ["Moien", "hi"])];

    const pool = selectErrorPool(stats, lessons);

    expect(pool.words).toHaveLength(0);
    expect(pool.phrases).toHaveLength(0);
  });

  it("fallback sorts ascending by success rate (worst first)", () => {
    const stats = {
      [wordKey("A", "a")]: s(2, 2, 0), // rate 1.0 — no errors, excluded from fallback
      [wordKey("B", "b")]: s(3, 1, 2), // rate 0.33 — worst
      [wordKey("C", "c")]: s(4, 3, 1), // rate 0.75 — middle
    };
    const lessons = [lesson("L1", ["A", "a"], ["B", "b"], ["C", "c"])];

    const pool = selectErrorPool(stats, lessons);

    expect(pool.words.map((e) => e.lu)).toEqual(["B", "C"]);
  });

  it("empty pool when no errors at all", () => {
    const lessons = [lesson("L1", ["Moien", "hi"])];

    const pool = selectErrorPool({}, lessons);

    expect(pool.words).toHaveLength(0);
    expect(pool.phrases).toHaveLength(0);
  });
});

// ============================================================================
// Words and phrases are independent
// ============================================================================

describe("selectErrorPool — independence of words and phrases", () => {
  it("phrase fallback fires independently when word primary is non-empty", () => {
    // Word: primary (shown >= MIN_ANSWERS, low rate)
    const wKey = wordKey("Moien", "hi");
    // Phrase: fallback (shown < MIN_ANSWERS but incorrect > 0)
    const pKey = phraseKey("Good morning");

    const stats = {
      [wKey]: s(MIN_ANSWERS, 0, MIN_ANSWERS),
      [pKey]: s(1, 0, 1),
    };
    const lessons = [
      lessonWithSentences("L1", [["Moien", "hi"]], [sentence("Good morning", "Gudde Moien")]),
    ];

    const pool = selectErrorPool(stats, lessons);

    // Words uses primary; phrases uses fallback (independently)
    expect(pool.words).toHaveLength(1);
    expect(pool.phrases).toHaveLength(1);
  });
});
