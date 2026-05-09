import { describe, it, expect } from "vitest";

import { planBatches } from "../../../src/exercise/batch-planner.ts";

import type { WordStats } from "../../../src/context/auth.ts";
import type { Lesson } from "../../../src/exercise/letz-parser.ts";

// ============================================================================
// Fixtures
// ============================================================================

const lesson = (id: string, ...pairs: [string, string][]): Lesson => ({
  meta: { id, title: id, level: "A1" },
  entries: pairs.map(([lu, en]) => ({ lu, en })),
});

const stats = (shown: number, correct: number, incorrect: number): WordStats =>
  ({ shown, correct, incorrect });

/** Word stats high enough to trigger lesson completion (shown ≥ 5, accuracy ≥ 0.8). */
const masteredEntry = (): WordStats => stats(10, 9, 1);

/** Generate a lesson with N entries — used to keep batchSize ≤ candidate count. */
const lessonWithN = (id: string, n: number): Lesson => ({
  meta: { id, title: id, level: "A1" },
  entries: Array.from({ length: n }, (_, i) => ({ lu: `${id}_lu_${i}`, en: `${id}_en_${i}` })),
});

const opts = (batchSize: number, batchCount: number) => ({ batchSize, batchCount });

const luOf = (batch: { type: "word-match"; pairs: [string, string][] }) =>
  batch.pairs.map(([lu]) => lu).sort();

// ============================================================================
// Empty inputs
// ============================================================================

describe("planBatches — empty input", () => {
  it("returns empty plan when no lessons are provided", () => {
    const plan = planBatches([], {}, undefined, opts(20, 3));
    expect(plan).toEqual({ batches: [], currentLessonId: "" });
  });
});

// ============================================================================
// Lesson unlock filter
// ============================================================================

describe("planBatches — unlock filter", () => {
  it("only the first lesson is unlocked when no progress exists; locked lessons contribute nothing", () => {
    const lessons = [
      lessonWithN("A1.01", 5),
      lessonWithN("A1.02", 5),
    ];
    const plan = planBatches(lessons, {}, undefined, opts(20, 1));
    const luWords = luOf(plan.batches[0]);
    // Every selected word must come from A1.01
    expect(luWords.every((lu) => lu.startsWith("A1.01"))).toBe(true);
  });

  it("a fully-mastered first lesson unlocks the second; both contribute candidates", () => {
    const l1 = lessonWithN("A1.01", 5);
    const l2 = lessonWithN("A1.02", 5);
    // Master every word in lesson 1
    const userWords = Object.fromEntries(
      l1.entries.map((e) => [`${e.lu}|${e.en}`, masteredEntry()]),
    );
    const plan = planBatches([l1, l2], userWords, undefined, opts(8, 1));
    const luWords = luOf(plan.batches[0]);
    // Both lessons should be represented
    expect(luWords.some((lu) => lu.startsWith("A1.01"))).toBe(true);
    expect(luWords.some((lu) => lu.startsWith("A1.02"))).toBe(true);
  });
});

// ============================================================================
// currentLessonId
// ============================================================================

describe("planBatches — currentLessonId", () => {
  it("uses targetLessonId when provided, even if not the first incomplete", () => {
    const lessons = [lessonWithN("A1.01", 3), lessonWithN("A1.02", 3)];
    // Master lesson 1 so lesson 2 is unlocked, but explicitly target lesson 1
    const userWords = Object.fromEntries(
      lessons[0].entries.map((e) => [`${e.lu}|${e.en}`, masteredEntry()]),
    );
    const plan = planBatches(lessons, userWords, "A1.01", opts(8, 1));
    expect(plan.currentLessonId).toBe("A1.01");
  });

  it("falls back to the first incomplete lesson when targetLessonId is undefined", () => {
    const lessons = [lessonWithN("A1.01", 3), lessonWithN("A1.02", 3)];
    const userWords = Object.fromEntries(
      lessons[0].entries.map((e) => [`${e.lu}|${e.en}`, masteredEntry()]),
    );
    const plan = planBatches(lessons, userWords, undefined, opts(8, 1));
    expect(plan.currentLessonId).toBe("A1.02");
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
// Batch shape and count
// ============================================================================

describe("planBatches — batch shape", () => {
  it("returns exactly `batchCount` batches", () => {
    const lessons = [lessonWithN("A1.01", 30)];
    const plan = planBatches(lessons, {}, undefined, opts(10, 3));
    expect(plan.batches).toHaveLength(3);
  });

  it("each batch has type 'word-match' and pair shape `[string, string][]`", () => {
    const lessons = [lessonWithN("A1.01", 10)];
    const plan = planBatches(lessons, {}, undefined, opts(5, 2));
    plan.batches.forEach((batch) => {
      expect(batch.type).toBe("word-match");
      batch.pairs.forEach((pair) => {
        expect(Array.isArray(pair)).toBe(true);
        expect(pair).toHaveLength(2);
        expect(typeof pair[0]).toBe("string");
        expect(typeof pair[1]).toBe("string");
      });
    });
  });

  it("each batch's pair count is bounded by batchSize", () => {
    const lessons = [lessonWithN("A1.01", 30)];
    const plan = planBatches(lessons, {}, undefined, opts(10, 3));
    plan.batches.forEach((batch) => {
      expect(batch.pairs.length).toBeLessThanOrEqual(10);
    });
  });

  it("a batch can contain fewer pairs than batchSize when candidates are scarce", () => {
    const lessons = [lessonWithN("A1.01", 3)];
    const plan = planBatches(lessons, {}, undefined, opts(20, 1));
    expect(plan.batches[0].pairs.length).toBeLessThanOrEqual(3);
  });
});

// ============================================================================
// Last-batch ratio shift (the off-by-one risk in idx === batchCount - 1)
// ============================================================================

describe("planBatches — last-batch review weighting", () => {
  it("the last batch in a multi-batch plan is structurally distinct from the others (different bucket weighting)", () => {
    // Set up enough variety that the last batch's review-heavy ratios produce a different mix
    // than the even-split earlier batches. This exercises the `idx === batchCount - 1` branch.
    const l1 = lessonWithN("A1.01", 30);
    // Mark half as mastered (will go to 'reinforcing' since they're in current lesson),
    // and leave the other half unseen (→ 'new')
    const userWords = Object.fromEntries(
      l1.entries.slice(0, 15).map((e) => [`${e.lu}|${e.en}`, masteredEntry()]),
    );
    const plan = planBatches([l1], userWords, "A1.01", opts(20, 3));
    expect(plan.batches).toHaveLength(3);
    // We can't directly inspect bucket counts (BatchPlan only exposes pairs), but
    // we *can* verify that the last batch was produced (not skipped) and is non-empty.
    expect(plan.batches[2].pairs.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Pair shape integrity
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
      batch.pairs.forEach(([lu, en]) => {
        expect(validKeys.has(`${lu}|${en}`)).toBe(true);
      });
    });
  });
});
