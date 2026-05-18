import { describe, it, expect } from "vitest";

import {
  classifyWord,
  computeLessonProgress,
  computeUnlockedLessonIds,
  computeOverallStats,
  phraseKey,
  isPhraseKey,
  isWordKey,
  MASTERY,
} from "../../../src/exercise/progression.ts";
import { MIN_ANSWERS, UNLOCK_ELEMENT_THRESHOLD, UNLOCK_LESSON_THRESHOLD } from "../../../src/exercise/constants.ts";
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

const sentence = (firstEn: string, ...luVariants: string[]): SentenceEntry => ({
  luVariants,
  enVariants: [firstEn],
});

// ============================================================================
// classifyWord — mastery is correct >= 3 (Duolingo-style)
// ============================================================================

describe("classifyWord", () => {
  it.each([
    // unseen
    ["undefined → unseen", undefined, "unseen"],
    ["shown=0 → unseen", s(0, 0, 0), "unseen"],
    // mastered: correct >= 3 regardless of incorrect count
    ["correct=3, incorrect=0 → mastered", s(3, 3, 0), "mastered"],
    ["correct=3, incorrect=20 → mastered (Duolingo-style)", s(23, 3, 20), "mastered"],
    ["correct=5 → mastered", s(5, 5, 0), "mastered"],
    // struggling: shown >= 3 AND accuracy < 0.6 AND not yet mastered
    ["shown=3, 1/3 correct (0.33) → struggling", s(3, 1, 2), "struggling"],
    ["shown=5, 2/5 correct (0.4) → struggling", s(5, 2, 3), "struggling"],
    // learning: shown > 0 but correct < 3 and not struggling
    ["correct=2, incorrect=0 → learning", s(2, 2, 0), "learning"],
    ["shown=2, 0/2 correct → learning (not enough shown for struggling)", s(2, 0, 2), "learning"],
  ] as const)("%s", (_, input, expected) => {
    expect(classifyWord(input)).toBe(expected);
  });

  it("MASTERY thresholds are applied correctly", () => {
    expect(MASTERY.correctToMaster).toBe(3);
    expect(MASTERY.strugglingMinShown).toBe(3);
    expect(MASTERY.strugglingMaxAccuracy).toBe(0.6);
  });
});

// ============================================================================
// phraseKey / isPhraseKey / isWordKey
// ============================================================================

describe("phraseKey helpers", () => {
  it('phraseKey("en-lu", ...) produces correct key', () => {
    expect(phraseKey("en-lu", "What is your name?")).toBe("phrase:en-lu:What is your name?");
  });

  it('phraseKey("lu-en", ...) produces correct key', () => {
    expect(phraseKey("lu-en", "What is your name?")).toBe("phrase:lu-en:What is your name?");
  });

  it("isPhraseKey recognises phrase keys", () => {
    expect(isPhraseKey("phrase:en-lu:Hello")).toBe(true);
    expect(isPhraseKey("phrase:lu-en:Hello")).toBe(true);
    expect(isPhraseKey("Moien|morning")).toBe(false);
  });

  it("isWordKey is the inverse of isPhraseKey", () => {
    expect(isWordKey("Moien|morning")).toBe(true);
    expect(isWordKey("phrase:en-lu:Hello")).toBe(false);
  });
});

// ============================================================================
// computeLessonProgress  (new formula: shown >= MIN_ANSWERS AND rate >= 0.8)
// ============================================================================

// An element "passes" iff shown >= MIN_ANSWERS AND correct/shown >= UNLOCK_ELEMENT_THRESHOLD.
// Helper: a passing stats entry.
const passing = (extraShown = 0): WordStats =>
  s(MIN_ANSWERS + extraShown, MIN_ANSWERS + extraShown, 0); // 100% accuracy, meets threshold

// An entry with enough showings but just below threshold rate (4/5 = 0.8 — exactly at threshold)
const borderline = (): WordStats => s(MIN_ANSWERS, Math.floor(MIN_ANSWERS * UNLOCK_ELEMENT_THRESHOLD), 1);

describe("computeLessonProgress", () => {
  const greetings = lesson("A1.01", ["Moien", "hi"], ["Äddi", "bye"], ["Merci", "thanks"]);

  it("no user words → 0% progress", () => {
    const progress = computeLessonProgress(greetings, {});
    expect(progress).toEqual({ total: 3, mastered: 0, percentage: 0, isComplete: false });
  });

  it("element with shown < MIN_ANSWERS does not pass, even with 100% accuracy", () => {
    const words = { "Moien|hi": s(MIN_ANSWERS - 1, MIN_ANSWERS - 1, 0) };
    expect(computeLessonProgress(greetings, words).mastered).toBe(0);
  });

  it("element with shown >= MIN_ANSWERS AND rate >= threshold passes", () => {
    const words = { "Moien|hi": passing() };
    expect(computeLessonProgress(greetings, words).mastered).toBe(1);
  });

  it("element at exactly UNLOCK_ELEMENT_THRESHOLD rate passes", () => {
    // 4/5 = 0.8 = UNLOCK_ELEMENT_THRESHOLD ✓
    const words = { "Moien|hi": s(MIN_ANSWERS, Math.round(MIN_ANSWERS * UNLOCK_ELEMENT_THRESHOLD), 1) };
    const progress = computeLessonProgress(greetings, words);
    expect(progress.mastered).toBe(1);
  });

  it("some elements passing → partial progress, isComplete false for 3-element lesson", () => {
    const words = { "Moien|hi": passing(), "Äddi|bye": passing() };
    const progress = computeLessonProgress(greetings, words);
    expect(progress.mastered).toBe(2);
    expect(progress.percentage).toBeCloseTo(2 / 3);
    // 2/3 = 0.667 < UNLOCK_LESSON_THRESHOLD (0.8) → not complete
    expect(progress.isComplete).toBe(false);
  });

  it("all elements passing → 100% complete (percentage >= UNLOCK_LESSON_THRESHOLD)", () => {
    const words = {
      "Moien|hi": passing(),
      "Äddi|bye": passing(),
      "Merci|thanks": passing(),
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

  it("5-element lesson: 4/5 passing (80%) → isComplete true", () => {
    const big = lesson("A1.02", ["a", "a"], ["b", "b"], ["c", "c"], ["d", "d"], ["e", "e"]);
    const words = {
      "a|a": passing(), "b|b": passing(), "c|c": passing(), "d|d": passing(),
      // "e|e" unseen
    };
    const progress = computeLessonProgress(big, words);
    expect(progress.mastered).toBe(4);
    expect(progress.percentage).toBeCloseTo(4 / 5);
    expect(progress.isComplete).toBe(true); // 0.8 >= 0.8 ✓
  });

  it("lesson with sentences — unpassed phrase counts toward total", () => {
    const lessonWithSentence: Lesson = {
      ...lesson("A1.01", ["Moien", "hi"], ["Äddi", "bye"]),
      sentences: [sentence("Good morning!", "Gudde Moien!")],
    };
    const words = { "Moien|hi": passing(), "Äddi|bye": passing() };
    const progress = computeLessonProgress(lessonWithSentence, words);
    expect(progress.total).toBe(3);
    expect(progress.mastered).toBe(2);
    expect(progress.isComplete).toBe(false);
  });

  it("lesson with sentences — passing phrase:en-lu counts toward completion", () => {
    const lessonWithSentence: Lesson = {
      ...lesson("A1.01", ["Moien", "hi"]),
      sentences: [sentence("Good morning!", "Gudde Moien!")],
    };
    const words = {
      "Moien|hi": passing(),
      [phraseKey("en-lu", "Good morning!")]: passing(),
    };
    const progress = computeLessonProgress(lessonWithSentence, words);
    expect(progress.total).toBe(2);
    expect(progress.mastered).toBe(2);
    expect(progress.isComplete).toBe(true);
  });

  it("lesson with sentences — passing phrase:lu-en does NOT count for progression", () => {
    const lessonWithSentence: Lesson = {
      ...lesson("A1.01", ["Moien", "hi"]),
      sentences: [sentence("Good morning!", "Gudde Moien!")],
    };
    const words = {
      "Moien|hi": passing(),
      [phraseKey("lu-en", "Good morning!")]: passing(), // wrong direction — excluded
    };
    const progress = computeLessonProgress(lessonWithSentence, words);
    expect(progress.mastered).toBe(1); // only the word
    expect(progress.isComplete).toBe(false);
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

  // "Fully passing" = every element meets shown >= MIN_ANSWERS AND rate >= threshold
  const allPassing = (pairs: [string, string][]) =>
    pairs.reduce<Record<string, WordStats>>(
      (acc, [lu, en]) => ({ ...acc, [`${lu}|${en}`]: passing() }),
      {},
    );

  it("always unlocks the first lesson", () => {
    const unlocked = computeUnlockedLessonIds(lessons, {});
    expect(unlocked).toContain("A1.01");
    expect(unlocked).not.toContain("A1.02");
  });

  it("unlocks next lesson when previous lesson passes the 80% threshold", () => {
    // Both A1.01 words pass → A1.01 percentage = 2/2 = 1.0 >= 0.8 → A1.02 unlocked
    const words = allPassing([["Moien", "hi"], ["Äddi", "bye"]]);
    const unlocked = computeUnlockedLessonIds(lessons, words);
    expect(unlocked).toContain("A1.01");
    expect(unlocked).toContain("A1.02");
    expect(unlocked).not.toContain("A1.03");
  });

  it("unlocks all when all prior lessons pass", () => {
    const words = allPassing([
      ["Moien", "hi"], ["Äddi", "bye"],
      ["eng", "one"], ["zwee", "two"],
    ]);
    const unlocked = computeUnlockedLessonIds(lessons, words);
    expect(unlocked).toEqual(["A1.01", "A1.02", "A1.03"]);
  });

  it("does not unlock lesson 3 if lesson 2 has not passed", () => {
    const words = allPassing([["Moien", "hi"], ["Äddi", "bye"]]);
    const unlocked = computeUnlockedLessonIds(lessons, words);
    expect(unlocked).not.toContain("A1.03");
  });

  it("lesson with shown < MIN_ANSWERS elements does NOT unlock next", () => {
    // Elements shown 3 times (< MIN_ANSWERS=5) — don't pass even with 100% accuracy
    const underShown = {
      "Moien|hi": s(MIN_ANSWERS - 1, MIN_ANSWERS - 1, 0),
      "Äddi|bye": s(MIN_ANSWERS - 1, MIN_ANSWERS - 1, 0),
    };
    const unlocked = computeUnlockedLessonIds(lessons, underShown);
    expect(unlocked).not.toContain("A1.02");
  });

  it("unlock is sticky — passing once is enough (stats are append-only)", () => {
    // A lesson that passes the 80% threshold stays unlocked in the future
    // because correct/shown only increases as user practices correctly.
    const words = allPassing([["Moien", "hi"], ["Äddi", "bye"]]);
    const u1 = computeUnlockedLessonIds(lessons, words);
    expect(u1).toContain("A1.02");
    // Simulating more practice (more shown, same accuracy) — still unlocked
    const moreShown = {
      "Moien|hi": s(MIN_ANSWERS + 5, MIN_ANSWERS + 5, 0),
      "Äddi|bye": s(MIN_ANSWERS + 5, MIN_ANSWERS + 5, 0),
    };
    const u2 = computeUnlockedLessonIds(lessons, moreShown);
    expect(u2).toContain("A1.02");
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
      totalPhrases: 0,
      masteredPhrases: 0,
    });
  });

  it("correctly counts words by classification", () => {
    const words = {
      "a|a": s(3, 3, 0),   // mastered (correct=3)
      "b|b": s(5, 3, 2),   // mastered (correct=3)
      "c|c": s(3, 1, 2),   // struggling
      "d|d": s(2, 1, 1),   // learning
      "e|e": s(0, 0, 0),   // unseen
    };
    const stats = computeOverallStats(words);
    expect(stats.totalWords).toBe(5);
    expect(stats.masteredWords).toBe(2);
    expect(stats.strugglingWords).toBe(1);
    expect(stats.learningWords).toBe(1);
    expect(stats.totalPhrases).toBe(0);
  });

  it("phrase keys are excluded from word counts", () => {
    const words = {
      "Moien|hi": s(3, 3, 0),
      [phraseKey("en-lu", "Good morning!")]: s(3, 3, 0),
      [phraseKey("lu-en", "Good morning!")]: s(1, 0, 1),
    };
    const stats = computeOverallStats(words);
    expect(stats.totalWords).toBe(1);
    expect(stats.totalPhrases).toBe(2);
    expect(stats.masteredPhrases).toBe(1);
  });

  it("computes overallAccuracy across word entries only", () => {
    const words = {
      "a|a": s(5, 4, 1),  // 4 correct, 1 incorrect
      "b|b": s(5, 2, 3),  // 2 correct, 3 incorrect
      [phraseKey("en-lu", "Hello!")]: s(3, 3, 0), // excluded from accuracy
    };
    const stats = computeOverallStats(words);
    expect(stats.overallAccuracy).toBeCloseTo(6 / 10);
  });
});
