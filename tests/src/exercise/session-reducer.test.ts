import { describe, it, expect } from "vitest";

import { sessionReducer, INITIAL_SESSION_STATE } from "../../../src/exercise/session-reducer.ts";
import type { SessionState, SessionAction } from "../../../src/exercise/session-reducer.ts";
import type { Exercise } from "../../../src/exercise/types.ts";

// ============================================================================
// Fixtures
// ============================================================================

const batch1: Exercise = { type: "word-match", pairs: [["Moien", "hi"], ["Äddi", "bye"]] };
const batch2: Exercise = { type: "word-match", pairs: [["Merci", "thanks"]] };

const makeQueue = (n: number): Exercise[] =>
  Array.from({ length: n }, () => batch1);

const slotComplete = (requeueBatch?: Exercise): SessionAction =>
  ({ type: "SLOT_COMPLETE", outcome: "success", requeueBatch });

const baseReady: SessionState = {
  ...INITIAL_SESSION_STATE,
  status: "ready",
  lessons: [],
  queue: [batch1, batch2],
  plannedSlots: 15,
  blockBoundaries: [5, 10, 15],
  currentLessonId: "A1.01",
};

const baseActive: SessionState = { ...baseReady, status: "active", currentSlot: 0 };

const active15: SessionState = {
  ...INITIAL_SESSION_STATE,
  status: "active",
  queue: makeQueue(15),
  plannedSlots: 15,
  blockBoundaries: [5, 10, 15],
  currentLessonId: "A1.01",
};

// ============================================================================
// LOADED
// ============================================================================

describe("LOADED action", () => {
  const action: SessionAction = {
    type: "LOADED",
    lessons: [],
    queue: [{ type: "word-match", pairs: [["Moien", "hi"]] }],
    plannedSlots: 1,
    blockBoundaries: [1],
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
    expect(next.plannedSlots).toBe(1);
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
  it("transitions to active, resets slot state", () => {
    const state: SessionState = { ...baseReady, currentSlot: 1, slotProgress: 0.5 };
    const next = sessionReducer(state, { type: "START" });
    expect(next.status).toBe("active");
    expect(next.currentSlot).toBe(0);
    expect(next.slotProgress).toBe(0);
  });
});

// ============================================================================
// SLOT_PROGRESS
// ============================================================================

describe("SLOT_PROGRESS action", () => {
  it.each([
    ["1 of 2 matched → 0.5", 1, 2, 0.5],
    ["4 of 4 matched → 1.0", 4, 4, 1],
    ["0 of 0 → 0 (no divide-by-zero)", 0, 0, 0],
    ["0 of 3 → 0", 0, 3, 0],
  ] as const)("%s", (_, done, total, expected) => {
    const next = sessionReducer(baseActive, { type: "SLOT_PROGRESS", done, total });
    expect(next.slotProgress).toBeCloseTo(expected);
  });

  it("is ignored when status is not active", () => {
    const next = sessionReducer(baseReady, { type: "SLOT_PROGRESS", done: 1, total: 2 });
    expect(next).toBe(baseReady);
  });
});

// ============================================================================
// SLOT_COMPLETE
// ============================================================================

describe("SLOT_COMPLETE action", () => {
  it("middle slot (non-section-end) → slot_complete", () => {
    const state: SessionState = { ...baseActive, currentSlot: 0 };
    const next = sessionReducer(state, slotComplete());
    expect(next.status).toBe("slot_complete");
    expect(next.queue).toHaveLength(2);
  });

  it("records lastSlotOutcome", () => {
    const state: SessionState = { ...baseActive, currentSlot: 0 };
    const next = sessionReducer(state, { type: "SLOT_COMPLETE", outcome: "mistake" });
    expect(next.lastSlotOutcome).toBe("mistake");
  });

  it("last slot (success) → session_complete", () => {
    const state: SessionState = { ...baseActive, currentSlot: 1 };
    const next = sessionReducer(state, slotComplete());
    expect(next.status).toBe("session_complete");
  });

  it("slot 4 of 15 (section 1 end, success) → section_complete", () => {
    const next = sessionReducer({ ...active15, currentSlot: 4 }, slotComplete());
    expect(next.status).toBe("section_complete");
  });

  it("slot 9 of 15 (section 2 end, success) → section_complete", () => {
    const next = sessionReducer({ ...active15, currentSlot: 9 }, slotComplete());
    expect(next.status).toBe("section_complete");
  });

  it("slot 14 of 15 (last, success) → session_complete not section_complete", () => {
    const next = sessionReducer({ ...active15, currentSlot: 14 }, slotComplete());
    expect(next.status).toBe("session_complete");
  });

  // Mistake takes priority — mistake popup shown before any congrats
  it("mistake at section boundary → slot_complete (not section_complete)", () => {
    const next = sessionReducer(
      { ...active15, currentSlot: 4 },
      { type: "SLOT_COMPLETE", outcome: "mistake" },
    );
    expect(next.status).toBe("slot_complete");
    expect(next.lastSlotOutcome).toBe("mistake");
  });

  it("mistake on last slot → slot_complete (not session_complete)", () => {
    const next = sessionReducer(
      { ...active15, currentSlot: 14 },
      { type: "SLOT_COMPLETE", outcome: "mistake" },
    );
    expect(next.status).toBe("slot_complete");
  });

  it("mistake mid-section → slot_complete (unchanged behaviour)", () => {
    const next = sessionReducer(
      { ...active15, currentSlot: 2 },
      { type: "SLOT_COMPLETE", outcome: "mistake" },
    );
    expect(next.status).toBe("slot_complete");
  });

  it("slot 2 of 15 (mid-section) → slot_complete", () => {
    const next = sessionReducer({ ...active15, currentSlot: 2 }, slotComplete());
    expect(next.status).toBe("slot_complete");
  });

  it("appends requeueBatch to queue (sentence mistake re-queued)", () => {
    const requeue: Exercise = { type: "word-match", pairs: [["Moien", "hi"]] };
    const state: SessionState = { ...baseActive, currentSlot: 0 };
    const next = sessionReducer(state, { type: "SLOT_COMPLETE", outcome: "mistake", requeueBatch: requeue });
    expect(next.queue).toHaveLength(3);
    expect(next.queue[2]).toBe(requeue);
    expect(next.status).toBe("slot_complete");
  });

  it("last slot + requeueBatch → slot_complete (not session_complete)", () => {
    const requeue: Exercise = { type: "word-match", pairs: [["Moien", "hi"]] };
    const state: SessionState = { ...baseActive, currentSlot: 1 };
    const next = sessionReducer(state, { type: "SLOT_COMPLETE", outcome: "mistake", requeueBatch: requeue });
    expect(next.queue).toHaveLength(3);
    expect(next.status).toBe("slot_complete");
  });

  it("overflow slots never trigger section_complete", () => {
    // 15 planned + 5 overflow = 20 total; slot 19 would be % 5 === 0 but it's overflow
    const overflowQueue = makeQueue(20);
    const state: SessionState = { ...active15, queue: overflowQueue, currentSlot: 19 };
    const next = sessionReducer(state, slotComplete());
    expect(next.status).toBe("session_complete"); // last slot, not section_complete
  });

  it("overflow slot mid-run gives slot_complete not section_complete", () => {
    // slot 16 in a 15+5 queue: (16+1)=17, 17 <= 15 is false → slot_complete
    const overflowQueue = makeQueue(20);
    const state: SessionState = { ...active15, queue: overflowQueue, currentSlot: 16 };
    const next = sessionReducer(state, slotComplete());
    expect(next.status).toBe("slot_complete");
  });

  it("is ignored when status is not active", () => {
    const next = sessionReducer(baseReady, slotComplete());
    expect(next).toBe(baseReady);
  });
});

// ============================================================================
// DISMISS_MILESTONE
// ============================================================================

describe("DISMISS_MILESTONE action", () => {
  it("slot_complete (mid-section) → active, increments slot, resets progress", () => {
    const state: SessionState = { ...active15, status: "slot_complete", currentSlot: 0, slotProgress: 1 };
    const next = sessionReducer(state, { type: "DISMISS_MILESTONE" });
    expect(next.status).toBe("active");
    expect(next.currentSlot).toBe(1);
    expect(next.slotProgress).toBe(0);
  });

  it("slot_complete at section boundary → section_complete (currentSlot NOT advanced yet)", () => {
    // After a mistake at slot 4, user dismisses mistake popup → section_complete shown next.
    // currentSlot stays at 4; DISMISS_MILESTONE from section_complete will advance to 5.
    const state: SessionState = { ...active15, status: "slot_complete", currentSlot: 4, slotProgress: 1 };
    const next = sessionReducer(state, { type: "DISMISS_MILESTONE" });
    expect(next.status).toBe("section_complete");
    expect(next.currentSlot).toBe(4); // not yet advanced
    expect(next.slotProgress).toBe(0);
  });

  it("slot_complete at last slot → session_complete", () => {
    const state: SessionState = { ...active15, status: "slot_complete", currentSlot: 14, slotProgress: 1 };
    const next = sessionReducer(state, { type: "DISMISS_MILESTONE" });
    expect(next.status).toBe("session_complete");
  });

  it("section_complete → active, increments slot, resets progress", () => {
    const state: SessionState = { ...active15, status: "section_complete", currentSlot: 4, slotProgress: 1 };
    const next = sessionReducer(state, { type: "DISMISS_MILESTONE" });
    expect(next.status).toBe("active");
    expect(next.currentSlot).toBe(5);
    expect(next.slotProgress).toBe(0);
  });

  it("mistake at boundary: full two-step dismiss produces correct final slot", () => {
    // Simulate: slot 4 mistake → slot_complete → dismiss → section_complete → dismiss → active at slot 5
    const afterMistake: SessionState = { ...active15, status: "slot_complete", currentSlot: 4 };
    const afterFirstDismiss = sessionReducer(afterMistake, { type: "DISMISS_MILESTONE" });
    expect(afterFirstDismiss.status).toBe("section_complete");
    const afterSecondDismiss = sessionReducer(afterFirstDismiss, { type: "DISMISS_MILESTONE" });
    expect(afterSecondDismiss.status).toBe("active");
    expect(afterSecondDismiss.currentSlot).toBe(5);
  });

  it("is ignored when status is active", () => {
    const next = sessionReducer(baseActive, { type: "DISMISS_MILESTONE" });
    expect(next).toBe(baseActive);
  });
});

// ============================================================================
// RESET
// ============================================================================

describe("RESET action", () => {
  it("resets to ready with new queue and lessonId", () => {
    const newQueue: Exercise[] = [{ type: "word-match", pairs: [["grouss", "big"]] }];
    const next = sessionReducer(baseActive, {
      type: "RESET",
      queue: newQueue,
      plannedSlots: 1,
      blockBoundaries: [1],
      currentLessonId: "A1.02",
    });
    expect(next.status).toBe("ready");
    expect(next.queue).toBe(newQueue);
    expect(next.plannedSlots).toBe(1);
    expect(next.currentLessonId).toBe("A1.02");
    expect(next.currentSlot).toBe(0);
    expect(next.slotProgress).toBe(0);
  });
});

// ============================================================================
// End-of-plan mistake batches: session completes after re-queued slots done
// ============================================================================

describe("sentence mistake re-queue end-to-end", () => {
  it("session completes after advancing through re-queued sentence mistake", () => {
    const requeue: Exercise = { type: "word-match", pairs: [["Moien", "hi"]] };
    let state: SessionState = { ...baseActive, currentSlot: 1 };

    // Slot completes with a sentence mistake re-queued
    state = sessionReducer(state, { type: "SLOT_COMPLETE", outcome: "mistake", requeueBatch: requeue });
    expect(state.status).toBe("slot_complete");
    expect(state.queue).toHaveLength(3);

    // DISMISS_MILESTONE — advance to slot 2 (the mistake slot)
    state = sessionReducer(state, { type: "DISMISS_MILESTONE" });
    expect(state.status).toBe("active");
    expect(state.currentSlot).toBe(2);

    // Mistake slot completes — it's the last slot → session_complete
    state = sessionReducer(state, slotComplete());
    expect(state.status).toBe("session_complete");
  });
});
