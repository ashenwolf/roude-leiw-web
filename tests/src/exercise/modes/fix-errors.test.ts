import { describe, it, expect } from "vitest";

import { planFixErrorsMode } from "../../../../src/exercise/modes/fix-errors.ts";
import { LESSON_TOTAL_SLOTS, LESSON_SLOTS_PER_BLOCK, MIN_ANSWERS } from "../../../../src/exercise/constants.ts";
import { wordKey, phraseKey } from "../../../../src/exercise/progression.ts";

import type { WordStats } from "../../../../src/context/auth.ts";
import type { Lesson, SentenceEntry } from "../../../../src/exercise/letz-parser.ts";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const s = (shown: number, correct: number, incorrect: number): WordStats =>
  ({ shown, correct, incorrect });

const sentence = (firstEn: string, lu: string): SentenceEntry => ({
  enVariants: [firstEn],
  luVariants: [lu],
  distractorsEn: [],
  distractorsLu: [],
});

const lesson = (
  id: string,
  words: [string, string][],
  sentences: SentenceEntry[] = [],
): Lesson => ({
  meta: { id, title: id, level: "A1" },
  entries: words.map(([lu, en]) => ({ lu, en })),
  sentences,
});

// ─── Empty error pool ─────────────────────────────────────────────────────────

describe("planFixErrorsMode — empty error pool", () => {
  it("returns empty queue when no errors exist", () => {
    const lessons = [lesson("A1_01", [["Moien", "hi"]])];
    const config = planFixErrorsMode(lessons, {});
    expect(config.queue).toHaveLength(0);
  });

  it("completionEffect is noop even when empty", () => {
    expect(planFixErrorsMode([], {}).completionEffect).toBe("noop");
  });
});

// ─── Shape with errors ────────────────────────────────────────────────────────

describe("planFixErrorsMode — shape", () => {
  const errorWordStats = s(MIN_ANSWERS, 0, MIN_ANSWERS); // shown >= MIN_ANSWERS, 0% success

  it("produces LESSON_TOTAL_SLOTS slots when error pool is non-empty", () => {
    const lessons = [lesson("A1_01", [["Moien", "hi"], ["Äddi", "bye"]])];
    const stats = {
      [wordKey("Moien", "hi")]: errorWordStats,
      [wordKey("Äddi", "bye")]: errorWordStats,
    };
    const config = planFixErrorsMode(lessons, stats);
    expect(config.queue.length).toBe(LESSON_TOTAL_SLOTS);
  });

  it("blockBoundaries are [5, 10, 15]", () => {
    const lessons = [lesson("A1_01", [["Moien", "hi"], ["Äddi", "bye"]])];
    const stats = { [wordKey("Moien", "hi")]: errorWordStats };
    const config = planFixErrorsMode(lessons, stats);
    expect(config.blockBoundaries).toEqual([
      LESSON_SLOTS_PER_BLOCK,
      2 * LESSON_SLOTS_PER_BLOCK,
      3 * LESSON_SLOTS_PER_BLOCK,
    ]);
  });

  it("hasCorrectionBlock is true", () => {
    const lessons = [lesson("A1_01", [["Moien", "hi"]])];
    const stats = { [wordKey("Moien", "hi")]: errorWordStats };
    expect(planFixErrorsMode(lessons, stats).hasCorrectionBlock).toBe(true);
  });

  it("completionEffect is noop", () => {
    const lessons = [lesson("A1_01", [["Moien", "hi"]])];
    const stats = { [wordKey("Moien", "hi")]: errorWordStats };
    expect(planFixErrorsMode(lessons, stats).completionEffect).toBe("noop");
  });
});

// ─── Word-only error pool ─────────────────────────────────────────────────────

describe("planFixErrorsMode — word-only errors", () => {
  it("produces only word-match slots when rng always picks word-match", () => {
    const lessons = [lesson("A1_01", [["Moien", "hi"], ["Äddi", "bye"]])];
    const stats = {
      [wordKey("Moien", "hi")]: s(MIN_ANSWERS, 0, MIN_ANSWERS),
      [wordKey("Äddi", "bye")]: s(MIN_ANSWERS, 0, MIN_ANSWERS),
    };
    const wordMatchRng = () => 0.1; // always < 0.2 → word-match
    const config = planFixErrorsMode(lessons, stats, wordMatchRng);
    expect(config.queue.every((b) => b.type === "word-match")).toBe(true);
  });

  it("falls back to word-match when rng picks sentence-builder but no phrase errors", () => {
    const lessons = [lesson("A1_01", [["Moien", "hi"], ["Äddi", "bye"]])];
    const stats = { [wordKey("Moien", "hi")]: s(MIN_ANSWERS, 0, MIN_ANSWERS) };
    // Force sentence-builder roll — no phrase errors → should fall back to word-match
    const sentenceRng = () => 0.5;
    const config = planFixErrorsMode(lessons, stats, sentenceRng);
    expect(config.queue.length).toBeGreaterThan(0);
    expect(config.queue.every((b) => b.type === "word-match")).toBe(true);
  });
});

// ─── Phrase error pool ────────────────────────────────────────────────────────

describe("planFixErrorsMode — phrase errors", () => {
  it("produces sentence-builder slots when rng picks sentence and phrase errors exist", () => {
    const sent = sentence("Good morning", "Gudde Moien");
    const lessons = [
      lesson("A1_01", [["Moien", "hi"]], [sent]),
    ];
    const stats = {
      [wordKey("Moien", "hi")]: s(MIN_ANSWERS, 0, MIN_ANSWERS),
      [phraseKey("en-lu", "Good morning")]: s(MIN_ANSWERS, 0, MIN_ANSWERS),
    };
    const sentenceRng = () => 0.5; // > 0.2 → sentence-builder
    const config = planFixErrorsMode(lessons, stats, sentenceRng);
    expect(config.queue.some((b) => b.type === "sentence-builder")).toBe(true);
  });

  it("repeats the exact direction the user failed", () => {
    const sent = sentence("Good morning", "Gudde Moien");
    const lessons = [lesson("A1_01", [["Moien", "hi"]], [sent])];
    // Only the lu-en direction is in the error pool.
    const stats = {
      [phraseKey("lu-en", "Good morning")]: s(MIN_ANSWERS, 0, MIN_ANSWERS),
    };
    const sentenceRng = () => 0.5; // always sentence-builder
    const config = planFixErrorsMode(lessons, stats, sentenceRng);
    const sentenceSlots = config.queue.filter((b) => b.type === "sentence-builder");
    expect(sentenceSlots.length).toBeGreaterThan(0);
    for (const slot of sentenceSlots) {
      if (slot.type === "sentence-builder") expect(slot.item.direction).toBe("lu-en");
    }
  });
});

// ─── Global scope (course + exam content in one pool) ─────────────────────────

describe("planFixErrorsMode — global scope", () => {
  it("drills exam-track elements passed alongside course lessons", () => {
    const examSent: SentenceEntry = {
      ...sentence("We are going to France.", "Mir fueren a Frankräich."),
      question: "Wou fuert Dir?",
    };
    const lessons = [
      lesson("A1_01", [["Moien", "hi"]]),
      lesson("V1.03", [], [examSent]), // exam sub-lesson content, same Lesson shape
    ];
    const stats = {
      [phraseKey("en-lu", "We are going to France.")]: s(MIN_ANSWERS, 0, MIN_ANSWERS),
    };
    const sentenceRng = () => 0.5; // always sentence-builder
    const config = planFixErrorsMode(lessons, stats, sentenceRng);
    const sentenceSlots = config.queue.filter((b) => b.type === "sentence-builder");
    expect(sentenceSlots.length).toBeGreaterThan(0);
    for (const slot of sentenceSlots) {
      if (slot.type === "sentence-builder") {
        // The failed exam Q&A phrase is rebuilt WITH its examiner question.
        expect(slot.item.question).toBe("Wou fuert Dir?");
        expect(slot.item.direction).toBe("en-lu");
      }
    }
  });
});
