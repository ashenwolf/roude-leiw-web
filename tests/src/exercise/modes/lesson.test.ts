import { describe, it, expect } from "vitest";

import { planLessonMode } from "../../../../src/exercise/modes/lesson.ts";
import { LESSON_SLOTS_PER_BLOCK, LESSON_TOTAL_SLOTS } from "../../../../src/exercise/constants.ts";

import type { Lesson, SentenceEntry } from "../../../../src/exercise/letz-parser.ts";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const sentence = (firstEn: string, lu: string): SentenceEntry => ({
  enVariants: [firstEn],
  luVariants: [lu],
  distractorsEn: [],
  distractorsLu: [],
});

const lesson = (id: string, words: [string, string][], sentences: SentenceEntry[] = []): Lesson => ({
  meta: { id, title: id, level: "A1" },
  entries: words.map(([lu, en]) => ({ lu, en })),
  sentences,
});

// RNG that always rolls below the word-match threshold (0.2) → always picks word-match
const wordMatchRng = () => 0.1;
// RNG that always rolls above word-match threshold → always picks sentence-builder
const sentenceRng = () => 0.5;

// ─── Basic shape ──────────────────────────────────────────────────────────────

describe("planLessonMode — shape", () => {
  const lessons = [
    lesson("A1_01", [["Moien", "hi"], ["Äddi", "bye"]], [sentence("Good morning", "Gudde Moien")]),
    lesson("A1_02", [["Merci", "thanks"]], [sentence("Goodbye", "Äddi")]),
  ];

  it("returns LESSON_TOTAL_SLOTS planned slots", () => {
    const config = planLessonMode(lessons, "A1_02", wordMatchRng);
    expect(config.plannedSlots).toBe(LESSON_TOTAL_SLOTS);
  });

  it("queue length matches planned slots when enough words available", () => {
    const config = planLessonMode(lessons, "A1_02", wordMatchRng);
    expect(config.queue.length).toBe(LESSON_TOTAL_SLOTS);
  });

  it("blockBoundaries are [5, 10, 15]", () => {
    const config = planLessonMode(lessons, "A1_02");
    expect(config.blockBoundaries).toEqual([
      LESSON_SLOTS_PER_BLOCK,
      2 * LESSON_SLOTS_PER_BLOCK,
      3 * LESSON_SLOTS_PER_BLOCK,
    ]);
  });

  it("hasCorrectionBlock is true", () => {
    expect(planLessonMode(lessons, "A1_02").hasCorrectionBlock).toBe(true);
  });

  it("completionEffect is unlock-check", () => {
    expect(planLessonMode(lessons, "A1_02").completionEffect).toBe("unlock-check");
  });

  it("currentLessonId matches upperBoundId", () => {
    const config = planLessonMode(lessons, "A1_01");
    expect(config.currentLessonId).toBe("A1_01");
  });

  it("produces word-match slots when rng always picks word-match bucket", () => {
    const config = planLessonMode(lessons, "A1_02", wordMatchRng);
    expect(config.queue.every((s) => s.type === "word-match")).toBe(true);
  });
});

// ─── Upper-bound clamp ────────────────────────────────────────────────────────

describe("planLessonMode — upper-bound clamp", () => {
  const l01 = lesson("A1_01", [["Moien", "hi"], ["Äddi", "bye"]]);
  const l02 = lesson("A1_02", [["Merci", "thanks"]]);
  const l03 = lesson("A1_03", [["Jo", "yes"]]);

  it("clamps pool to lessons <= upperBoundId (lexicographic)", () => {
    // upperBound = A1_01 → only A1_01 is in pool → currentLessonId = A1_01
    const config = planLessonMode([l01, l02, l03], "A1_01", wordMatchRng);
    expect(config.currentLessonId).toBe("A1_01");
  });

  it("includes lessons up to but NOT beyond the upper bound", () => {
    // upperBound = A1_02 → pool = [A1_01, A1_02], A1_03 excluded
    const config = planLessonMode([l01, l02, l03], "A1_02");
    expect(config.currentLessonId).toBe("A1_02");
    // All pairs come from A1_01 or A1_02 — verify by checking no A1_03 word appears
    const allWords = config.queue
      .flatMap((b) => b.type === "word-match" ? b.pairs : [])
      .map(([lu]) => lu);
    expect(allWords.some((lu) => lu === "Jo")).toBe(false);
  });
});

// ─── Empty / edge cases ───────────────────────────────────────────────────────

describe("planLessonMode — edge cases", () => {
  it("returns empty queue when no lessons match upperBoundId", () => {
    const config = planLessonMode([], "A1_01");
    expect(config.queue).toHaveLength(0);
    expect(config.completionEffect).toBe("unlock-check");
  });

  it("handles lesson with only words (no sentences) — falls back to word-match", () => {
    const noSentences = lesson("A1_01", [["Moien", "hi"], ["Äddi", "bye"]]);
    // Force sentence-builder roll — should fall back to word-match since no sentences
    const config = planLessonMode([noSentences], "A1_01", sentenceRng);
    expect(config.queue.length).toBeGreaterThan(0);
    expect(config.queue.every((s) => s.type === "word-match")).toBe(true);
  });
});
