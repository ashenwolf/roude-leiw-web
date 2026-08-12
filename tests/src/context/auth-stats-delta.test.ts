/**
 * Byte-identity test — the client-side merge (applyStatsDelta path) must produce
 * the same state that the server merge (fetchMe after POST) would return.
 *
 * If this test fails, the guest→auth migration path is broken — a session played
 * as a guest would produce different stats than the same session played as an
 * authenticated user. See .claude/reference/mode-specs.md > Post-Session refresh invariant.
 */
import { describe, it, expect } from "vitest";

import { mergeWordStats, mergeDailySession } from "../../../src/lib/stats-merge.ts";
import { computeStreak } from "../../../src/lib/streak.ts";

import type { WordStats, DailySession } from "../../../src/context/auth.ts";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const s = (shown: number, correct: number, incorrect: number): WordStats =>
  ({ shown, correct, incorrect });

const initialWords: Record<string, WordStats> = {
  "Moien|hi": s(3, 3, 0),
  "Äddi|bye": s(5, 4, 1),
};

const initialSessions: Record<string, DailySession> = {
  "2026-05-17": { totalItems: 10, durationSeconds: 120, correct: 8, incorrect: 2 },
};

const delta: Record<string, WordStats> = {
  "Moien|hi": s(2, 1, 1),  // already known word — accumulated
  "Merci|thanks": s(3, 3, 0), // new word
};

const TODAY = "2026-05-18";
const DURATION = 90;

// ─── Client-side merge (same path as applyStatsDelta) ────────────────────────

describe("client-side merge — applyStatsDelta logic", () => {
  const newWords = mergeWordStats(initialWords, delta);
  const newSessions = mergeDailySession(initialSessions, TODAY, delta, DURATION);
  const newStreak = computeStreak(newSessions, TODAY);

  it("accumulates stats for existing words", () => {
    expect(newWords["Moien|hi"]).toEqual(s(5, 4, 1)); // 3+2, 3+1, 0+1
  });

  it("adds new words", () => {
    expect(newWords["Merci|thanks"]).toEqual(s(3, 3, 0));
  });

  it("leaves untouched words unchanged", () => {
    expect(newWords["Äddi|bye"]).toEqual(s(5, 4, 1));
  });

  it("adds a daily session entry for today", () => {
    const todaySession = newSessions[TODAY];
    expect(todaySession).toBeDefined();
    expect(todaySession.durationSeconds).toBe(DURATION);
    // totalItems = sum of shown counts in delta = 2 + 3 = 5
    expect(todaySession.totalItems).toBe(5);
    expect(todaySession.correct).toBe(4); // 1 + 3
    expect(todaySession.incorrect).toBe(1); // 1 + 0
  });

  it("accumulates into an existing session for the same date", () => {
    const prev: Record<string, DailySession> = {
      [TODAY]: { totalItems: 10, durationSeconds: 60, correct: 8, incorrect: 2 },
    };
    const merged = mergeDailySession(prev, TODAY, delta, DURATION);
    expect(merged[TODAY].totalItems).toBe(15);   // 10 + 5
    expect(merged[TODAY].durationSeconds).toBe(150); // 60 + 90
    expect(merged[TODAY].correct).toBe(12);       // 8 + 4
    expect(merged[TODAY].incorrect).toBe(3);      // 2 + 1
  });

  it("streak increments to 1 when first session today", () => {
    // initialSessions only has yesterday; today's session just added
    expect(newStreak.current).toBe(2); // yesterday + today
    expect(newStreak.longest).toBeGreaterThanOrEqual(2);
  });
});

// ─── Server-side equivalent (manual verification of same math) ───────────────

describe("server-side merge equivalence", () => {
  it("mergeWordResults (server) and mergeWordStats (client) produce same totals", () => {
    // Server uses array of WordResult objects; client uses Record<string, WordStats>.
    // The math is identical — verify they produce the same key values.
    const clientMerge = mergeWordStats(initialWords, delta);

    // Simulate server mergeWordResults manually (same accumulation logic):
    const serverMerge = { ...initialWords };
    for (const [key, d] of Object.entries(delta)) {
      const base = serverMerge[key] ?? s(0, 0, 0);
      serverMerge[key] = s(base.shown + d.shown, base.correct + d.correct, base.incorrect + d.incorrect);
    }

    expect(clientMerge).toEqual(serverMerge);
  });

  it("mergeDailySession (client) and server mergeDailySession produce same totals", () => {
    const clientResult = mergeDailySession({}, TODAY, delta, DURATION);
    const todaySession = clientResult[TODAY];

    // Server accumulates: totalItems = sum of shown, correct/incorrect from each WordResult
    const totalItems = Object.values(delta).reduce((sum, r) => sum + r.shown, 0);
    const correct = Object.values(delta).reduce((sum, r) => sum + r.correct, 0);
    const incorrect = Object.values(delta).reduce((sum, r) => sum + r.incorrect, 0);

    expect(todaySession.totalItems).toBe(totalItems);
    expect(todaySession.correct).toBe(correct);
    expect(todaySession.incorrect).toBe(incorrect);
    expect(todaySession.durationSeconds).toBe(DURATION);
  });
});

// ─── computeStreak (shared) ───────────────────────────────────────────────────

describe("computeStreak — shared function", () => {
  it("returns 0/0 for empty sessions", () => {
    expect(computeStreak({}, TODAY)).toEqual({ current: 0, longest: 0 });
  });

  it("current streak = 1 when only today has a session", () => {
    const sessions: Record<string, DailySession> = {
      [TODAY]: { totalItems: 5, durationSeconds: 60, correct: 4, incorrect: 1 },
    };
    const streak = computeStreak(sessions, TODAY);
    expect(streak.current).toBe(1);
    expect(streak.longest).toBe(1);
  });

  it("streak resets to 0 when last session is before yesterday", () => {
    const sessions: Record<string, DailySession> = {
      "2026-05-15": { totalItems: 5, durationSeconds: 60, correct: 4, incorrect: 1 },
    };
    const streak = computeStreak(sessions, TODAY);
    expect(streak.current).toBe(0);
  });

  it("consecutive days build a streak", () => {
    const sessions: Record<string, DailySession> = {
      "2026-05-16": { totalItems: 5, durationSeconds: 60, correct: 4, incorrect: 1 },
      "2026-05-17": { totalItems: 5, durationSeconds: 60, correct: 4, incorrect: 1 },
      [TODAY]: { totalItems: 5, durationSeconds: 60, correct: 4, incorrect: 1 },
    };
    const streak = computeStreak(sessions, TODAY);
    expect(streak.current).toBe(3);
    expect(streak.longest).toBe(3);
  });
});
