import { describe, it, expect } from "vitest";

import {
  initializeGame,
  applySelection,
  applyFadeComplete,
  applyClearFail,
} from "../../../../src/exercise/WordMatch/game-logic.ts";
import type {
  GameState,
  SlotState,
  WordPair,
  WordResultMap,
} from "../../../../src/exercise/WordMatch/types.ts";

// ============================================================================
// Fixtures
// ============================================================================

const slot = {
  active: (pairIndex: number): SlotState => ({ type: "active", pairIndex }),
  selected: (pairIndex: number): SlotState => ({ type: "selected", pairIndex }),
  fail: (pairIndex: number): SlotState => ({ type: "fail", pairIndex }),
  fading: (pairIndex: number, nextPairIndex: number | null = null): SlotState => ({
    type: "fading", pairIndex, nextPairIndex,
  }),
  empty: (): SlotState => ({ type: "empty" }),
};

const game = (
  leftSlots: SlotState[],
  rightSlots: SlotState[],
  pairPool: number[] = [],
  matchedCount = 0,
  wordResults: WordResultMap = {},
): GameState => ({ leftSlots, rightSlots, pairPool, matchedCount, wordResults });

// 5 pairs, each with a unique LU word so default `isValueMatch` only matches identical pairIndex
const PAIRS_5: WordPair[] = [
  ["Moien", "hi"],
  ["Äddi", "bye"],
  ["Merci", "thanks"],
  ["Jo", "yes"],
  ["Nee", "no"],
];

const pairIndicesOf = (slots: SlotState[]): number[] =>
  slots.flatMap((s) => (s.type === "empty" ? [] : [s.pairIndex]));

// ============================================================================
// initializeGame
// ============================================================================

describe("initializeGame", () => {
  it("creates `displayCount` slots on each side, all active", () => {
    const state = initializeGame(PAIRS_5, 3);
    expect(state.leftSlots).toHaveLength(3);
    expect(state.rightSlots).toHaveLength(3);
    expect(state.leftSlots.every((s) => s.type === "active")).toBe(true);
    expect(state.rightSlots.every((s) => s.type === "active")).toBe(true);
  });

  it("both sides display the same set of pair indices (right is independently shuffled)", () => {
    const state = initializeGame(PAIRS_5, 3);
    expect([...pairIndicesOf(state.leftSlots)].sort()).toEqual(
      [...pairIndicesOf(state.rightSlots)].sort(),
    );
  });

  it("pool contains the remaining pair indices, disjoint from displayed", () => {
    const state = initializeGame(PAIRS_5, 3);
    const displayed = new Set(pairIndicesOf(state.leftSlots));
    expect(state.pairPool).toHaveLength(2);
    expect(state.pairPool.every((i) => !displayed.has(i))).toBe(true);
    const all = new Set([...displayed, ...state.pairPool]);
    expect(all.size).toBe(5);
  });

  it("pool is empty when displayCount equals pair count", () => {
    const state = initializeGame(PAIRS_5, 5);
    expect(state.pairPool).toEqual([]);
  });

  it("matchedCount starts at 0", () => {
    expect(initializeGame(PAIRS_5, 3).matchedCount).toBe(0);
  });

  it("wordResults marks each initially-displayed pair as shown=1", () => {
    const state = initializeGame(PAIRS_5, 3);
    const displayed = pairIndicesOf(state.leftSlots);
    displayed.forEach((idx) => {
      const key = `${PAIRS_5[idx][0]}|${PAIRS_5[idx][1]}`;
      expect(state.wordResults[key]).toEqual({ shown: 1, correct: 0, incorrect: 0 });
    });
    // Pool entries should NOT be marked shown
    state.pairPool.forEach((idx) => {
      const key = `${PAIRS_5[idx][0]}|${PAIRS_5[idx][1]}`;
      expect(state.wordResults[key]).toBeUndefined();
    });
  });
});

// ============================================================================
// applySelection — selection mechanics (no match attempt yet)
// ============================================================================

describe("applySelection — selection mechanics", () => {
  it("clicking an active slot makes it selected", () => {
    const state = game(
      [slot.active(0), slot.active(1)],
      [slot.active(0), slot.active(1)],
    );
    const { state: next, events, failPair } = applySelection(state, PAIRS_5, "left", 0);
    expect(next.leftSlots[0]).toEqual(slot.selected(0));
    expect(next.leftSlots[1]).toEqual(slot.active(1));
    expect(next.rightSlots).toEqual(state.rightSlots);
    expect(events).toEqual([]);
    expect(failPair).toBeNull();
  });

  it("clicking a selected slot toggles it back to active", () => {
    const state = game(
      [slot.selected(0), slot.active(1)],
      [slot.active(0), slot.active(1)],
    );
    const { state: next, events } = applySelection(state, PAIRS_5, "left", 0);
    expect(next.leftSlots[0]).toEqual(slot.active(0));
    expect(events).toEqual([]);
  });

  it("clicking a different active slot on the same side switches the selection", () => {
    const state = game(
      [slot.selected(0), slot.active(1)],
      [slot.active(0), slot.active(1)],
    );
    const { state: next } = applySelection(state, PAIRS_5, "left", 1);
    expect(next.leftSlots[0]).toEqual(slot.active(0));
    expect(next.leftSlots[1]).toEqual(slot.selected(1));
  });

  it("first click on a side with no selection anywhere just selects (no match attempt)", () => {
    const state = game(
      [slot.active(0), slot.active(1)],
      [slot.active(0), slot.active(1)],
    );
    const { state: next, events, failPair } = applySelection(state, PAIRS_5, "right", 1);
    expect(next.rightSlots[1].type).toBe("selected");
    expect(next.leftSlots).toEqual(state.leftSlots);
    expect(events).toEqual([]);
    expect(failPair).toBeNull();
  });

  it("clicking a fading slot is a no-op", () => {
    const state = game(
      [slot.fading(0, null), slot.active(1)],
      [slot.active(0), slot.active(1)],
    );
    const result = applySelection(state, PAIRS_5, "left", 0);
    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
  });

  it("clicking an empty slot is a no-op", () => {
    const state = game(
      [slot.empty(), slot.active(1)],
      [slot.active(0), slot.active(1)],
    );
    const result = applySelection(state, PAIRS_5, "left", 0);
    expect(result.state).toBe(state);
  });
});

// ============================================================================
// applySelection — successful match
// ============================================================================

describe("applySelection — match", () => {
  it("matching pair indices on both sides → both slots become fading, +1 matchedCount, +1 correct", () => {
    const state = game(
      [slot.active(0), slot.active(1)],
      [slot.selected(0), slot.active(1)],
      [2], // pool has pair 2 ready to be fed
      0,
      { "Moien|hi": { shown: 1, correct: 0, incorrect: 0 }, "Äddi|bye": { shown: 1, correct: 0, incorrect: 0 } },
    );
    const { state: next, events, failPair } = applySelection(state, PAIRS_5, "left", 0);

    expect(next.leftSlots[0]).toEqual(slot.fading(0, 2));
    expect(next.rightSlots[0]).toEqual(slot.fading(0, 2));
    expect(next.matchedCount).toBe(1);
    expect(next.pairPool).toEqual([]);
    expect(next.wordResults["Moien|hi"]).toEqual({ shown: 1, correct: 1, incorrect: 0 });
    // Newly fed pair gets marked as shown
    expect(next.wordResults["Merci|thanks"]).toEqual({ shown: 1, correct: 0, incorrect: 0 });
    expect(events).toContainEqual({ type: "matched", matchedCount: 1, totalPairs: 5 });
    expect(failPair).toBeNull();
  });

  it("match with empty pool sets nextPairIndex to null (slot will become empty after fade)", () => {
    const state = game(
      [slot.active(0), slot.active(1)],
      [slot.selected(0), slot.active(1)],
      [], // no more pairs in pool
    );
    const { state: next } = applySelection(state, PAIRS_5, "left", 0);
    const fadingSlot = next.leftSlots[0];
    if (fadingSlot.type !== "fading") throw new Error("expected fading");
    expect(fadingSlot.nextPairIndex).toBeNull();
  });

  it("match that brings matchedCount to totalPairs emits a 'completed' event with final wordResults", () => {
    // Only 2 pairs in the game, 1 already matched, this match completes it
    const TWO_PAIRS: WordPair[] = [["Moien", "hi"], ["Äddi", "bye"]];
    const state = game(
      [slot.active(1)],
      [slot.selected(1)],
      [],
      1, // one already matched
      { "Moien|hi": { shown: 1, correct: 1, incorrect: 0 }, "Äddi|bye": { shown: 1, correct: 0, incorrect: 0 } },
    );
    const { events } = applySelection(state, TWO_PAIRS, "left", 0);
    expect(events).toContainEqual({ type: "matched", matchedCount: 2, totalPairs: 2 });
    const completed = events.find((e) => e.type === "completed");
    expect(completed).toBeDefined();
    if (completed?.type === "completed") {
      expect(completed.wordResults["Äddi|bye"]).toEqual({ shown: 1, correct: 1, incorrect: 0 });
    }
  });

  it("matching by LU value across different pair indices succeeds (same Lu, different En)", () => {
    // Two pairs share the LU word "Moien" with different EN translations
    const DUP: WordPair[] = [["Moien", "hi"], ["Moien", "hello"]];
    const state = game(
      [slot.active(0)],          // showing "Moien" (pairIndex 0)
      [slot.selected(1)],        // showing "hello" (pairIndex 1, but LU="Moien")
      [],
      0,
      { "Moien|hi": { shown: 1, correct: 0, incorrect: 0 }, "Moien|hello": { shown: 1, correct: 0, incorrect: 0 } },
    );
    const { state: next, events, failPair } = applySelection(state, DUP, "left", 0);
    // The LU words match → success, both fade
    expect(next.leftSlots[0].type).toBe("fading");
    expect(next.rightSlots[0].type).toBe("fading");
    expect(events.some((e) => e.type === "matched")).toBe(true);
    expect(failPair).toBeNull();
  });

  it("matching by EN value across different pair indices succeeds (same En, different Lu — synonym)", () => {
    // Two pairs share the EN word "bye" with different LU words (Äddi / Awar)
    const SYN: WordPair[] = [["Äddi", "bye"], ["Awar", "bye"]];
    const state = game(
      [slot.active(0)],          // showing "Äddi" (pairIndex 0)
      [slot.selected(1)],        // showing "bye" from pairIndex 1 (Awar|bye)
      [],
      0,
      { "Äddi|bye": { shown: 1, correct: 0, incorrect: 0 }, "Awar|bye": { shown: 1, correct: 0, incorrect: 0 } },
    );
    const { state: next, events, failPair } = applySelection(state, SYN, "left", 0);
    // The EN words match → success, both fade
    expect(next.leftSlots[0].type).toBe("fading");
    expect(next.rightSlots[0].type).toBe("fading");
    expect(events.some((e) => e.type === "matched")).toBe(true);
    expect(failPair).toBeNull();
  });
});

// ============================================================================
// applySelection — mismatch
// ============================================================================

describe("applySelection — mismatch", () => {
  it("non-matching pair indices → both become 'fail', both pairs marked incorrect", () => {
    const state = game(
      [slot.active(0), slot.active(1)],
      [slot.selected(2), slot.active(3)], // pairIndex 2 vs 0 — different LU words
      [],
      0,
      {
        "Moien|hi": { shown: 1, correct: 0, incorrect: 0 },
        "Merci|thanks": { shown: 1, correct: 0, incorrect: 0 },
      },
    );
    const { state: next, events, failPair } = applySelection(state, PAIRS_5, "left", 0);

    expect(next.leftSlots[0].type).toBe("fail");
    expect(next.rightSlots[0].type).toBe("fail");
    expect(next.matchedCount).toBe(0);
    expect(events).toEqual([]);
    expect(failPair).toEqual({ leftPairIndex: 0, rightPairIndex: 2 });

    // Both pairs marked incorrect
    expect(next.wordResults["Moien|hi"].incorrect).toBe(1);
    expect(next.wordResults["Merci|thanks"].incorrect).toBe(1);
    // Shown counts NOT incremented on a fail (slots remain visible)
    expect(next.wordResults["Moien|hi"].shown).toBe(1);
    expect(next.wordResults["Merci|thanks"].shown).toBe(1);
  });
});

// ============================================================================
// applyFadeComplete
// ============================================================================

describe("applyFadeComplete", () => {
  it("fading slot with nextPairIndex becomes active with the new pair", () => {
    const state = game(
      [slot.fading(0, 2), slot.active(1)],
      [slot.active(0), slot.active(1)],
    );
    const next = applyFadeComplete(state, "left", 0);
    expect(next.leftSlots[0]).toEqual(slot.active(2));
  });

  it("fading slot with null nextPairIndex becomes empty", () => {
    const state = game(
      [slot.fading(0, null), slot.active(1)],
      [slot.active(0), slot.active(1)],
    );
    const next = applyFadeComplete(state, "left", 0);
    expect(next.leftSlots[0]).toEqual(slot.empty());
  });

  it("non-fading slot is unchanged", () => {
    const state = game(
      [slot.active(0), slot.active(1)],
      [slot.active(0), slot.active(1)],
    );
    const next = applyFadeComplete(state, "left", 0);
    expect(next).toBe(state);
  });
});

// ============================================================================
// applyClearFail
// ============================================================================

describe("applyClearFail", () => {
  it("converts 'fail' slots with given pair indices back to 'active'", () => {
    const state = game(
      [slot.fail(0), slot.active(1)],
      [slot.fail(2), slot.active(3)],
    );
    const next = applyClearFail(state, 0, 2);
    expect(next.leftSlots[0]).toEqual(slot.active(0));
    expect(next.rightSlots[0]).toEqual(slot.active(2));
  });

  it("leaves slots that are not 'fail' alone, even if pair index matches", () => {
    const state = game(
      [slot.selected(0), slot.active(1)],
      [slot.active(2), slot.active(3)],
    );
    const next = applyClearFail(state, 0, 2);
    expect(next.leftSlots[0]).toEqual(slot.selected(0));
    expect(next.rightSlots[0]).toEqual(slot.active(2));
  });
});

// ============================================================================
// End-to-end: a full match cycle preserves accounting
// ============================================================================

describe("end-to-end accounting", () => {
  it("a full successful match cycle produces shown=1 + correct=1 for the matched pair, +1 shown for the newly-fed pair", () => {
    const state = game(
      [slot.active(0), slot.active(1)],
      [slot.selected(0), slot.active(1)],
      [2],
      0,
      { "Moien|hi": { shown: 1, correct: 0, incorrect: 0 }, "Äddi|bye": { shown: 1, correct: 0, incorrect: 0 } },
    );
    const { state: afterMatch } = applySelection(state, PAIRS_5, "left", 0);
    const final = applyFadeComplete(applyFadeComplete(afterMatch, "left", 0), "right", 0);

    // Pair 0 ended up matched
    expect(final.wordResults["Moien|hi"]).toEqual({ shown: 1, correct: 1, incorrect: 0 });
    // Newly-fed pair 2 should now show in both slots, marked shown=1
    expect(final.wordResults["Merci|thanks"]).toEqual({ shown: 1, correct: 0, incorrect: 0 });
    expect(final.leftSlots[0]).toEqual(slot.active(2));
    expect(final.rightSlots[0]).toEqual(slot.active(2));
  });
});
