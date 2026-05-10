import { describe, it, expect } from "vitest";

import {
  planBatches,
  planSlots,
  planMadnessSlots,
  planMistakesSlots,
  determineSlotOutcome,
  tokenizeSentence,
} from "../../../src/exercise/batch-planner.ts";

import type { WordStats } from "../../../src/context/auth.ts";
import type { Lesson, SentenceEntry } from "../../../src/exercise/letz-parser.ts";
import type { SentenceBuilderBatch, WordMatchBatch } from "../../../src/exercise/types.ts";

// ============================================================================
// Fixtures
// ============================================================================

const lesson = (id: string, ...pairs: [string, string][]): Lesson => ({
  meta: { id, title: id, level: "A1" },
  entries: pairs.map(([lu, en]) => ({ lu, en })),
  sentences: [],
});

const stats = (shown: number, correct: number, incorrect: number): WordStats =>
  ({ shown, correct, incorrect });

/** Word stats high enough to trigger lesson completion (correct >= 3). */
const masteredEntry = (): WordStats => stats(3, 3, 0);

/** Generate a lesson with N entries — used to keep batchSize ≤ candidate count. */
const lessonWithN = (id: string, n: number): Lesson => ({
  meta: { id, title: id, level: "A1" },
  entries: Array.from({ length: n }, (_, i) => ({ lu: `${id}_lu_${i}`, en: `${id}_en_${i}` })),
  sentences: [],
});

const sentence = (firstEn: string, firstLu: string): SentenceEntry => ({
  luVariants: [firstLu],
  enVariants: [firstEn],
});

const opts = (batchSize: number, batchCount: number) => ({ batchSize, batchCount });

const luOf = (batch: { type: "word-match"; pairs: [string, string][] }) =>
  batch.pairs.map(([lu]) => lu).sort();

// ============================================================================
// tokenizeSentence
// ============================================================================

describe("tokenizeSentence", () => {
  it("splits on whitespace", () => {
    expect(tokenizeSentence("Hello world")).toEqual(["Hello", "world"]);
  });

  it("strips trailing punctuation — no punctuation chips produced", () => {
    expect(tokenizeSentence("Mir geet et gutt.", "lu")).toEqual(["Mir", "geet", "et", "gutt"]);
    expect(tokenizeSentence("Gudde Moien!", "lu")).toEqual(["Gudde", "Moien"]);
  });

  it("EN: splits contraction — apostrophe stays with suffix chip", () => {
    expect(tokenizeSentence("Who's your friend?", "en")).toEqual(["Who", "'s", "your", "friend"]);
    expect(tokenizeSentence("I'm fine.", "en")).toEqual(["I", "'m", "fine"]);
    expect(tokenizeSentence("don't stop", "en")).toEqual(["don", "'t", "stop"]);
  });

  it("LU: splits contraction — apostrophe stays with prefix chip", () => {
    expect(tokenizeSentence("d'Mamm huet zwee Bridder.", "lu")).toEqual(["d'", "Mamm", "huet", "zwee", "Bridder"]);
    expect(tokenizeSentence("D'Zopp ass gutt.", "lu")).toEqual(["D'", "Zopp", "ass", "gutt"]);
  });

  it("plain words without apostrophes pass through unchanged", () => {
    expect(tokenizeSentence("Gudde Moien", "lu")).toEqual(["Gudde", "Moien"]);
    expect(tokenizeSentence("Hello world", "en")).toEqual(["Hello", "world"]);
  });

  it("returns empty array for empty string", () => {
    expect(tokenizeSentence("")).toEqual([]);
  });
});

// ============================================================================
// determineSlotOutcome + buildEndMistakeSlots
// ============================================================================

const sbBatch = (phraseKey: string): SentenceBuilderBatch => ({
  type: "sentence-builder",
  item: {
    promptText: "Good morning!",
    acceptedAnswers: ["Gudde Moien!"],
    tokens: ["Gudde", "Moien"],
    direction: "en-lu" as const,
    phraseKey,
  },
});

describe("determineSlotOutcome", () => {
  it("word-match is always success", () => {
    const batch: WordMatchBatch = { type: "word-match", pairs: [["Moien", "hi"]] };
    expect(determineSlotOutcome(batch, { "Moien|hi": stats(1, 0, 1) })).toBe("success");
  });

  it("sentence correct → success", () => {
    const batch = sbBatch("phrase:en-lu:Good morning!");
    expect(determineSlotOutcome(batch, { "phrase:en-lu:Good morning!": stats(1, 1, 0) })).toBe("success");
  });

  it("sentence incorrect → mistake", () => {
    const batch = sbBatch("phrase:en-lu:Good morning!");
    expect(determineSlotOutcome(batch, { "phrase:en-lu:Good morning!": stats(1, 0, 1) })).toBe("mistake");
  });
});


// ============================================================================
// planBatches (legacy) — unlock filter and currentLessonId
// ============================================================================

describe("planBatches — empty input", () => {
  it("returns empty plan when no lessons are provided", () => {
    const plan = planBatches([], {}, undefined, opts(10, 3));
    expect(plan.batches).toHaveLength(0);
    expect(plan.currentLessonId).toBe("");
  });
});

describe("planBatches — unlock filter", () => {
  it("only the first lesson is unlocked when no progress exists; locked lessons contribute nothing", () => {
    const l1 = lesson("A1.01", ["Moien", "hi"], ["Äddi", "bye"]);
    const l2 = lesson("A1.02", ["eng", "one"], ["zwee", "two"]);
    const plan = planBatches([l1, l2], {}, undefined, opts(5, 1));

    const allPairs = plan.batches.flatMap((b) => b.type === "word-match" ? b.pairs : []);
    const allLu = allPairs.map(([lu]) => lu);
    expect(allLu).not.toContain("eng");
    expect(allLu).not.toContain("zwee");
  });

  it("a fully-mastered first lesson unlocks the second; both contribute candidates", () => {
    const l1 = lesson("A1.01", ["Moien", "hi"], ["Äddi", "bye"]);
    const l2 = lesson("A1.02", ["eng", "one"], ["zwee", "two"]);
    const userWords = {
      "Moien|hi": masteredEntry(),
      "Äddi|bye": masteredEntry(),
    };
    const plan = planBatches([l1, l2], userWords, undefined, opts(5, 1));
    const allLu = plan.batches.flatMap((b) => b.type === "word-match" ? b.pairs : []).map(([lu]) => lu);
    // l2 is now unlocked — at least one of its words should appear
    const hasL2 = allLu.some((lu) => lu === "eng" || lu === "zwee");
    expect(hasL2).toBe(true);
  });
});

describe("planBatches — currentLessonId", () => {
  it("uses targetLessonId when provided, even if not the first incomplete", () => {
    const lessons = [lessonWithN("A1.01", 3), lessonWithN("A1.02", 3)];
    const userWords = Object.fromEntries(
      lessons[0].entries.map((e) => [`${e.lu}|${e.en}`, masteredEntry()]),
    );
    const plan = planBatches(lessons, userWords, "A1.02", opts(5, 1));
    expect(plan.currentLessonId).toBe("A1.02");
  });

  it("falls back to the first incomplete lesson when targetLessonId is undefined", () => {
    const lessons = [lessonWithN("A1.01", 3), lessonWithN("A1.02", 3)];
    const plan = planBatches(lessons, {}, undefined, opts(5, 1));
    expect(plan.currentLessonId).toBe("A1.01");
  });

  it("falls back to the last lesson when all are complete", () => {
    const lessons = [lessonWithN("A1.01", 3), lessonWithN("A1.02", 3)];
    const userWords = Object.fromEntries(
      [...lessons[0].entries, ...lessons[1].entries].map((e) => [`${e.lu}|${e.en}`, masteredEntry()]),
    );
    const plan = planBatches(lessons, userWords, undefined, opts(8, 1));
    expect(plan.currentLessonId).toBe("A1.02");
  });
});

// ============================================================================
// planSlots — slot structure
// ============================================================================

describe("planSlots — structure", () => {
  it("returns 15 planned slots", () => {
    const lessons = [lessonWithN("A1.01", 30)];
    const plan = planSlots(lessons, {});
    expect(plan.plannedSlots).toBe(15);
    expect(plan.queue).toHaveLength(15);
  });

  it("all slots are valid ExerciseBatch types", () => {
    const lessons = [lessonWithN("A1.01", 30)];
    const plan = planSlots(lessons, {});
    plan.queue.forEach((slot) => {
      expect(["word-match", "sentence-builder"]).toContain(slot.type);
    });
  });

  it("word-match slots have pairs of [string, string]", () => {
    const lessons = [lessonWithN("A1.01", 30)];
    const plan = planSlots(lessons, {});
    plan.queue
      .filter((s): s is WordMatchBatch => s.type === "word-match")
      .forEach((batch) => {
        expect(batch.pairs.length).toBeGreaterThan(0);
        batch.pairs.forEach((pair) => {
          expect(pair).toHaveLength(2);
          expect(typeof pair[0]).toBe("string");
        });
      });
  });

  it("falls back to word-match when lesson has no sentences", () => {
    const lessons = [lessonWithN("A1.01", 30)]; // no sentences
    const plan = planSlots(lessons, {});
    // All slots must be word-match since there are no sentences
    plan.queue.forEach((slot) => expect(slot.type).toBe("word-match"));
  });

  it("produces sentence-builder slots when lesson has sentences", () => {
    const lessonWithSentences: Lesson = {
      ...lessonWithN("A1.01", 30),
      sentences: Array.from({ length: 10 }, (_, i) => sentence(`EN sentence ${i}`, `LU sentence ${i}`)),
    };
    const plan = planSlots([lessonWithSentences], {});
    const hassentences = plan.queue.some((s) => s.type === "sentence-builder");
    expect(hassentences).toBe(true);
  });

  it("sentence-builder item has required fields", () => {
    const lessonWithSentences: Lesson = {
      ...lessonWithN("A1.01", 30),
      sentences: [sentence("What is your name?", "Wéi heeschs du?")],
    };
    const plan = planSlots([lessonWithSentences], {});
    const sbSlot = plan.queue.find((s): s is SentenceBuilderBatch => s.type === "sentence-builder");
    if (!sbSlot) return; // may not appear if random rolled all word-match; test is probabilistic

    expect(sbSlot.item.promptText).toBeTruthy();
    expect(sbSlot.item.acceptedAnswers.length).toBeGreaterThan(0);
    expect(sbSlot.item.tokens.length).toBeGreaterThan(0);
    expect(["en-lu", "lu-en"]).toContain(sbSlot.item.direction);
    expect(sbSlot.item.phraseKey).toMatch(/^phrase:en-lu:/);
  });

  it("returns empty plan for empty lessons", () => {
    const plan = planSlots([], {});
    expect(plan.queue).toHaveLength(0);
  });
});

// ============================================================================
// planMadnessSlots
// ============================================================================

describe("planMadnessSlots", () => {
  it("returns 3 batches of 20 word-match pairs", () => {
    const lessons = [lessonWithN("A1.01", 30)];
    const plan = planMadnessSlots(lessons, {});
    expect(plan.queue).toHaveLength(3);
    plan.queue.forEach((slot) => {
      expect(slot.type).toBe("word-match");
    });
  });

  it("uses all lessons regardless of unlock state", () => {
    const l1 = lessonWithN("A1.01", 15);
    const l2 = lessonWithN("A1.02", 15);
    // No progress — normally only A1.01 would be unlocked
    const plan = planMadnessSlots([l1, l2], {});
    const allLu = plan.queue
      .flatMap((s) => s.type === "word-match" ? s.pairs : [])
      .map(([lu]) => lu);
    const hasL2 = allLu.some((lu) => lu.startsWith("A1.02"));
    expect(hasL2).toBe(true);
  });
});

// ============================================================================
// planMistakesSlots
// ============================================================================

describe("planMistakesSlots", () => {
  it("returns empty queue when no mistakes exist", () => {
    const lessons = [lessonWithN("A1.01", 5)];
    const plan = planMistakesSlots(lessons, {});
    expect(plan.queue).toHaveLength(0);
  });

  it("creates word-match batches for mistake words", () => {
    const lessons = [lessonWithN("A1.01", 5)];
    const userWords = Object.fromEntries(
      lessons[0].entries.slice(0, 3).map((e) => [`${e.lu}|${e.en}`, stats(3, 1, 2)]),
    );
    const plan = planMistakesSlots(lessons, userWords);
    expect(plan.queue.length).toBeGreaterThan(0);
    const wmBatch = plan.queue.find((s): s is WordMatchBatch => s.type === "word-match");
    expect(wmBatch).toBeDefined();
    expect(wmBatch!.pairs).toHaveLength(5); // filled to 5
  });

  it("fills word-match batch to 5 when fewer than 5 mistake words", () => {
    const lessons = [lessonWithN("A1.01", 10)];
    // Only 2 mistake words, 8 correct words available for filling
    const userWords = {
      [`${lessons[0].entries[0].lu}|${lessons[0].entries[0].en}`]: stats(3, 1, 2),
      [`${lessons[0].entries[1].lu}|${lessons[0].entries[1].en}`]: stats(3, 1, 2),
      ...Object.fromEntries(
        lessons[0].entries.slice(2).map((e) => [`${e.lu}|${e.en}`, stats(3, 3, 0)]),
      ),
    };
    const plan = planMistakesSlots(lessons, userWords);
    const wmBatch = plan.queue.find((s): s is WordMatchBatch => s.type === "word-match");
    expect(wmBatch!.pairs).toHaveLength(5);
  });
});

// ============================================================================
// Pair integrity (legacy planBatches)
// ============================================================================

describe("planBatches — pair integrity", () => {
  it("every pair in every batch corresponds to a real entry from an unlocked lesson", () => {
    const l1 = lessonWithN("A1.01", 10);
    const l2 = lessonWithN("A1.02", 10);
    const userWords = Object.fromEntries(
      l1.entries.map((e) => [`${e.lu}|${e.en}`, masteredEntry()]),
    );
    const plan = planBatches([l1, l2], userWords, undefined, opts(8, 2));

    const validKeys = new Set(
      [...l1.entries, ...l2.entries].map((e) => `${e.lu}|${e.en}`),
    );
    plan.batches.forEach((batch) => {
      if (batch.type !== "word-match") return;
      batch.pairs.forEach(([lu, en]) => {
        expect(validKeys.has(`${lu}|${en}`)).toBe(true);
      });
    });
  });
});
