import { describe, it, expect } from "vitest";

import { planWordMixMode } from "../../../../src/exercise/modes/word-mix.ts";
import { MIN_ANSWERS, WORD_MIX } from "../../../../src/exercise/constants.ts";
import { wordKey } from "../../../../src/exercise/progression.ts";

import type { WordStats } from "../../../../src/context/auth.ts";
import type { Lesson } from "../../../../src/exercise/letz-parser.ts";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const s = (shown: number, correct: number, incorrect: number): WordStats =>
  ({ shown, correct, incorrect });

const lesson = (id: string, words: [string, string][]): Lesson => ({
  meta: { id, title: id, level: "A1" },
  entries: words.map(([lu, en]) => ({ lu, en })),
  sentences: [],
  fills: [],
});

// ─── Shape ────────────────────────────────────────────────────────────────────

describe("planWordMixMode — shape", () => {
  const lessons = [
    lesson("A1_01", [["Moien", "hi"], ["Äddi", "bye"]]),
    lesson("A1_02", [["Merci", "thanks"], ["Jo", "yes"]]),
  ];

  it("returns WORD_MIX.totalSlots planned slots", () => {
    const config = planWordMixMode(lessons, {});
    expect(config.plannedSlots).toBe(WORD_MIX.totalSlots);
    expect(config.queue.length).toBe(WORD_MIX.totalSlots);
  });

  it("every slot is a word-match exercise", () => {
    const config = planWordMixMode(lessons, {});
    expect(config.queue.every((s) => s.type === "word-match")).toBe(true);
  });

  it("each word-match slot has WORD_MIX.pairsPerSlot pairs", () => {
    const config = planWordMixMode(lessons, {});
    config.queue.forEach((slot) => {
      if (slot.type === "word-match") {
        expect(slot.pairs).toHaveLength(WORD_MIX.pairsPerSlot);
      }
    });
  });

  it("blockBoundaries are [1, 2, 3]", () => {
    expect(planWordMixMode(lessons, {}).blockBoundaries).toEqual([1, 2, 3]);
  });

  it("hasCorrectionBlock is false", () => {
    expect(planWordMixMode(lessons, {}).hasCorrectionBlock).toBe(false);
  });

  it("completionEffect is noop", () => {
    expect(planWordMixMode(lessons, {}).completionEffect).toBe("noop");
  });
});

// ─── One-shot planning ────────────────────────────────────────────────────────

describe("planWordMixMode — one-shot planning", () => {
  it("seeded rng produces deterministic output", () => {
    const lessons = [lesson("A1_01", [["Moien", "hi"], ["Äddi", "bye"]])];
    const fakeRng = () => 0.6; // always picks 'previous' bucket (no-op for single lesson)
    const c1 = planWordMixMode(lessons, {}, [], fakeRng);
    const c2 = planWordMixMode(lessons, {}, [], fakeRng);
    // Same rng sequence → same pairs (rng restarts each call since it's a pure fn)
    expect(c1.queue[0]).toEqual(c2.queue[0]);
  });
});

// ─── Error pool bucket ────────────────────────────────────────────────────────

describe("planWordMixMode — error pool", () => {
  it("includes error pool words when errors exist and roll hits errors bucket", () => {
    const lessons = [
      lesson("A1_01", [["Moien", "hi"], ["Äddi", "bye"]]),
    ];
    // Mark "Moien|hi" as an error-pool word (shown >= MIN_ANSWERS, low success rate)
    const stats = { [wordKey("Moien", "hi")]: s(MIN_ANSWERS, 0, MIN_ANSWERS) };

    // rng always < 0.25 → always picks 'errors' bucket
    const errorsRng = () => 0.1;
    const config = planWordMixMode(lessons, stats, [], errorsRng);

    // Every pair in every slot should be "Moien|hi" (the only error-pool word)
    const allWords = config.queue.flatMap((b) =>
      b.type === "word-match" ? b.pairs.map(([lu]) => lu) : [],
    );
    expect(allWords.every((lu) => lu === "Moien")).toBe(true);
  });
});

// ─── Cursor vs frontier ───────────────────────────────────────────────────────

describe("planWordMixMode — cursor vs frontier", () => {
  const lessons = [
    lesson("A1_01", [["Moien", "hi"], ["Äddi", "bye"]]),
    lesson("A1_02", [["Merci", "thanks"], ["Jo", "yes"]]),
  ];
  // A1_01 fully passed → A1_02 unlocked and is the first unfinished lesson.
  const a1_01Done = {
    [wordKey("Moien", "hi")]: s(5, 5, 0),
    [wordKey("Äddi", "bye")]: s(5, 5, 0),
  };

  it("'current' bucket follows the cursor onto the newly unlocked lesson", () => {
    // A1_01 passed → cursor advances to A1_02 (unlocked, untouched).
    const currentRng = () => 0.4; // [0.25, 0.5) → 'current' bucket
    const config = planWordMixMode(lessons, a1_01Done, [], currentRng);
    expect(config.currentLessonId).toBe("A1_02");
    const lus = config.queue.flatMap((b) => (b.type === "word-match" ? b.pairs.map(([lu]) => lu) : []));
    expect(lus.every((lu) => ["Merci", "Jo"].includes(lu))).toBe(true);
  });

  it("cursor stays on an unfinished lesson below a sticky-unlocked frontier", () => {
    // A1_01 half done but A1_02 sticky-unlocked: cursor = A1_01, frontier = A1_02.
    const stats = { [wordKey("Moien", "hi")]: s(5, 5, 0) };
    const currentRng = () => 0.4; // 'current' bucket
    const config = planWordMixMode(lessons, stats, ["A1_02"], currentRng);
    expect(config.currentLessonId).toBe("A1_01");
    const lus = config.queue.flatMap((b) => (b.type === "word-match" ? b.pairs.map(([lu]) => lu) : []));
    expect(lus.every((lu) => ["Moien", "Äddi"].includes(lu))).toBe(true);
  });

  it("pool still spans the whole unlocked range when the cursor sits below it", () => {
    // 'previous' must reach A1_02's words — the pool is frontier-bounded, not
    // cursor-bounded, so review keeps covering already-unlocked later lessons.
    const stats = { [wordKey("Moien", "hi")]: s(5, 5, 0) };
    const previousRng = () => 0.7; // [0.5, 1) → 'previous' bucket
    const config = planWordMixMode(lessons, stats, ["A1_02"], previousRng);
    expect(config.currentLessonId).toBe("A1_01");
    const lus = config.queue.flatMap((b) => (b.type === "word-match" ? b.pairs.map(([lu]) => lu) : []));
    expect(lus.every((lu) => ["Merci", "Jo"].includes(lu))).toBe(true);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe("planWordMixMode — edge cases", () => {
  it("returns empty queue when no lessons", () => {
    const config = planWordMixMode([], {});
    expect(config.queue).toHaveLength(0);
    expect(config.completionEffect).toBe("noop");
  });
});
