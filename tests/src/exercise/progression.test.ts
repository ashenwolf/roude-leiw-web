import { describe, it, expect } from "vitest";

import {
  classifyWord,
  isElementMastered,
  computeLessonProgress,
  computeUnlockedLessonIds,
  computeOverallStats,
  phraseKey,
  isPhraseKey,
  isWordKey,
  MASTERY,
} from "../../../src/exercise/progression.ts";
import { MIN_ANSWERS, MASTERY_CORRECT_COUNT, UNLOCK_ELEMENT_THRESHOLD, UNLOCK_LESSON_THRESHOLD } from "../../../src/exercise/constants.ts";
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

describe("classifyWord — live accuracy-based classification", () => {
  it.each([
    // unseen
    ["undefined → unseen", undefined, "unseen"],
    ["shown=0 → unseen", s(0, 0, 0), "unseen"],
    // learning: shown > 0 but < MIN_ANSWERS (5) — not enough data
    ["shown=1 → learning", s(1, 1, 0), "learning"],
    ["shown=4 → learning (below MIN_ANSWERS)", s(4, 4, 0), "learning"],
    ["shown=4, many wrong → still learning (not enough shown)", s(4, 0, 4), "learning"],
    // mastered: shown >= MIN_ANSWERS AND accuracy >= 0.8
    ["shown=5, 5/0 → mastered (100%)", s(5, 5, 0), "mastered"],
    ["shown=5, 4/1 → mastered (80% = threshold)", s(5, 4, 1), "mastered"],
    ["shown=10, 8/2 → mastered (80%)", s(10, 8, 2), "mastered"],
    // struggling: shown >= MIN_ANSWERS AND accuracy < 0.8
    ["shown=5, 3/2 → struggling (60% < 80%)", s(5, 3, 2), "struggling"],
    ["shown=5, 0/5 → struggling (0%)", s(5, 0, 5), "struggling"],
    // struggling even when correct count is high — accuracy is what matters
    ["shown=5, 4 correct but was once mastered and regressed", s(5, 4, 20), "struggling"],
  ] as const)("%s", (_, input, expected) => {
    expect(classifyWord(input)).toBe(expected);
  });

  it("MASTERY constants match expected values", () => {
    expect(MASTERY.correctToMaster).toBe(MASTERY_CORRECT_COUNT);  // 4
    expect(MASTERY.accuracyThreshold).toBe(UNLOCK_ELEMENT_THRESHOLD);  // 0.8
    expect(MASTERY.minShown).toBe(MIN_ANSWERS);  // 5
  });
});

describe("isElementMastered — monotonic gate", () => {
  it("false when shown < MIN_ANSWERS, even with high correct count", () => {
    expect(isElementMastered(s(4, 4, 0))).toBe(false);
  });

  it("false when correct < MASTERY_CORRECT_COUNT, even with enough shown", () => {
    expect(isElementMastered(s(5, 3, 2))).toBe(false);
  });

  it("true when shown >= MIN_ANSWERS AND correct >= MASTERY_CORRECT_COUNT", () => {
    expect(isElementMastered(s(5, 4, 1))).toBe(true);
    expect(isElementMastered(s(5, 5, 0))).toBe(true);
  });

  it("remains true even after many wrong answers (monotonic)", () => {
    // correct=4 achieved mastery; subsequent wrong answers grow incorrect but not shown.
    // correct is still 4 — gate stays open.
    expect(isElementMastered(s(5, 4, 100))).toBe(true);
  });

  it("classifyWord may say 'struggling' while isElementMastered is true", () => {
    // Accuracy = 4/(4+100) ≈ 3.8% → struggling live; but correct=4 → mastered historically.
    const stats = s(5, 4, 100);
    expect(classifyWord(stats)).toBe("struggling");
    expect(isElementMastered(stats)).toBe(true);
  });

  it("undefined → false", () => {
    expect(isElementMastered(undefined)).toBe(false);
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
// computeLessonProgress  (monotonic gate: shown >= MIN_ANSWERS AND correct >= MASTERY_CORRECT_COUNT)
// ============================================================================

// An element "passes" iff isElementMastered: shown >= MIN_ANSWERS AND correct >= MASTERY_CORRECT_COUNT.
// Helper: a clearly passing stats entry (100% accuracy, correct = MIN_ANSWERS ≥ MASTERY_CORRECT_COUNT).
const passing = (extraShown = 0): WordStats =>
  s(MIN_ANSWERS + extraShown, MIN_ANSWERS + extraShown, 0);

// Minimum correct needed to pass — correct = MASTERY_CORRECT_COUNT, shown = MIN_ANSWERS.
const barelyPassing = (): WordStats => s(MIN_ANSWERS, MASTERY_CORRECT_COUNT, MIN_ANSWERS - MASTERY_CORRECT_COUNT);

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

  it("element at exactly MASTERY_CORRECT_COUNT correct passes (ignores extra incorrect)", () => {
    // correct=4, shown=5, incorrect=1 → isElementMastered=true regardless of accuracy
    const words = { "Moien|hi": barelyPassing() };
    const progress = computeLessonProgress(greetings, words);
    expect(progress.mastered).toBe(1);
  });

  it("element with correct >= MASTERY_CORRECT_COUNT but many wrong answers still passes (monotonic)", () => {
    // correct=4, shown=5, incorrect=100 → live accuracy ≈4% but isElementMastered=true
    const words = { "Moien|hi": s(5, 4, 100) };
    expect(computeLessonProgress(greetings, words).mastered).toBe(1);
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

  it("persistedUnlocked keeps a lesson available even if its predecessor drops below monotonic gate", () => {
    // The user passed A1.01 once (so A1.02 was persisted as unlocked), then
    // accumulated wrong answers — `correct` stays below MASTERY_CORRECT_COUNT (4)
    // and A1.02 must stay accessible via persistedUnlocked.
    const draggedDown = {
      // correct=3 < MASTERY_CORRECT_COUNT=4 → isElementMastered=false
      "Moien|hi": s(10, 3, 7),
      "Äddi|bye": s(10, 3, 7),
    };
    const withoutPersisted = computeUnlockedLessonIds(lessons, draggedDown);
    expect(withoutPersisted).not.toContain("A1.02");
    const withPersisted = computeUnlockedLessonIds(lessons, draggedDown, ["A1.02"]);
    expect(withPersisted).toContain("A1.02");
  });

  it("persistedUnlocked unions with currently-passing, never narrows it", () => {
    const words = allPassing([["Moien", "hi"], ["Äddi", "bye"]]);
    // Persisted set contains a lesson the stats also currently support.
    const unlocked = computeUnlockedLessonIds(lessons, words, ["A1.02"]);
    expect(unlocked).toContain("A1.01");
    expect(unlocked).toContain("A1.02");
    // No duplicate ids in the result.
    expect(new Set(unlocked).size).toBe(unlocked.length);
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
      masteredElements: 0,
      overallAccuracy: 0,
      totalSentences: 0,
      masteredSentences: 0,
    });
  });

  it("correctly counts words by classification", () => {
    const words = {
      "a|a": s(5, 5, 0),   // mastered: correct=5>=4; live=mastered (100%)
      "b|b": s(5, 4, 1),   // mastered: correct=4>=4; live=mastered (80%)
      "c|c": s(5, 4, 20),  // mastered (monotonic): correct=4>=4; live=struggling
      "d|d": s(5, 2, 3),   // NOT mastered: correct=2<4; live=struggling
      "e|e": s(3, 2, 1),   // NOT mastered: shown=3<5; live=learning
      "f|f": s(0, 0, 0),   // unseen
    };
    const stats = computeOverallStats(words);
    expect(stats.totalWords).toBe(6);
    expect(stats.masteredWords).toBe(3);          // a, b, c
    expect(stats.strugglingWords).toBe(2);        // c, d (live accuracy < 80%)
    expect(stats.learningWords).toBe(1);          // e (shown < 5)
    expect(stats.totalSentences).toBe(0);
    expect(stats.masteredElements).toBe(3);       // masteredWords + masteredSentences
  });

  it("phrase keys are excluded from word counts; en-lu direction counted as sentences", () => {
    const words = {
      "Moien|hi": s(3, 3, 0),
      [phraseKey("en-lu", "Good morning!")]: s(5, 4, 1),  // isElementMastered=true
      [phraseKey("lu-en", "Good morning!")]: s(1, 0, 1),  // isElementMastered=false
    };
    const stats = computeOverallStats(words);
    expect(stats.totalWords).toBe(1);
    expect(stats.totalSentences).toBe(1);         // one en-lu key = one sentence
    expect(stats.masteredSentences).toBe(1);
    expect(stats.masteredElements).toBe(0 + 1);  // 0 mastered words + 1 mastered sentence
  });

  it("overallAccuracy includes both words and phrases", () => {
    const words = {
      "a|a": s(5, 4, 1),                           // 4 correct, 1 incorrect
      "b|b": s(5, 2, 3),                           // 2 correct, 3 incorrect
      [phraseKey("en-lu", "Hello!")]: s(3, 3, 0),  // 3 correct, 0 incorrect — now included
    };
    const stats = computeOverallStats(words);
    // denominator = (correct+incorrect) per entry = 5 + 5 + 3 = 13
    // numerator   = correct per entry             = 4 + 2 + 3 = 9
    expect(stats.overallAccuracy).toBeCloseTo(9 / 13);
  });

  it("masteredElements = mastered words + mastered en-lu sentences (lu-en not double-counted)", () => {
    const words = {
      "word|one": s(5, 4, 0),                       // mastered word
      [phraseKey("en-lu", "Hi!")]: s(5, 4, 1),      // mastered en-lu sentence
      [phraseKey("lu-en", "Hi!")]: s(5, 4, 1),      // same sentence, lu-en — NOT counted again
    };
    const stats = computeOverallStats(words);
    expect(stats.masteredWords).toBe(1);
    expect(stats.masteredSentences).toBe(1);
    expect(stats.masteredElements).toBe(2);          // 1 word + 1 sentence, not 3
  });
});
