import { describe, it, expect } from "vitest";

import {
  initFillGame,
  targetBlank,
  applyBlankTap,
  applyTokenTap,
  applyBlankClear,
  isComplete,
  applySubmit,
  toWordResultMap,
  correctSentence,
} from "../../../../src/exercise/FillBlank/fill-logic.ts";

import type { FillBlankItem } from "../../../../src/exercise/types.ts";
import type { FillGameState } from "../../../../src/exercise/FillBlank/types.ts";

// ============================================================================
// Fixtures
//
// "Am Hannergrond [gesinn] ech [d'Rad]."
//   frame  = ["Am Hannergrond ", " ech ", "."]      (blanks.length + 1)
//   blanks = ["gesinn", "d'Rad"]
//   tokens = ["gesinn", "d'Rad", "ginn", "de Bus"]  (indices 0..3)
// ============================================================================

const item = (overrides: Partial<FillBlankItem> = {}): FillBlankItem => ({
  frame: ["Am Hannergrond ", " ech ", "."],
  blanks: ["gesinn", "d'Rad"],
  tokens: ["gesinn", "d'Rad", "ginn", "de Bus"],
  promptText: "In the background I see the Ferris wheel.",
  direction: "en-lu",
  fillKey: "fill:en-lu:In the background I [see] the [Ferris wheel].",
  ...overrides,
});

/** A state with specific token indices already sitting in the blanks. */
const withPlaced = (it: FillBlankItem, placed: (number | null)[]): FillGameState => ({
  ...initFillGame(it),
  placed,
});

// ============================================================================
// initFillGame
// ============================================================================

describe("initFillGame", () => {
  it("starts with one empty slot per blank and nothing selected", () => {
    const state = initFillGame(item());
    expect(state.placed).toEqual([null, null]);
    expect(state.selectedBlank).toBeNull();
    expect(state.checkResult).toBeNull();
  });

  it("counts the item as shown once — one graded decision per Slot", () => {
    expect(initFillGame(item()).result).toEqual({ shown: 1, correct: 0, incorrect: 0 });
  });
});

// ============================================================================
// targetBlank
// ============================================================================

describe("targetBlank", () => {
  it("is the first empty blank when nothing is selected", () => {
    expect(targetBlank(initFillGame(item()))).toBe(0);
  });

  it("skips already-filled blanks", () => {
    expect(targetBlank(withPlaced(item(), [0, null]))).toBe(1);
  });

  it("prefers an explicit selection over the first empty blank", () => {
    const state = { ...withPlaced(item(), [null, null]), selectedBlank: 1 };
    expect(targetBlank(state)).toBe(1);
  });

  it("returns null when every blank is filled", () => {
    expect(targetBlank(withPlaced(item(), [0, 1]))).toBeNull();
  });
});

// ============================================================================
// applyBlankTap
// ============================================================================

describe("applyBlankTap", () => {
  it("selects the tapped blank", () => {
    expect(applyBlankTap(initFillGame(item()), 1).selectedBlank).toBe(1);
  });

  it("re-tapping the same blank deselects it", () => {
    const once = applyBlankTap(initFillGame(item()), 1);
    expect(applyBlankTap(once, 1).selectedBlank).toBeNull();
  });

  it("is a no-op once the answer is checked", () => {
    const locked = applySubmit(withPlaced(item(), [0, 1]), item());
    expect(applyBlankTap(locked, 0)).toBe(locked);
  });
});

// ============================================================================
// applyTokenTap
// ============================================================================

describe("applyTokenTap", () => {
  it("fills blanks left to right with no blank taps at all", () => {
    const it = item();
    const first = applyTokenTap(initFillGame(it), 0);
    const second = applyTokenTap(first, 1);
    expect(second.placed).toEqual([0, 1]);
  });

  it("places into the selected blank", () => {
    const it = item();
    const aimed = applyBlankTap(initFillGame(it), 1);
    expect(applyTokenTap(aimed, 2).placed).toEqual([null, 2]);
  });

  it("clears the selection after placing, so filling continues left to right", () => {
    const it = item();
    const aimed = applyBlankTap(initFillGame(it), 1);
    const placed = applyTokenTap(aimed, 2);
    expect(placed.selectedBlank).toBeNull();
    // Next tap flows to blank 0 — the remaining empty one.
    expect(applyTokenTap(placed, 0).placed).toEqual([0, 2]);
  });

  it("moves a tile that already sits in another blank instead of duplicating it", () => {
    const it = item();
    const state = { ...withPlaced(it, [3, null]), selectedBlank: 1 };
    expect(applyTokenTap(state, 3).placed).toEqual([null, 3]);
  });

  it("returns a displaced tile to the pool when overwriting a filled blank", () => {
    const it = item();
    const state = { ...withPlaced(it, [0, 1]), selectedBlank: 0 };
    // Tile 2 replaces tile 0; tile 0 is simply no longer placed.
    expect(applyTokenTap(state, 2).placed).toEqual([2, 1]);
  });

  it("is a no-op when every blank is already filled and none is selected", () => {
    const full = withPlaced(item(), [0, 1]);
    expect(applyTokenTap(full, 2)).toBe(full);
  });

  it("is a no-op once the answer is checked", () => {
    const locked = applySubmit(withPlaced(item(), [0, 1]), item());
    expect(applyTokenTap(locked, 2)).toBe(locked);
  });
});

// ============================================================================
// applyBlankClear
// ============================================================================

describe("applyBlankClear", () => {
  it("empties the blank and returns its tile to the pool", () => {
    expect(applyBlankClear(withPlaced(item(), [0, 1]), 0).placed).toEqual([null, 1]);
  });

  it("leaves other blanks untouched", () => {
    expect(applyBlankClear(withPlaced(item(), [0, 1]), 1).placed).toEqual([0, null]);
  });

  it("is a no-op once the answer is checked", () => {
    const locked = applySubmit(withPlaced(item(), [0, 1]), item());
    expect(applyBlankClear(locked, 0)).toBe(locked);
  });
});

// ============================================================================
// isComplete
// ============================================================================

describe("isComplete", () => {
  it("is false while any blank is empty", () => {
    expect(isComplete(initFillGame(item()))).toBe(false);
    expect(isComplete(withPlaced(item(), [0, null]))).toBe(false);
  });

  it("is true when every blank holds a tile", () => {
    expect(isComplete(withPlaced(item(), [0, 1]))).toBe(true);
  });

  it("is true for an item with no blanks", () => {
    const noBlanks = item({ frame: ["Complete sentence."], blanks: [] });
    expect(isComplete(initFillGame(noBlanks))).toBe(true);
  });
});

// ============================================================================
// applySubmit — all-or-nothing grading
// ============================================================================

describe("applySubmit", () => {
  it("marks a fully correct placement correct", () => {
    const it = item();
    const state = applySubmit(withPlaced(it, [0, 1]), it);
    expect(state.checkResult).toBe("correct");
    expect(state.result).toEqual({ shown: 1, correct: 1, incorrect: 0 });
  });

  it("marks any wrong blank incorrect — one wrong tile fails the whole item", () => {
    const it = item();
    const state = applySubmit(withPlaced(it, [0, 3]), it); // "de Bus" in blank 1
    expect(state.checkResult).toBe("incorrect");
    expect(state.result).toEqual({ shown: 1, correct: 0, incorrect: 1 });
  });

  it("marks swapped tiles incorrect — position matters", () => {
    const it = item();
    expect(applySubmit(withPlaced(it, [1, 0]), it).checkResult).toBe("incorrect");
  });

  it("marks an incomplete placement incorrect", () => {
    const it = item();
    const state = applySubmit(withPlaced(it, [0, null]), it);
    expect(state.checkResult).toBe("incorrect");
  });

  it("accepts either of two tiles carrying the same text", () => {
    // Comparison is by text, not tile index: the duplicate must also count.
    const it = item({ blanks: ["ech", "ech"], tokens: ["ech", "ech", "du"] });
    expect(applySubmit(withPlaced(it, [0, 1]), it).checkResult).toBe("correct");
    expect(applySubmit(withPlaced(it, [1, 0]), it).checkResult).toBe("correct");
  });

  it("ignores casing, padding and trailing punctuation (normalizeAnswer)", () => {
    const it = item({ blanks: ["Gesinn!"], tokens: ["  gesinn "], frame: ["a ", " b"] });
    expect(applySubmit(withPlaced(it, [0]), it).checkResult).toBe("correct");
  });

  it("locks: a second submit does not accumulate another incorrect", () => {
    const it = item();
    const once = applySubmit(withPlaced(it, [0, 3]), it);
    expect(applySubmit(once, it)).toBe(once);
    expect(once.result.incorrect).toBe(1);
  });

  it("keeps the placed tiles visible during feedback", () => {
    const it = item();
    expect(applySubmit(withPlaced(it, [0, 3]), it).placed).toEqual([0, 3]);
  });
});

// ============================================================================
// toWordResultMap
// ============================================================================

describe("toWordResultMap", () => {
  it("emits exactly one entry, keyed by the item's fill key", () => {
    const it = item();
    const map = toWordResultMap(it, applySubmit(withPlaced(it, [0, 1]), it));
    expect(Object.keys(map)).toEqual([it.fillKey]);
    expect(map[it.fillKey]).toEqual({ shown: 1, correct: 1, incorrect: 0 });
  });

  it("reports the failure on the same single key", () => {
    const it = item();
    const map = toWordResultMap(it, applySubmit(withPlaced(it, [3, 3]), it));
    expect(map[it.fillKey]).toEqual({ shown: 1, correct: 0, incorrect: 1 });
  });
});

// ============================================================================
// correctSentence
// ============================================================================

describe("correctSentence", () => {
  it("interleaves frame segments with the blank answers", () => {
    expect(correctSentence(item())).toBe("Am Hannergrond gesinn ech d'Rad.");
  });

  it("handles a blank at the very start", () => {
    const it = item({ frame: ["", " ech."], blanks: ["Gesinn"] });
    expect(correctSentence(it)).toBe("Gesinn ech.");
  });

  it("handles a blank at the very end", () => {
    const it = item({ frame: ["Ech sinn ", ""], blanks: ["midd"] });
    expect(correctSentence(it)).toBe("Ech sinn midd");
  });

  it("returns the frame verbatim when there are no blanks", () => {
    expect(correctSentence(item({ frame: ["Nothing to fill."], blanks: [] }))).toBe(
      "Nothing to fill.",
    );
  });
});
