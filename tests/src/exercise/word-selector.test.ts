import { describe, it, expect } from "vitest";

import {
  lessonsToCandidates,
  selectItemsForBatch,
  type CandidateItem,
  type ItemSelectionConfig,
} from "../../../src/exercise/word-selector.ts";
import { wordKey } from "../../../src/exercise/progression.ts";

import type { WordStats } from "../../../src/context/auth.ts";
import type { Lesson, WordEntry } from "../../../src/exercise/letz-parser.ts";

// ============================================================================
// Fixtures
// ============================================================================

const lesson = (id: string, ...pairs: [string, string][]): Lesson => ({
  meta: { id, title: id, level: "A1" },
  entries: pairs.map(([lu, en]) => ({ lu, en })),
});

const stats = (shown: number, correct: number, incorrect: number): WordStats =>
  ({ shown, correct, incorrect });

/** Build a candidate from a (lu, en, lessonId) triple. */
const cand = (lu: string, en: string, lessonId: string): CandidateItem<WordEntry> => ({
  item: { lu, en },
  lessonId,
  key: wordKey(lu, en),
});

const evenRatios: ItemSelectionConfig = {
  batchSize: 8,
  bucketRatios: { new: 0.25, struggling: 0.25, reinforcing: 0.25, reviewing: 0.25 },
};

const keysOf = <T>(items: { item: T; lessonId: string }[]): string[] =>
  items.map((s) => {
    const e = s.item as unknown as WordEntry;
    return wordKey(e.lu, e.en);
  }).sort();

const bucketsOf = (items: { bucket: string }[]) =>
  items.reduce<Record<string, number>>(
    (acc, s) => ({ ...acc, [s.bucket]: (acc[s.bucket] ?? 0) + 1 }),
    {},
  );

// ============================================================================
// lessonsToCandidates
// ============================================================================

describe("lessonsToCandidates", () => {
  it("only includes entries from unlocked lessons", () => {
    const lessons = [
      lesson("A1.01", ["Moien", "hi"], ["Äddi", "bye"]),
      lesson("A1.02", ["Merci", "thanks"]),
    ];
    const candidates = lessonsToCandidates(lessons, ["A1.01"]);
    expect(candidates).toHaveLength(2);
    expect(candidates.every((c) => c.lessonId === "A1.01")).toBe(true);
  });

  it("returns empty when no lessons are unlocked", () => {
    const lessons = [lesson("A1.01", ["Moien", "hi"])];
    expect(lessonsToCandidates(lessons, [])).toEqual([]);
  });

  it("attaches a stable key in '{lu}|{en}' format and the source lessonId", () => {
    const lessons = [lesson("A1.01", ["Moien", "hi"])];
    const [c] = lessonsToCandidates(lessons, ["A1.01"]);
    expect(c.key).toBe("Moien|hi");
    expect(c.lessonId).toBe("A1.01");
    expect(c.item).toEqual({ lu: "Moien", en: "hi" });
  });
});

// ============================================================================
// selectItemsForBatch — bucket assignment
// ============================================================================

describe("selectItemsForBatch — bucket classification", () => {
  it("unseen words go to 'new'", () => {
    const candidates = [cand("a", "1", "L1"), cand("b", "2", "L1")];
    const selected = selectItemsForBatch(candidates, {}, "L1", new Set(), evenRatios);
    expect(selected.every((s) => s.bucket === "new")).toBe(true);
  });

  it("low-accuracy words (shown ≥ 3, accuracy < 0.6) go to 'struggling'", () => {
    const candidates = [cand("a", "1", "L1")];
    const userWords = { "a|1": stats(5, 1, 4) }; // 0.2 accuracy
    const selected = selectItemsForBatch(candidates, userWords, "L1", new Set(), evenRatios);
    expect(selected[0].bucket).toBe("struggling");
  });

  it("learning words (shown but not mastered/struggling) go to 'reinforcing'", () => {
    const candidates = [cand("a", "1", "L1")];
    const userWords = { "a|1": stats(5, 3, 1) }; // 0.75 accuracy → learning
    const selected = selectItemsForBatch(candidates, userWords, "L1", new Set(), evenRatios);
    expect(selected[0].bucket).toBe("reinforcing");
  });

  it("mastered words from the CURRENT lesson go to 'reinforcing'", () => {
    const candidates = [cand("a", "1", "L1")];
    const userWords = { "a|1": stats(10, 9, 1) }; // mastered
    const selected = selectItemsForBatch(candidates, userWords, "L1", new Set(), evenRatios);
    expect(selected[0].bucket).toBe("reinforcing");
  });

  it("mastered words from a DIFFERENT lesson go to 'reviewing'", () => {
    const candidates = [cand("a", "1", "L1")];
    const userWords = { "a|1": stats(10, 9, 1) }; // mastered
    const selected = selectItemsForBatch(candidates, userWords, "L2", new Set(), evenRatios);
    expect(selected[0].bucket).toBe("reviewing");
  });
});

// ============================================================================
// selectItemsForBatch — quotas, exclusion, overflow
// ============================================================================

describe("selectItemsForBatch — quotas & filling", () => {
  it("respects batchSize when all buckets have surplus (target counts hit exactly)", () => {
    // 8 candidates, all unseen → all go to 'new', but evenRatios gives 'new' a quota of 2
    // The remaining 6 slots are filled by overflow priority (struggling, reinforcing, reviewing, new)
    // Since only 'new' has items, overflow falls back to 'new' too.
    const candidates = Array.from({ length: 12 }, (_, i) => cand(`w${i}`, String(i), "L1"));
    const selected = selectItemsForBatch(candidates, {}, "L1", new Set(), evenRatios);
    expect(selected).toHaveLength(8);
  });

  it("excludeKeys filters out specified candidates", () => {
    const candidates = [
      cand("a", "1", "L1"),
      cand("b", "2", "L1"),
      cand("c", "3", "L1"),
    ];
    const exclude = new Set([wordKey("b", "2")]);
    const selected = selectItemsForBatch(candidates, {}, "L1", exclude, evenRatios);
    expect(keysOf(selected)).not.toContain("b|2");
    expect(keysOf(selected)).toContain("a|1");
    expect(keysOf(selected)).toContain("c|3");
  });

  it("when one bucket can't fill its quota, overflow distributes per priority [struggling, reinforcing, reviewing, new]", () => {
    // batchSize=4, ratios 0.25 each ⇒ target 1 per bucket.
    // Make 'new' empty (no unseen items), and supply exactly enough struggling/reinforcing/reviewing.
    // The 'new' quota of 1 should overflow → struggling gets the extra (priority order).
    const candidates = [
      cand("s1", "x", "L1"), cand("s2", "x", "L1"), // both will be struggling
      cand("r1", "x", "L1"),                          // will be reinforcing (mastered, current lesson)
      cand("v1", "x", "L1"),                          // will be reviewing (mastered, NOT current)
    ];
    const userWords = {
      "s1|x": stats(5, 1, 4),  // struggling
      "s2|x": stats(5, 1, 4),  // struggling
      "r1|x": stats(10, 9, 1), // mastered, in current lesson L1 → reinforcing
      "v1|x": stats(10, 9, 1), // mastered, but currentLessonId is L2 → reviewing
    };
    // Re-tag v1 to a different lesson so it lands in 'reviewing'
    candidates[3] = { ...candidates[3], lessonId: "L_OTHER" };

    const cfg: ItemSelectionConfig = {
      batchSize: 4,
      bucketRatios: { new: 0.25, struggling: 0.25, reinforcing: 0.25, reviewing: 0.25 },
    };
    const selected = selectItemsForBatch(candidates, userWords, "L1", new Set(), cfg);
    const counts = bucketsOf(selected);

    // 'new' had no candidates → its 1 slot overflows to struggling first
    expect(counts.struggling).toBe(2);
    expect(counts.reinforcing).toBe(1);
    expect(counts.reviewing).toBe(1);
    expect(counts.new ?? 0).toBe(0);
    expect(selected).toHaveLength(4);
  });

  it("never returns the same candidate twice", () => {
    const candidates = Array.from({ length: 5 }, (_, i) => cand(`w${i}`, String(i), "L1"));
    const cfg: ItemSelectionConfig = {
      batchSize: 20,
      bucketRatios: { new: 0.5, struggling: 0.5, reinforcing: 0.5, reviewing: 0.5 },
    };
    const selected = selectItemsForBatch(candidates, {}, "L1", new Set(), cfg);
    const keys = keysOf(selected);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("does not exceed available candidates even if batchSize is larger", () => {
    const candidates = [cand("a", "1", "L1"), cand("b", "2", "L1")];
    const cfg: ItemSelectionConfig = {
      batchSize: 20,
      bucketRatios: { new: 0.25, struggling: 0.25, reinforcing: 0.25, reviewing: 0.25 },
    };
    const selected = selectItemsForBatch(candidates, {}, "L1", new Set(), cfg);
    expect(selected).toHaveLength(2);
  });

  it("returns an empty selection for empty input", () => {
    expect(selectItemsForBatch([], {}, "L1", new Set(), evenRatios)).toEqual([]);
  });
});

// ============================================================================
// selectItemsForBatch — output shape
// ============================================================================

describe("selectItemsForBatch — output", () => {
  it("preserves item and lessonId, attaches the assigned bucket", () => {
    const candidates = [cand("a", "1", "L1")];
    const [s] = selectItemsForBatch(candidates, {}, "L1", new Set(), evenRatios);
    expect(s.item).toEqual({ lu: "a", en: "1" });
    expect(s.lessonId).toBe("L1");
    expect(s.bucket).toBe("new");
  });
});
