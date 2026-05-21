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
// Primary pool — shown >= MIN_ANSWERS AND accuracy < ERROR_THRESHOLD (0.8)
// accuracy = correct / (correct + incorrect)
// ============================================================================

describe("selectErrorPool — primary pool", () => {
  it("returns words meeting primary criteria", () => {
    // shown = MIN_ANSWERS, correct = 0, incorrect = MIN_ANSWERS → accuracy 0% < 80% ✓
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

  it("excludes words with perfect accuracy (100%)", () => {
    // accuracy = 1.0 ≥ 0.8 AND incorrect = 0 → neither primary nor fallback
    const stats = { [wordKey("Moien", "hi")]: s(MIN_ANSWERS, MIN_ANSWERS, 0) };
    const lessons = [lesson("L1", ["Moien", "hi"])];

    const pool = selectErrorPool(stats, lessons);

    expect(pool.words).toHaveLength(0);
  });

  it("boundary: accuracy exactly at ERROR_THRESHOLD (0.8) is excluded from primary", () => {
    // correct=4, incorrect=1 → accuracy=4/5=0.8 = threshold → NOT < threshold → not primary
    // incorrect=1 → primary empty → fallback kicks in
    const stats = { [wordKey("Moien", "hi")]: s(MIN_ANSWERS, 4, 1) };
    const lessons = [lesson("L1", ["Moien", "hi"])];

    const pool = selectErrorPool(stats, lessons);

    // Not primary (0.8 is not < 0.8), but fallback fires because incorrect > 0
    expect(pool.words).toHaveLength(1);
  });

  it("boundary: accuracy just below ERROR_THRESHOLD enters primary", () => {
    // correct=3, incorrect=2 → accuracy=3/5=0.6 < 0.8 AND shown>=MIN_ANSWERS → primary
    const stats = { [wordKey("Moien", "hi")]: s(MIN_ANSWERS, 3, 2) };
    const lessons = [lesson("L1", ["Moien", "hi"])];

    const pool = selectErrorPool(stats, lessons);

    expect(pool.words).toHaveLength(1);
  });

  it("includes historically-mastered words that have since accumulated wrong answers", () => {
    // correct=4 ≥ MASTERY_CORRECT_COUNT → isElementMastered=true, but accuracy=4/104≈4% → primary
    const stats = { [wordKey("Moien", "hi")]: s(MIN_ANSWERS, 4, 100) };
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

  it("fallback sorts ascending by accuracy (worst first)", () => {
    const stats = {
      [wordKey("A", "a")]: s(2, 2, 0), // no errors → excluded from fallback
      [wordKey("B", "b")]: s(3, 1, 2), // accuracy=1/3≈33% — worst
      [wordKey("C", "c")]: s(4, 3, 1), // accuracy=3/4=75% — middle
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
