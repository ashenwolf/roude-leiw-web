import { describe, it, expect } from "vitest";

import {
  mergeWordResults,
  mergeDailySession,
  computeStreak,
  normalizeDailySession,
  normalizeDailySessions,
  MAX_WORD_KEYS,
  MAX_DAILY_SESSIONS,
} from "../../../worker/lib/user.ts";
import type { DailySession, WordResult } from "../../../worker/types.ts";

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

  it("drops new keys once existing map hits MAX_WORD_KEYS", () => {
    const full = Object.fromEntries(
      Array.from({ length: MAX_WORD_KEYS }, (_, i) => [`k${i}|v${i}`, { shown: 1, correct: 1, incorrect: 0 }]),
    );
    const merged = mergeWordResults(full, [result("brand|new", 1, 1, 0)]);
    expect(merged["brand|new"]).toBeUndefined();
    expect(Object.keys(merged)).toHaveLength(MAX_WORD_KEYS);
  });

  it("still accumulates existing keys at cap", () => {
    const full = Object.fromEntries(
      Array.from({ length: MAX_WORD_KEYS }, (_, i) => [`k${i}|v${i}`, { shown: 1, correct: 1, incorrect: 0 }]),
    );
    const merged = mergeWordResults(full, [result("k0|v0", 2, 1, 1)]);
    expect(merged["k0|v0"]).toEqual({ shown: 3, correct: 2, incorrect: 1 });
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
      totalItems: 2, durationSeconds: 5000, correct: 1, incorrect: 1, xp: 0,
    });
  });

  it("accumulates into existing entry for same date", () => {
    const existing = { "2025-01-10": { totalItems: 3, durationSeconds: 2000, correct: 2, incorrect: 1, xp: 0 } };
    const merged = mergeDailySession(existing, "2025-01-10", 3000, [result("Äddi|bye", 2, 2, 0)]);
    expect(merged["2025-01-10"]).toEqual({
      totalItems: 5, durationSeconds: 5000, correct: 4, incorrect: 1, xp: 0,
    });
  });

  it("preserves other dates when adding a new one", () => {
    const existing = { "2025-01-09": { totalItems: 1, durationSeconds: 1000, correct: 1, incorrect: 0, xp: 0 } };
    const merged = mergeDailySession(existing, "2025-01-10", 2000, [result("Moien|hi", 1, 1, 0)]);
    expect(merged["2025-01-09"]).toEqual(existing["2025-01-09"]);
    expect(merged["2025-01-10"]).toBeDefined();
  });

  it("empty results creates session with zero item counts", () => {
    const merged = mergeDailySession({}, "2025-01-10", 1000, []);
    expect(merged["2025-01-10"]).toEqual({
      totalItems: 0, durationSeconds: 1000, correct: 0, incorrect: 0, xp: 0,
    });
  });

  it("accumulates xpEarned into daily xp across multiple syncs", () => {
    const m1 = mergeDailySession({}, "2025-01-10", 0, [], 100);
    expect(m1["2025-01-10"].xp).toBe(100);
    const m2 = mergeDailySession(m1, "2025-01-10", 0, [], 90);
    expect(m2["2025-01-10"].xp).toBe(190);
  });

  it("drops oldest entries when exceeding MAX_DAILY_SESSIONS", () => {
    const dayMs = 86_400_000;
    const dateAt = (i: number) => new Date(i * dayMs).toISOString().slice(0, 10);
    const full = Object.fromEntries(
      Array.from({ length: MAX_DAILY_SESSIONS }, (_, i) => [
        dateAt(i),
        { totalItems: 1, durationSeconds: 1000, correct: 1, incorrect: 0 },
      ]),
    );
    const newest = dateAt(MAX_DAILY_SESSIONS);
    const merged = mergeDailySession(full, newest, 1000, []);
    expect(Object.keys(merged)).toHaveLength(MAX_DAILY_SESSIONS);
    expect(merged[newest]).toBeDefined();
    expect(merged[dateAt(0)]).toBeUndefined();
  });
});

// ============================================================================
// normalizeDailySession / normalizeDailySessions
// ============================================================================

describe("normalizeDailySession", () => {
  // Legacy fields are typed as a separate optional shape; cast through the
  // intersection so the fixtures compile without leaking the legacy type to
  // production call sites.
  const legacy = (raw: Record<string, number>) => raw as unknown as DailySession;

  it("passes through a current-shape record unchanged", () => {
    const current: DailySession = { totalItems: 10, durationSeconds: 60, correct: 9, incorrect: 1, xp: 100 };
    expect(normalizeDailySession(current)).toEqual(current);
  });

  it("maps legacy field names onto the current shape", () => {
    const legacyRecord = legacy({ totalPairs: 40, durationMs: 5000, correctMatches: 39, incorrectMatches: 1 });
    expect(normalizeDailySession(legacyRecord)).toEqual({
      totalItems: 40, durationSeconds: 5, correct: 39, incorrect: 1, xp: 0,
    });
  });

  it("defaults xp to 0 when the record predates xp tracking", () => {
    const noXp: DailySession = { totalItems: 5, durationSeconds: 10, correct: 5, incorrect: 0 };
    expect(normalizeDailySession(noXp).xp).toBe(0);
  });

  it("rounds durationMs → durationSeconds", () => {
    expect(normalizeDailySession(legacy({ durationMs: 1499 })).durationSeconds).toBe(1);
    expect(normalizeDailySession(legacy({ durationMs: 1500 })).durationSeconds).toBe(2);
  });

  it("yields zeros for an empty record", () => {
    expect(normalizeDailySession({} as DailySession)).toEqual({
      totalItems: 0, durationSeconds: 0, correct: 0, incorrect: 0, xp: 0,
    });
  });

  it("is idempotent — second pass returns the same value", () => {
    const legacyRecord = legacy({ totalPairs: 7, durationMs: 3500, correctMatches: 7, incorrectMatches: 0 });
    const once = normalizeDailySession(legacyRecord);
    const twice = normalizeDailySession(once);
    expect(twice).toEqual(once);
  });
});

describe("normalizeDailySessions", () => {
  it("normalizes every entry independently of the others", () => {
    const sessions = {
      "2026-02-23": { totalPairs: 40, durationMs: 0, correctMatches: 40, incorrectMatches: 2 },
      "2026-04-14": { totalItems: 117, durationSeconds: 140, correct: 117, incorrect: 10 },
      "2026-05-21": { totalItems: 0, durationSeconds: 0, correct: 0, incorrect: 0, xp: 1090 },
    } as unknown as Record<string, DailySession>;

    expect(normalizeDailySessions(sessions)).toEqual({
      "2026-02-23": { totalItems: 40, durationSeconds: 0, correct: 40, incorrect: 2, xp: 0 },
      "2026-04-14": { totalItems: 117, durationSeconds: 140, correct: 117, incorrect: 10, xp: 0 },
      "2026-05-21": { totalItems: 0, durationSeconds: 0, correct: 0, incorrect: 0, xp: 1090 },
    });
  });

  it("returns {} for an empty input", () => {
    expect(normalizeDailySessions({})).toEqual({});
  });

  it("downstream merges no longer produce NaN when accumulating onto a legacy date", () => {
    const sessions = normalizeDailySessions({
      "2026-02-23": { totalPairs: 40, durationMs: 0, correctMatches: 40, incorrectMatches: 2 },
    } as unknown as Record<string, DailySession>);
    const merged = mergeDailySession(sessions, "2026-02-23", 30, [
      { key: "Moien|hi", shown: 1, correct: 1, incorrect: 0 },
    ]);
    expect(merged["2026-02-23"]).toEqual({
      totalItems: 41, durationSeconds: 30, correct: 41, incorrect: 2, xp: 0,
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
