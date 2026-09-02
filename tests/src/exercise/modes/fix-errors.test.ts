import { describe, it, expect } from "vitest";

import { planFixErrorsMode } from "../../../../src/exercise/modes/fix-errors.ts";
import { LESSON, MIN_ANSWERS, MIN_WORD_MATCH_PAIRS } from "../../../../src/exercise/constants.ts";
import { wordKey, phraseKey, fillKey } from "../../../../src/exercise/progression.ts";

import type { WordStats } from "../../../../src/context/auth.ts";
import type { FillEntry, Lesson, SentenceEntry } from "../../../../src/exercise/letz-parser.ts";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const s = (shown: number, correct: number, incorrect: number): WordStats =>
  ({ shown, correct, incorrect });

const sentence = (firstEn: string, lu: string): SentenceEntry => ({
  enVariants: [firstEn],
  luVariants: [lu],
  distractorsEn: [],
  distractorsLu: [],
});

const fill = (en: string, lu: string): FillEntry => ({ lu, en });

const lesson = (
  id: string,
  words: [string, string][],
  sentences: SentenceEntry[] = [],
  fills: FillEntry[] = [],
): Lesson => ({
  meta: { id, title: id, level: "A1" },
  entries: words.map(([lu, en]) => ({ lu, en })),
  sentences,
  fills,
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

// ─── Degenerate word-match slots ──────────────────────────────────────────────

describe("planFixErrorsMode — word-match slots stay failable", () => {
  const errorWordStats = s(MIN_ANSWERS, 0, MIN_ANSWERS);
  const distinctCounts = (config: ReturnType<typeof planFixErrorsMode>) =>
    config.queue
      .filter((ex) => ex.type === "word-match")
      .map((ex) => (ex.type === "word-match" ? new Set(ex.pairs.map(([lu]) => lu)).size : 0));

  // A Slot of one distinct word cannot be failed: WordMatch matches by value, so
  // every pairing is correct and each tap still books a `correct`.
  it("never builds a slot below MIN_WORD_MATCH_PAIRS distinct words", () => {
    const lessons = [lesson("A1_01", [["Moien", "hi"], ["Äddi", "bye"], ["Merci", "thanks"]])];
    const stats = { [wordKey("Moien", "hi")]: errorWordStats };
    const counts = distinctCounts(planFixErrorsMode(lessons, stats));
    expect(counts.length).toBeGreaterThan(0);
    counts.forEach((n) => expect(n).toBeGreaterThanOrEqual(MIN_WORD_MATCH_PAIRS));
  });

  it("pads a single-word error pool with non-error words rather than repeating it", () => {
    const lessons = [
      lesson("A1_01", [
        ["Moien", "hi"],
        ["Äddi", "bye"],
        ["Merci", "thanks"],
        ["Jo", "yes"],
        ["Nee", "no"],
        ["Wann ech gelift", "please"],
      ]),
    ];
    const stats = { [wordKey("Moien", "hi")]: errorWordStats };
    const config = planFixErrorsMode(lessons, stats);
    const wordSlots = config.queue.filter((ex) => ex.type === "word-match");

    expect(wordSlots.length).toBeGreaterThan(0);
    wordSlots.forEach((ex) => {
      if (ex.type !== "word-match") return;
      const lus = ex.pairs.map(([lu]) => lu);
      expect(new Set(lus).size).toBe(lus.length);
      expect(lus).toContain("Moien");
    });
  });

  // The Home button enables on a non-empty error pool, so an empty queue here
  // would strand the user on "No mistakes to fix".
  it("still fills a session when one word is the only error", () => {
    const lessons = [
      lesson("A1_01", [["Moien", "hi"], ["Äddi", "bye"], ["Merci", "thanks"], ["Jo", "yes"]]),
    ];
    const stats = { [wordKey("Moien", "hi")]: errorWordStats };
    expect(planFixErrorsMode(lessons, stats).queue).toHaveLength(LESSON.totalSlots);
  });

  // Padding must not invent content: with too few words overall, the Mode rolls a
  // phrase instead of a short slot.
  it("falls back to a phrase when no padding is available", () => {
    const lessons = [
      lesson("A1_01", [["Moien", "hi"]], [sentence("Good morning", "Gudde Moien")]),
    ];
    const stats = {
      [wordKey("Moien", "hi")]: errorWordStats,
      [phraseKey("en-lu", "Good morning")]: errorWordStats,
    };
    const config = planFixErrorsMode(lessons, stats);
    expect(config.queue).toHaveLength(LESSON.totalSlots);
    expect(config.queue.every((ex) => ex.type === "sentence-builder")).toBe(true);
  });
});

// ─── Shape with errors ────────────────────────────────────────────────────────

describe("planFixErrorsMode — shape", () => {
  const errorWordStats = s(MIN_ANSWERS, 0, MIN_ANSWERS); // shown >= MIN_ANSWERS, 0% success

  it("produces LESSON.totalSlots slots when error pool is non-empty", () => {
    const lessons = [lesson("A1_01", [["Moien", "hi"], ["Äddi", "bye"]])];
    const stats = {
      [wordKey("Moien", "hi")]: errorWordStats,
      [wordKey("Äddi", "bye")]: errorWordStats,
    };
    const config = planFixErrorsMode(lessons, stats);
    expect(config.queue.length).toBe(LESSON.totalSlots);
  });

  it("blockBoundaries are [5, 10, 15]", () => {
    const lessons = [lesson("A1_01", [["Moien", "hi"], ["Äddi", "bye"]])];
    const stats = { [wordKey("Moien", "hi")]: errorWordStats };
    const config = planFixErrorsMode(lessons, stats);
    expect(config.blockBoundaries).toEqual([
      LESSON.slotsPerBlock,
      2 * LESSON.slotsPerBlock,
      3 * LESSON.slotsPerBlock,
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
    const config = planFixErrorsMode(lessons, stats, [], wordMatchRng);
    expect(config.queue.every((b) => b.type === "word-match")).toBe(true);
  });

  it("falls back to word-match when rng picks sentence-builder but no phrase errors", () => {
    const lessons = [lesson("A1_01", [["Moien", "hi"], ["Äddi", "bye"]])];
    const stats = { [wordKey("Moien", "hi")]: s(MIN_ANSWERS, 0, MIN_ANSWERS) };
    // Force sentence-builder roll — no phrase errors → should fall back to word-match
    const sentenceRng = () => 0.5;
    const config = planFixErrorsMode(lessons, stats, [], sentenceRng);
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
    const config = planFixErrorsMode(lessons, stats, [], sentenceRng);
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
    const config = planFixErrorsMode(lessons, stats, [], sentenceRng);
    const sentenceSlots = config.queue.filter((b) => b.type === "sentence-builder");
    expect(sentenceSlots.length).toBeGreaterThan(0);
    for (const slot of sentenceSlots) {
      if (slot.type === "sentence-builder") expect(slot.item.direction).toBe("lu-en");
    }
  });
});

// ─── Fill error pool ──────────────────────────────────────────────────────────

describe("planFixErrorsMode — fill errors", () => {
  const item = fill("I [see] the wheel", "Ech [gesinn] d'Rad");
  const fillRng = () => 0.9; // > 0.75 → fill-blank

  it("produces fill-blank slots when rng picks fill and fill errors exist", () => {
    const lessons = [lesson("A1_01", [["Moien", "hi"]], [], [item])];
    const stats = { [fillKey("en-lu", item.en)]: s(MIN_ANSWERS, 0, MIN_ANSWERS) };

    const config = planFixErrorsMode(lessons, stats, [], fillRng);

    expect(config.queue.every((b) => b.type === "fill-blank")).toBe(true);
    expect(config.queue.length).toBe(LESSON.totalSlots);
  });

  it("repeats the exact direction the fill was failed in", () => {
    const lessons = [lesson("A1_01", [], [], [item])];
    // Only lu-en is in the error pool — no direction roll may override it.
    const stats = { [fillKey("lu-en", item.en)]: s(MIN_ANSWERS, 0, MIN_ANSWERS) };

    const config = planFixErrorsMode(lessons, stats, [], fillRng);

    for (const slot of config.queue) {
      if (slot.type === "fill-blank") expect(slot.item.direction).toBe("lu-en");
    }
    expect(config.queue.length).toBeGreaterThan(0);
  });

  it("re-rolls to another type when the fill pool is empty", () => {
    const lessons = [lesson("A1_01", [["Moien", "hi"], ["Äddi", "bye"], ["Merci", "thanks"]])];
    // Two errors, one clean word left to pad with, so a word-match Slot is playable.
    const stats = {
      [wordKey("Moien", "hi")]: s(MIN_ANSWERS, 0, MIN_ANSWERS),
      [wordKey("Äddi", "bye")]: s(MIN_ANSWERS, 0, MIN_ANSWERS),
    };

    const config = planFixErrorsMode(lessons, stats, [], fillRng);

    expect(config.queue.length).toBe(LESSON.totalSlots);
    expect(config.queue.every((b) => b.type === "word-match")).toBe(true);
  });

  it("falls back to a fill slot when it is the only non-empty pool", () => {
    const lessons = [lesson("A1_01", [], [], [item])];
    const stats = { [fillKey("en-lu", item.en)]: s(MIN_ANSWERS, 0, MIN_ANSWERS) };
    const wordMatchRng = () => 0.1; // always rolls word-match, whose pool is empty

    const config = planFixErrorsMode(lessons, stats, [], wordMatchRng);

    expect(config.queue.every((b) => b.type === "fill-blank")).toBe(true);
    expect(config.queue.length).toBe(LESSON.totalSlots);
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
    const config = planFixErrorsMode(lessons, stats, [], sentenceRng);
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
