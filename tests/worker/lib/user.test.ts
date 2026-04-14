import { describe, it, expect } from "vitest";

import { mergeWordResults, mergeDailySession, computeStreak } from "../../../worker/lib/user.ts";
import type { WordResult } from "../../../worker/types.ts";

// ============================================================================
// mergeWordResults
// ============================================================================

describe("mergeWordResults", () => {
  const result = (key: string, shown: number, correct: number, incorrect: number): WordResult =>
    ({ key, shown, correct, incorrect });

  it("empty existing + results → results become the data", () => {
    const merged = mergeWordResults({}, [result("Moien|hi", 2, 1, 1)]);
    expect(merged["Moien|hi"]).toEqual({ shown: 2, correct: 1, incorrect: 1 });
  });

  it("overlapping keys accumulate counts", () => {
    const existing = { "Moien|hi": { shown: 3, correct: 2, incorrect: 1 } };
    const merged = mergeWordResults(existing, [result("Moien|hi", 2, 2, 0)]);
    expect(merged["Moien|hi"]).toEqual({ shown: 5, correct: 4, incorrect: 1 });
  });

  it("non-overlapping keys both preserved", () => {
    const existing = { "Moien|hi": { shown: 1, correct: 1, incorrect: 0 } };
    const merged = mergeWordResults(existing, [result("Äddi|bye", 1, 0, 1)]);
    expect(merged["Moien|hi"]).toEqual({ shown: 1, correct: 1, incorrect: 0 });
    expect(merged["Äddi|bye"]).toEqual({ shown: 1, correct: 0, incorrect: 1 });
  });

  it("shown accumulates independently of correct/incorrect", () => {
    const existing = { "Merci|thanks": { shown: 4, correct: 4, incorrect: 0 } };
    const merged = mergeWordResults(existing, [result("Merci|thanks", 3, 0, 0)]);
    expect(merged["Merci|thanks"]).toEqual({ shown: 7, correct: 4, incorrect: 0 });
  });

  it("empty results returns existing unchanged", () => {
    const existing = { "Moien|hi": { shown: 1, correct: 1, incorrect: 0 } };
    const merged = mergeWordResults(existing, []);
    expect(merged).toEqual(existing);
  });
});

// ============================================================================
// mergeDailySession
// ============================================================================

describe("mergeDailySession", () => {
  const result = (key: string, shown: number, correct: number, incorrect: number): WordResult =>
    ({ key, shown, correct, incorrect });

  it("creates new entry for a new date", () => {
    const merged = mergeDailySession({}, "2025-01-10", 5000, [result("Moien|hi", 2, 1, 1)]);
    expect(merged["2025-01-10"]).toEqual({
      totalItems: 2,
      durationSeconds: 5000,
      correct: 1,
      incorrect: 1,
    });
  });

  it("accumulates into existing entry for same date", () => {
    const existing = { "2025-01-10": { totalItems: 3, durationSeconds: 2000, correct: 2, incorrect: 1 } };
    const merged = mergeDailySession(existing, "2025-01-10", 3000, [result("Äddi|bye", 2, 2, 0)]);
    expect(merged["2025-01-10"]).toEqual({
      totalItems: 5,
      durationSeconds: 5000,
      correct: 4,
      incorrect: 1,
    });
  });

  it("preserves other dates when adding a new one", () => {
    const existing = { "2025-01-09": { totalItems: 1, durationSeconds: 1000, correct: 1, incorrect: 0 } };
    const merged = mergeDailySession(existing, "2025-01-10", 2000, [result("Moien|hi", 1, 1, 0)]);
    expect(merged["2025-01-09"]).toEqual(existing["2025-01-09"]);
    expect(merged["2025-01-10"]).toBeDefined();
  });

  it("empty results creates session with zero item counts", () => {
    const merged = mergeDailySession({}, "2025-01-10", 1000, []);
    expect(merged["2025-01-10"]).toEqual({
      totalItems: 0,
      durationSeconds: 1000,
      correct: 0,
      incorrect: 0,
    });
  });
});

// ============================================================================
// computeStreak
// ============================================================================

describe("computeStreak", () => {
  const sessions = (dates: string[]) =>
    dates.reduce<Record<string, object>>(
      (acc, d) => ({ ...acc, [d]: { totalItems: 1, durationSeconds: 1000, correct: 1, incorrect: 0 } }),
      {},
    );

  it("returns zeros for empty sessions", () => {
    expect(computeStreak({}, "2025-01-10")).toEqual({ current: 0, longest: 0 });
  });

  it.each([
    ["single day = today", ["2025-01-10"], "2025-01-10", { current: 1, longest: 1 }],
    ["single day = yesterday", ["2025-01-09"], "2025-01-10", { current: 1, longest: 1 }],
    ["single day = 2 days ago → current 0, longest 1", ["2025-01-08"], "2025-01-10", { current: 0, longest: 1 }],
    [
      "3 consecutive days ending today",
      ["2025-01-08", "2025-01-09", "2025-01-10"],
      "2025-01-10",
      { current: 3, longest: 3 },
    ],
    [
      "3 consecutive days ending yesterday",
      ["2025-01-07", "2025-01-08", "2025-01-09"],
      "2025-01-10",
      { current: 3, longest: 3 },
    ],
    [
      "gap breaks current streak, preserves longest",
      ["2025-01-01", "2025-01-02", "2025-01-03", "2025-01-07", "2025-01-08", "2025-01-09"],
      "2025-01-10",
      { current: 3, longest: 3 },
    ],
    [
      "longer historical streak than current",
      ["2025-01-01", "2025-01-02", "2025-01-03", "2025-01-04", "2025-01-05", "2025-01-09"],
      "2025-01-10",
      { current: 1, longest: 5 },
    ],
    [
      "month boundary crossing (Jan 31 → Feb 1)",
      ["2025-01-31", "2025-02-01", "2025-02-02"],
      "2025-02-02",
      { current: 3, longest: 3 },
    ],
    [
      "year boundary crossing (Dec 31 → Jan 1)",
      ["2024-12-31", "2025-01-01"],
      "2025-01-01",
      { current: 2, longest: 2 },
    ],
  ] as const)("%s", (_, dates, today, expected) => {
    expect(computeStreak(sessions([...dates]), today)).toEqual(expected);
  });
});
