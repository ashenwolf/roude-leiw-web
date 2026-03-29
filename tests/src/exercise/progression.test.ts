import { describe, it, expect } from "vitest";

import {
  classifyWord,
  computeLessonProgress,
  computeUnlockedLessonIds,
  computeOverallStats,
  MASTERY,
} from "../../../src/exercise/progression.ts";
import type { WordStats } from "../../../src/context/auth.ts";
import type { Lesson } from "../../../src/exercise/letz-parser.ts";

// ============================================================================
// Helpers
// ============================================================================

const s = (shown: number, correct: number, incorrect: number): WordStats =>
  ({ shown, correct, incorrect });

const lesson = (id: string, ...pairs: [string, string][]): Lesson => ({
  meta: { id, title: id, level: "A1" },
  entries: pairs.map(([lu, en]) => ({ lu, en })),
});

// ============================================================================
// classifyWord
// ============================================================================

describe("classifyWord", () => {
  it.each([
    // unseen
    ["undefined → unseen", undefined, "unseen"],
    ["shown=0 → unseen", s(0, 0, 0), "unseen"],
    // mastered: shown >= 5 AND accuracy >= 0.8
    ["shown=5, 5/5 correct → mastered", s(5, 5, 0), "mastered"],
    ["shown=5, 4/5 correct (0.8 exactly) → mastered", s(5, 4, 1), "mastered"],
    ["shown=10, 8/10 correct → mastered", s(10, 8, 2), "mastered"],
    // struggling: shown >= 3 AND accuracy < 0.6
    ["shown=3, 1/3 correct (0.33) → struggling", s(3, 1, 2), "struggling"],
    ["shown=5, 2/5 correct (0.4) → struggling", s(5, 2, 3), "struggling"],
    // boundary: accuracy = 0.6 exactly is NOT struggling (strict <)
    ["shown=5, 3/5 correct (0.6) → learning", s(5, 3, 2), "learning"],
    // learning: shown < 3 with bad accuracy — not enough shown to be struggling
    ["shown=2, 0/2 correct → learning (not enough shown)", s(2, 0, 2), "learning"],
    // learning: shown >= 5 but accuracy between 0.6 and 0.8
    ["shown=5, 3/4 total attempts (0.75) → learning", s(5, 3, 1), "learning"],
  ] as const)("%s", (_, input, expected) => {
    expect(classifyWord(input)).toBe(expected);
  });

  it("MASTERY thresholds are applied correctly", () => {
    // Verify the constants themselves match the test assumptions
    expect(MASTERY.minShown).toBe(5);
    expect(MASTERY.minAccuracy).toBe(0.8);
    expect(MASTERY.strugglingMinShown).toBe(3);
    expect(MASTERY.strugglingMaxAccuracy).toBe(0.6);
  });
});

// ============================================================================
// computeLessonProgress
// ============================================================================

describe("computeLessonProgress", () => {
  const greetings = lesson("A1.01", ["Moien", "hi"], ["Äddi", "bye"], ["Merci", "thanks"]);

  it("no user words → 0% progress", () => {
    const progress = computeLessonProgress(greetings, {});
    expect(progress).toEqual({ total: 3, mastered: 0, percentage: 0, isComplete: false });
  });

  it("some words mastered → partial progress", () => {
    const words = { "Moien|hi": s(5, 5, 0), "Äddi|bye": s(5, 4, 1) };
    const progress = computeLessonProgress(greetings, words);
    expect(progress.mastered).toBe(2);
    expect(progress.percentage).toBeCloseTo(2 / 3);
    expect(progress.isComplete).toBe(false);
  });

  it("all words mastered → 100% complete", () => {
    const words = {
      "Moien|hi": s(5, 5, 0),
      "Äddi|bye": s(5, 4, 1),
      "Merci|thanks": s(5, 5, 0),
    };
    const progress = computeLessonProgress(greetings, words);
    expect(progress).toEqual({ total: 3, mastered: 3, percentage: 1, isComplete: true });
  });

  it("empty lesson → isComplete false (total=0 guard)", () => {
    const emptyLesson = lesson("A1.00");
    const progress = computeLessonProgress(emptyLesson, {});
    expect(progress.isComplete).toBe(false);
    expect(progress.percentage).toBe(0);
  });
});

// ============================================================================
// computeUnlockedLessonIds
// ============================================================================

describe("computeUnlockedLessonIds", () => {
  const lessons = [
    lesson("A1.01", ["Moien", "hi"], ["Äddi", "bye"]),
    lesson("A1.02", ["eng", "one"], ["zwee", "two"]),
    lesson("A1.03", ["grouss", "big"], ["kleng", "small"]),
  ];

  const masteredWords = (pairs: [string, string][]) =>
    pairs.reduce<Record<string, WordStats>>(
      (acc, [lu, en]) => ({ ...acc, [`${lu}|${en}`]: s(5, 5, 0) }),
      {},
    );

  it("always unlocks the first lesson", () => {
    const unlocked = computeUnlockedLessonIds(lessons, {});
    expect(unlocked).toContain("A1.01");
    expect(unlocked).not.toContain("A1.02");
  });

  it("unlocks next lesson when previous is complete", () => {
    const words = masteredWords([["Moien", "hi"], ["Äddi", "bye"]]);
    const unlocked = computeUnlockedLessonIds(lessons, words);
    expect(unlocked).toContain("A1.01");
    expect(unlocked).toContain("A1.02");
    expect(unlocked).not.toContain("A1.03");
  });

  it("unlocks all when all prior lessons are complete", () => {
    const words = masteredWords([
      ["Moien", "hi"], ["Äddi", "bye"],
      ["eng", "one"], ["zwee", "two"],
    ]);
    const unlocked = computeUnlockedLessonIds(lessons, words);
    expect(unlocked).toEqual(["A1.01", "A1.02", "A1.03"]);
  });

  it("does not unlock lesson 3 if lesson 1 is done but lesson 2 is not", () => {
    // Only lesson 1 complete — lesson 2 blocks lesson 3
    const words = masteredWords([["Moien", "hi"], ["Äddi", "bye"]]);
    const unlocked = computeUnlockedLessonIds(lessons, words);
    expect(unlocked).not.toContain("A1.03");
  });
});

// ============================================================================
// computeOverallStats
// ============================================================================

describe("computeOverallStats", () => {
  it("returns zeros for empty word map", () => {
    const stats = computeOverallStats({});
    expect(stats).toEqual({
      totalWords: 0,
      masteredWords: 0,
      learningWords: 0,
      strugglingWords: 0,
      overallAccuracy: 0,
    });
  });

  it("correctly counts words by classification", () => {
    const words = {
      "a|a": s(5, 5, 0),   // mastered
      "b|b": s(5, 4, 1),   // mastered (0.8 accuracy)
      "c|c": s(3, 1, 2),   // struggling
      "d|d": s(2, 1, 1),   // learning
      "e|e": s(0, 0, 0),   // unseen → classifyWord returns "unseen", not counted in learning/struggling/mastered
    };
    const stats = computeOverallStats(words);
    expect(stats.totalWords).toBe(5);
    expect(stats.masteredWords).toBe(2);
    expect(stats.strugglingWords).toBe(1);
    expect(stats.learningWords).toBe(1);
  });

  it("computes overallAccuracy across all words", () => {
    const words = {
      "a|a": s(5, 4, 1),  // 4 correct, 1 incorrect
      "b|b": s(5, 2, 3),  // 2 correct, 3 incorrect
    };
    const stats = computeOverallStats(words);
    // totalCorrect=6, totalShown=6+4=15... wait: shown is separate from correct+incorrect
    // overallAccuracy = totalCorrect / (totalCorrect + totalIncorrect) = 6/10 = 0.6
    expect(stats.overallAccuracy).toBeCloseTo(6 / 10);
  });
});
