import { describe, it, expect } from "vitest";

import {
  normalizeAnswer,
  joinAssembled,
  initSentenceGame,
  applyTokenTap,
  applyAssembledTap,
  applySubmit,
  toWordResultMap,
} from "../../../../src/exercise/SentenceBuilder/sentence-logic.ts";
import type { SentenceBuilderItem } from "../../../../src/exercise/types.ts";
import type { SentenceGameState } from "../../../../src/exercise/SentenceBuilder/types.ts";

// ============================================================================
// Fixtures
// item.tokens = ["Gudde", "Moien", "!", "schlecht"]  (indices 0, 1, 2, 3)
// acceptedAnswers = ["Gudde Moien!", "Gudde Moien"]
// ============================================================================

const item = (overrides: Partial<SentenceBuilderItem> = {}): SentenceBuilderItem => ({
  promptText: "Good morning!",
  acceptedAnswers: ["Gudde Moien!", "Gudde Moien"],
  tokens: ["Gudde", "Moien", "!", "schlecht"],
  direction: "en-lu",
  phraseKey: "phrase:en-lu:Good morning!",
  ...overrides,
});

/** Construct a state with specific token indices already assembled. */
const withAssembled = (indices: number[]): SentenceGameState => ({
  ...initSentenceGame(),
  assembled: indices,
});

// ============================================================================
// joinAssembled
// ============================================================================

describe("joinAssembled", () => {
  it("joins plain words with spaces", () => {
    expect(joinAssembled(["Hello", "world"])).toBe("Hello world");
  });

  it("EN contraction: no space before suffix chip starting with apostrophe", () => {
    expect(joinAssembled(["I", "'m", "fine"])).toBe("I'm fine");
    expect(joinAssembled(["Who", "'s", "there"])).toBe("Who's there");
    expect(joinAssembled(["don", "'t", "stop"])).toBe("don't stop");
  });

  it("LU contraction: no space after prefix chip ending with apostrophe", () => {
    expect(joinAssembled(["d'", "Mamm"])).toBe("d'Mamm");
    expect(joinAssembled(["D'", "Zopp", "ass", "gutt"])).toBe("D'Zopp ass gutt");
  });

  it("empty array returns empty string", () => {
    expect(joinAssembled([])).toBe("");
  });
});

// ============================================================================
// normalizeAnswer
// ============================================================================

describe("normalizeAnswer", () => {
  it("trims and lowercases", () => {
    expect(normalizeAnswer("  Hello  ")).toBe("hello");
  });

  it("collapses internal whitespace", () => {
    expect(normalizeAnswer("I  am  fine")).toBe("i am fine");
  });

  it("strips trailing punctuation", () => {
    expect(normalizeAnswer("Gudde Moien!")).toBe("gudde moien");
    expect(normalizeAnswer("What is your name?")).toBe("what is your name");
  });

  it("strips apostrophes for comparison", () => {
    expect(normalizeAnswer("What's your name?")).toBe("whats your name");
    expect(normalizeAnswer("I'm fine.")).toBe("im fine");
  });
});

// ============================================================================
// initSentenceGame
// ============================================================================

describe("initSentenceGame", () => {
  it("assembled starts empty", () => {
    expect(initSentenceGame().assembled).toEqual([]);
  });

  it("result initialised with shown=1", () => {
    expect(initSentenceGame().result).toEqual({ shown: 1, correct: 0, incorrect: 0 });
  });

  it("checkResult starts as null", () => {
    expect(initSentenceGame().checkResult).toBeNull();
  });
});

// ============================================================================
// applyTokenTap
// ============================================================================

describe("applyTokenTap", () => {
  it("appends token index to assembled", () => {
    const state = initSentenceGame();
    const next = applyTokenTap(state, 0);
    expect(next.assembled).toEqual([0]);
  });

  it("appending second token preserves order", () => {
    let state = initSentenceGame();
    state = applyTokenTap(state, 0); // "Gudde"
    state = applyTokenTap(state, 1); // "Moien"
    expect(state.assembled).toEqual([0, 1]);
  });

  it("same index can be added (handles duplicates in tokens list correctly)", () => {
    const state = initSentenceGame();
    const next = applyTokenTap(state, 2);
    expect(next.assembled).toContain(2);
  });
});

// ============================================================================
// applyAssembledTap
// ============================================================================

describe("applyAssembledTap", () => {
  it("removes the token at assembledPos", () => {
    const state = withAssembled([0, 1, 2]);
    const next = applyAssembledTap(state, 1); // remove second assembled
    expect(next.assembled).toEqual([0, 2]);
  });

  it("removing first assembled token preserves the rest", () => {
    const state = withAssembled([0, 1]);
    const next = applyAssembledTap(state, 0);
    expect(next.assembled).toEqual([1]);
  });

  it("no-op on out-of-bounds assembledPos", () => {
    const state = withAssembled([0]);
    const next = applyAssembledTap(state, 5);
    expect(next.assembled).toEqual([0]);
  });
});

// ============================================================================
// applySubmit
// ============================================================================

describe("applySubmit", () => {
  it("correct match → checkResult: 'correct', result.correct: 1", () => {
    const state = withAssembled([0, 1, 2]); // "Gudde Moien !" → normalized → "gudde moien"
    const next = applySubmit(state, item());
    expect(next.checkResult).toBe("correct");
    expect(next.result.correct).toBe(1);
  });

  it("correct second variant match (no punctuation token)", () => {
    const state = withAssembled([0, 1]); // "Gudde Moien"
    const next = applySubmit(state, item());
    expect(next.checkResult).toBe("correct");
  });

  it("contraction chips rejoin correctly before comparison", () => {
    const contractionItem = item({
      acceptedAnswers: ["I'm fine."],
      tokens: ["I", "'m", "fine"],
    });
    const state = withAssembled([0, 1, 2]); // "I", "'m", "fine" → "I'm fine"
    const next = applySubmit(state, contractionItem);
    expect(next.checkResult).toBe("correct");
  });

  it("wrong answer → checkResult: 'incorrect', result.incorrect incremented", () => {
    const state = withAssembled([3, 1]); // "schlecht Moien"
    const next = applySubmit(state, item());
    expect(next.checkResult).toBe("incorrect");
    expect(next.result.incorrect).toBe(1);
  });

  it("incorrect → assembled stays (chips remain visible for feedback)", () => {
    const state = withAssembled([3, 1]);
    const next = applySubmit(state, item());
    expect(next.assembled).toEqual([3, 1]); // not cleared
  });

  it("two failures then correct → result tracks all attempts", () => {
    let state = withAssembled([3]); // wrong
    state = applySubmit(state, item());            // fail 1
    state = { ...state, assembled: [3] };          // wrong again
    state = applySubmit(state, item());            // fail 2
    state = { ...state, assembled: [0, 1] };       // correct
    state = applySubmit(state, item());            // correct
    expect(state.result).toEqual({ shown: 1, correct: 1, incorrect: 2 });
  });
});

// ============================================================================
// toWordResultMap
// ============================================================================

describe("toWordResultMap", () => {
  it("returns map keyed by phraseKey with state.result as value", () => {
    const i = item();
    const state = { ...initSentenceGame(), result: { shown: 1, correct: 1, incorrect: 0 } };
    const map = toWordResultMap(i, state);
    expect(map[i.phraseKey]).toEqual(state.result);
    expect(Object.keys(map)).toHaveLength(1);
  });
});
