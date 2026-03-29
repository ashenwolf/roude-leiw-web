import { describe, it, expect } from "vitest";

import { sessionReducer, INITIAL_SESSION_STATE } from "../../../src/exercise/session-reducer.ts";
import type { SessionState, SessionAction } from "../../../src/exercise/session-reducer.ts";

// ============================================================================
// Fixtures
// ============================================================================

const baseReady: SessionState = {
  ...INITIAL_SESSION_STATE,
  status: "ready",
  lessons: [],
  batches: [
    [["Moien", "hi"], ["Äddi", "bye"]],
    [["Merci", "thanks"]],
  ],
  currentLessonId: "A1.01",
};

const baseActive: SessionState = { ...baseReady, status: "active", currentBatch: 0 };

// ============================================================================
// LOADED
// ============================================================================

describe("LOADED action", () => {
  const action: SessionAction = {
    type: "LOADED",
    lessons: [],
    batches: [[["Moien", "hi"]]],
    currentLessonId: "A1.01",
  };

  it.each([
    ["from loading", "loading" as const],
    ["from error", "error" as const],
    ["from ready", "ready" as const],
  ])("transitions to ready %s", (_, startStatus) => {
    const state: SessionState = { ...INITIAL_SESSION_STATE, status: startStatus };
    const next = sessionReducer(state, action);
    expect(next.status).toBe("ready");
    expect(next.error).toBeNull();
    expect(next.currentLessonId).toBe("A1.01");
  });
});

// ============================================================================
// LOAD_ERROR
// ============================================================================

describe("LOAD_ERROR action", () => {
  it("sets error and status=error", () => {
    const next = sessionReducer(INITIAL_SESSION_STATE, { type: "LOAD_ERROR", error: "Network failed" });
    expect(next.status).toBe("error");
    expect(next.error).toBe("Network failed");
  });
});

// ============================================================================
// START
// ============================================================================

describe("START action", () => {
  it("transitions to active, resets batch state", () => {
    const state: SessionState = { ...baseReady, currentBatch: 1, batchProgress: 0.5 };
    const next = sessionReducer(state, { type: "START" });
    expect(next.status).toBe("active");
    expect(next.currentBatch).toBe(0);
    expect(next.batchProgress).toBe(0);
  });
});

// ============================================================================
// MATCH_PROGRESS
// ============================================================================

describe("MATCH_PROGRESS action", () => {
  it.each([
    ["1 of 2 matched → 0.5", 1, 2, 0.5],
    ["4 of 4 matched → 1.0", 4, 4, 1],
    ["0 of 0 → 0 (no divide-by-zero)", 0, 0, 0],
    ["0 of 3 → 0", 0, 3, 0],
  ] as const)("%s", (_, matchedCount, totalPairs, expected) => {
    const next = sessionReducer(baseActive, { type: "MATCH_PROGRESS", matchedCount, totalPairs });
    expect(next.batchProgress).toBeCloseTo(expected);
  });

  it("is ignored (falls to default) when status is not active", () => {
    const next = sessionReducer(baseReady, { type: "MATCH_PROGRESS", matchedCount: 1, totalPairs: 2 });
    expect(next).toBe(baseReady);
  });
});

// ============================================================================
// BATCH_COMPLETE
// ============================================================================

describe("BATCH_COMPLETE action", () => {
  it.each([
    ["middle batch → batch_complete", 0, "batch_complete" as const],
    ["last batch → session_complete", 1, "session_complete" as const],
  ] as const)("%s", (_, currentBatch, expectedStatus) => {
    // baseReady has 2 batches; index 0 is middle, index 1 is last
    const state: SessionState = { ...baseActive, currentBatch };
    const next = sessionReducer(state, { type: "BATCH_COMPLETE" });
    expect(next.status).toBe(expectedStatus);
  });

  it("is ignored when status is not active", () => {
    const next = sessionReducer(baseReady, { type: "BATCH_COMPLETE" });
    expect(next).toBe(baseReady);
  });
});

// ============================================================================
// DISMISS_MILESTONE
// ============================================================================

describe("DISMISS_MILESTONE action", () => {
  it("transitions batch_complete → active, increments batch, resets progress", () => {
    const state: SessionState = { ...baseActive, status: "batch_complete", currentBatch: 0, batchProgress: 1 };
    const next = sessionReducer(state, { type: "DISMISS_MILESTONE" });
    expect(next.status).toBe("active");
    expect(next.currentBatch).toBe(1);
    expect(next.batchProgress).toBe(0);
  });

  it("is ignored when status is not batch_complete", () => {
    const next = sessionReducer(baseActive, { type: "DISMISS_MILESTONE" });
    expect(next).toBe(baseActive);
  });
});

// ============================================================================
// RESET
// ============================================================================

describe("RESET action", () => {
  it("resets to ready with new batches and lessonId", () => {
    const newBatches: SessionState["batches"] = [[["grouss", "big"]]];
    const next = sessionReducer(baseActive, { type: "RESET", batches: newBatches, currentLessonId: "A1.02" });
    expect(next.status).toBe("ready");
    expect(next.batches).toBe(newBatches);
    expect(next.currentLessonId).toBe("A1.02");
    expect(next.currentBatch).toBe(0);
    expect(next.batchProgress).toBe(0);
  });
});
