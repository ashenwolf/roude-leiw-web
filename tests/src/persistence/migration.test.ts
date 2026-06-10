/**
 * buildMigrationChunks — the guest→auth migration splitter.
 *
 * Every chunk must individually satisfy the server bounds enforced by
 * worker/lib/validators.ts, and the sum of all chunks must reconstruct the
 * guest's lifetime totals exactly (the server merge is additive).
 */
import { describe, it, expect } from "vitest";

import { buildMigrationChunks } from "../../../src/persistence/migration.ts";

import type { MigrationChunk } from "../../../src/persistence/migration.ts";
import type { GuestData } from "../../../src/persistence/hooks/use-guest-progress.ts";
import type { WordStats, DailySession } from "../../../src/context/auth.ts";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const s = (shown: number, correct: number, incorrect: number): WordStats =>
  ({ shown, correct, incorrect });

const day = (durationSeconds: number, xp = 0): DailySession =>
  ({ totalItems: 0, durationSeconds, correct: 0, incorrect: 0, xp });

const guest = (
  words: Record<string, WordStats> = {},
  dailySessions: Record<string, DailySession> = {},
  unlockedLessons: string[] = [],
): GuestData => ({ words, dailySessions, unlockedLessons });

// Server bounds (mirror of worker/lib/validators.ts — assertions only)
const MAX_WORD_RESULTS = 200;
const MAX_COUNT = 100;
const MAX_DURATION = 3600;
const MAX_XP = 500;

const assertBounds = (chunks: MigrationChunk[]) =>
  chunks.forEach((chunk) => {
    expect(Object.keys(chunk.wordResults).length).toBeLessThanOrEqual(MAX_WORD_RESULTS);
    expect(Number.isInteger(chunk.durationSeconds)).toBe(true);
    expect(chunk.durationSeconds).toBeGreaterThanOrEqual(0);
    expect(chunk.durationSeconds).toBeLessThanOrEqual(MAX_DURATION);
    expect(Number.isInteger(chunk.xpEarned)).toBe(true);
    expect(chunk.xpEarned).toBeGreaterThanOrEqual(0);
    expect(chunk.xpEarned).toBeLessThanOrEqual(MAX_XP);
    Object.values(chunk.wordResults).forEach((stats) => {
      [stats.shown, stats.correct, stats.incorrect].forEach((n) => {
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(MAX_COUNT);
      });
    });
  });

const sumStatsByKey = (chunks: MigrationChunk[]): Record<string, WordStats> =>
  chunks.reduce<Record<string, WordStats>>(
    (acc, chunk) =>
      Object.entries(chunk.wordResults).reduce((inner, [key, stats]) => {
        const prev = inner[key] ?? s(0, 0, 0);
        return {
          ...inner,
          [key]: s(
            prev.shown + stats.shown,
            prev.correct + stats.correct,
            prev.incorrect + stats.incorrect,
          ),
        };
      }, acc),
    {},
  );

const sumDuration = (chunks: MigrationChunk[]) =>
  chunks.reduce((sum, c) => sum + c.durationSeconds, 0);

const sumXP = (chunks: MigrationChunk[]) =>
  chunks.reduce((sum, c) => sum + c.xpEarned, 0);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("buildMigrationChunks — empty guest", () => {
  it("returns no chunks when there is literally nothing to migrate", () => {
    expect(buildMigrationChunks(guest())).toEqual([]);
  });

  it("handles a legacy blob without unlockedLessons", () => {
    expect(buildMigrationChunks({ words: {}, dailySessions: {} })).toEqual([]);
  });
});

describe("buildMigrationChunks — small guest fits one chunk", () => {
  const data = guest(
    { "Moien|hi": s(5, 4, 1), "Äddi|bye": s(3, 3, 0) },
    { "2026-06-01": day(120, 40), "2026-06-02": day(90, 25) },
    ["A1.02"],
  );
  const chunks = buildMigrationChunks(data);

  it("emits exactly one chunk", () => {
    expect(chunks).toHaveLength(1);
  });

  it("carries totals verbatim", () => {
    expect(chunks[0]).toEqual({
      wordResults: { "Moien|hi": s(5, 4, 1), "Äddi|bye": s(3, 3, 0) },
      durationSeconds: 210,
      xpEarned: 65,
      newlyUnlockedLessons: ["A1.02"],
    });
  });

  it("respects all bounds", () => {
    assertBounds(chunks);
  });
});

describe("buildMigrationChunks — oversized single key", () => {
  const chunks = buildMigrationChunks(guest({ "Moien|hi": s(250, 240, 10) }));

  it("splits the key across multiple chunks, never repeating it within one", () => {
    expect(chunks).toHaveLength(3);
    chunks.forEach((chunk) =>
      expect(Object.keys(chunk.wordResults)).toEqual(["Moien|hi"]),
    );
  });

  it("splits counters as consecutive ≤100 slices", () => {
    expect(chunks.map((c) => c.wordResults["Moien|hi"])).toEqual([
      s(100, 100, 10),
      s(100, 100, 0),
      s(50, 40, 0),
    ]);
  });

  it("reconstructs the exact totals", () => {
    expect(sumStatsByKey(chunks)["Moien|hi"]).toEqual(s(250, 240, 10));
  });

  it("respects all bounds", () => {
    assertBounds(chunks);
  });
});

describe("buildMigrationChunks — many keys", () => {
  // 450 keys → 3 chunks of ≤200; one of them also oversized.
  const words = Object.fromEntries(
    Array.from({ length: 450 }, (_, i) => [`word${i}|en${i}`, s(7, 5, 2)]),
  );
  const data = guest(
    { ...words, "big|huge": s(303, 150, 153) },
    { "2026-06-01": day(10_000, 1_700) },
    ["A1.02", "A1.03"],
  );
  const chunks = buildMigrationChunks(data);

  it("caps every chunk at 200 wordResults", () => {
    assertBounds(chunks);
  });

  it("reconstructs every key's exact totals", () => {
    expect(sumStatsByKey(chunks)).toEqual(data.words);
  });

  it("spreads duration across chunks and reconstructs the total", () => {
    expect(sumDuration(chunks)).toBe(10_000);
  });

  it("spreads XP across chunks and reconstructs the total", () => {
    expect(sumXP(chunks)).toBe(1_700);
  });

  it("sends unlockedLessons exactly once, on the first chunk", () => {
    expect(chunks[0].newlyUnlockedLessons).toEqual(["A1.02", "A1.03"]);
    chunks.slice(1).forEach((c) => expect(c.newlyUnlockedLessons).toEqual([]));
  });
});

describe("buildMigrationChunks — duration/XP need more chunks than words", () => {
  // 1 small word, but 9000s duration (3 chunks) and 1200 XP (3 chunks).
  const data = guest(
    { "Moien|hi": s(5, 4, 1) },
    { "2026-06-01": day(9_000, 1_200) },
  );
  const chunks = buildMigrationChunks(data);

  it("emits extra chunks with empty wordResults to carry the overflow", () => {
    expect(chunks).toHaveLength(3);
    expect(Object.keys(chunks[1].wordResults)).toEqual([]);
    expect(Object.keys(chunks[2].wordResults)).toEqual([]);
  });

  it("spreads duration as consecutive ≤3600 slices", () => {
    expect(chunks.map((c) => c.durationSeconds)).toEqual([3600, 3600, 1800]);
  });

  it("spreads XP as consecutive ≤500 slices", () => {
    expect(chunks.map((c) => c.xpEarned)).toEqual([500, 500, 200]);
  });

  it("respects all bounds", () => {
    assertBounds(chunks);
  });
});

describe("buildMigrationChunks — XP-only guest", () => {
  const chunks = buildMigrationChunks(guest({}, { "2026-06-01": day(0, 80) }));

  it("still produces a chunk so the XP is not lost", () => {
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({
      wordResults: {},
      durationSeconds: 0,
      xpEarned: 80,
      newlyUnlockedLessons: [],
    });
  });
});

describe("buildMigrationChunks — duration-only guest", () => {
  it("produces a chunk for duration with no words and no XP", () => {
    const chunks = buildMigrationChunks(guest({}, { "2026-06-01": day(300) }));
    expect(chunks).toHaveLength(1);
    expect(chunks[0].durationSeconds).toBe(300);
    expect(chunks[0].xpEarned).toBe(0);
  });
});

describe("buildMigrationChunks — unlocked-lessons-only guest", () => {
  it("produces a single chunk carrying just the unlocks", () => {
    const chunks = buildMigrationChunks(guest({}, {}, ["A1.02"]));
    expect(chunks).toHaveLength(1);
    expect(chunks[0].newlyUnlockedLessons).toEqual(["A1.02"]);
  });
});

describe("buildMigrationChunks — float durations (legacy blobs)", () => {
  it("rounds the summed duration to an integer", () => {
    const chunks = buildMigrationChunks(
      guest({}, { "2026-06-01": day(10.4), "2026-06-02": day(20.3) }),
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0].durationSeconds).toBe(31); // round(30.7)
    assertBounds(chunks);
  });

  it("legacy xp absence is treated as 0", () => {
    const chunks = buildMigrationChunks(
      guest({}, { "2026-06-01": { totalItems: 1, durationSeconds: 60, correct: 1, incorrect: 0 } }),
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0].xpEarned).toBe(0);
  });
});
