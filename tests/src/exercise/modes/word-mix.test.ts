import { describe, it, expect } from "vitest";

import { planWordMixMode } from "../../../../src/exercise/modes/word-mix.ts";
import {
  WORD_MIX_TOTAL_SLOTS,
  WORD_MIX_PAIRS_PER_SLOT,
  MIN_ANSWERS,
} from "../../../../src/exercise/constants.ts";
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
});

// ─── Shape ────────────────────────────────────────────────────────────────────

describe("planWordMixMode — shape", () => {
  const lessons = [
    lesson("A1_01", [["Moien", "hi"], ["Äddi", "bye"]]),
    lesson("A1_02", [["Merci", "thanks"], ["Jo", "yes"]]),
  ];

  it("returns WORD_MIX_TOTAL_SLOTS planned slots", () => {
    const config = planWordMixMode(lessons, {});
    expect(config.plannedSlots).toBe(WORD_MIX_TOTAL_SLOTS);
    expect(config.queue.length).toBe(WORD_MIX_TOTAL_SLOTS);
  });

  it("every slot is a word-match exercise", () => {
    const config = planWordMixMode(lessons, {});
    expect(config.queue.every((s) => s.type === "word-match")).toBe(true);
  });

  it("each word-match slot has WORD_MIX_PAIRS_PER_SLOT pairs", () => {
    const config = planWordMixMode(lessons, {});
    config.queue.forEach((slot) => {
      if (slot.type === "word-match") {
        expect(slot.pairs).toHaveLength(WORD_MIX_PAIRS_PER_SLOT);
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
    const c1 = planWordMixMode(lessons, {}, fakeRng);
    const c2 = planWordMixMode(lessons, {}, fakeRng);
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
    const config = planWordMixMode(lessons, stats, errorsRng);

    // Every pair in every slot should be "Moien|hi" (the only error-pool word)
    const allWords = config.queue.flatMap((b) =>
      b.type === "word-match" ? b.pairs.map(([lu]) => lu) : [],
    );
    expect(allWords.every((lu) => lu === "Moien")).toBe(true);
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
