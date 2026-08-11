import { describe, it, expect } from "vitest";

// @ts-expect-error - zero-dep .mjs tool, no type declarations by design
import {
  SUGGEST_ATTEMPTS,
  retryWhileEmpty,
  slimEntry,
  wordList,
} from "../../tools/lod-mcp/lib/lod-client.mjs";

// ============================================================================
// Helpers
// ============================================================================

type Meaning = {
  number: number | null;
  declensionInfo: string | null;
  translations: string[];
  clarifiers: string[];
  examples: string[];
};

const meaning = (
  translations: string[],
  clarifiers: string[] = [],
): Meaning => ({ number: 1, declensionInfo: null, translations, clarifiers, examples: [] });

/** Shaped like `getEntry`'s output — the input `slimEntry` projects from. */
const entry = (
  lemma: string,
  partOfSpeech: string | null,
  gender: string | null,
  meanings: Meaning[],
) => ({ lod_id: `id-${lemma}`, lemma, partOfSpeech, gender, ipa: "ˈtest", meanings });

// ============================================================================
// slimEntry
// ============================================================================

describe("slimEntry", () => {
  it("keeps lemma, pos and gender — gender fixes the LU article", () => {
    const slim = slimEntry(entry("Kaffi", "SUBST+M", "m", [meaning(["coffee"])]));

    expect(slim).toEqual({ lemma: "Kaffi", pos: "SUBST+M", gender: "m", senses: ["coffee"] });
  });

  it("drops ipa and declensionInfo — never consulted to pick a gloss", () => {
    const slim = slimEntry(entry("Haus", "SUBST+N", "n", [meaning(["house"])]));

    expect(slim).not.toHaveProperty("ipa");
    expect(slim).not.toHaveProperty("meanings");
  });

  it("appends the clarifier, which is what disambiguates a repeated gloss", () => {
    const slim = slimEntry(
      entry("Kaffi", "SUBST+M", "m", [
        meaning(["coffee"], ["plant"]),
        meaning(["coffee"], ["beans"]),
        meaning(["breakfast"]),
      ]),
    );

    expect(slim.senses).toEqual(["coffee (plant)", "coffee (beans)", "breakfast"]);
  });

  it("deduplicates senses that collapse to identical text", () => {
    const slim = slimEntry(
      entry("gesinn", "VRB", null, [
        meaning(["to see"]),
        meaning(["to see"]),
        meaning(["to not be able to stand"]),
      ]),
    );

    expect(slim.senses).toEqual(["to see", "to not be able to stand"]);
  });

  it("does not merge same-translation senses that carry different clarifiers", () => {
    const slim = slimEntry(
      entry("Bank", "SUBST+F", "f", [
        meaning(["bank"], ["financial institute"]),
        meaning(["bank"], ["branch"]),
      ]),
    );

    expect(slim.senses).toEqual(["bank (financial institute)", "bank (branch)"]);
  });

  it("joins multi-translation and multi-clarifier senses", () => {
    const slim = slimEntry(
      entry("Bänk", "SUBST+F", "f", [meaning(["(school) desk", "pew"], ["seat", "furniture"])]),
    );

    expect(slim.senses).toEqual(["(school) desk, pew (seat, furniture)"]);
  });

  it("skips a meaning with no translation rather than emitting an empty sense", () => {
    const slim = slimEntry(
      entry("Test", "SUBST+M", "m", [meaning([], ["orphan clarifier"]), meaning(["test"])]),
    );

    expect(slim.senses).toEqual(["test"]);
  });

  it("yields an empty sense list for an entry with no meanings", () => {
    expect(slimEntry(entry("Leer", "SUBST+F", "f", [])).senses).toEqual([]);
  });

  it("preserves a null gender for non-nouns", () => {
    expect(slimEntry(entry("goen", "VRB", null, [meaning(["to go"])])).gender).toBeNull();
  });
});

// ============================================================================
// wordList
// ============================================================================

describe("wordList", () => {
  it("accepts the batch form", () => {
    expect(wordList({ words: ["Kaffi", "Brout"] })).toEqual(["Kaffi", "Brout"]);
  });

  it("accepts the single-word convenience form", () => {
    expect(wordList({ word: "Kaffi" })).toEqual(["Kaffi"]);
  });

  it("merges both forms when given together", () => {
    expect(wordList({ words: ["Brout"], word: "Kaffi" })).toEqual(["Brout", "Kaffi"]);
  });

  it("trims surrounding whitespace and drops blank entries", () => {
    expect(wordList({ words: ["  Kaffi  ", "", "   ", "Brout"] })).toEqual(["Kaffi", "Brout"]);
  });

  it("keeps duplicates — lookupMany owns collapsing them", () => {
    expect(wordList({ words: ["Kaffi", "Kaffi"] })).toEqual(["Kaffi", "Kaffi"]);
  });

  it("throws when neither form is supplied", () => {
    expect(() => wordList({})).toThrow(/Provide/);
    expect(() => wordList()).toThrow(/Provide/);
    expect(() => wordList({ words: [] })).toThrow(/Provide/);
  });

  it("ignores a non-array `words` instead of crashing", () => {
    expect(wordList({ words: "Kaffi" as unknown as string[], word: "Brout" })).toEqual(["Brout"]);
  });
});

// ============================================================================
// retryWhileEmpty
//
// Guards the workaround for lod.lu's nondeterministic spellchecker: the same
// request returns the real suggestion or `[]` at random (measured 6/12 empty).
// An empty list is meaningful to the authoring contract ("legitimate inflected
// form"), so a flaky empty would silently clear a real misspelling.
// ============================================================================

/** Returns each queued value in turn, recording how many calls it received. */
const stub = (...queue: string[][]) => {
  const calls: number[] = [];
  const fn = () => {
    calls.push(1);
    return Promise.resolve(queue[Math.min(calls.length - 1, queue.length - 1)]);
  };
  return { fn, count: () => calls.length };
};

describe("retryWhileEmpty", () => {
  it("returns the first non-empty result without further calls", async () => {
    const s = stub(["Lëtzebuergesch"]);

    expect(await retryWhileEmpty(s.fn, 3)).toEqual(["Lëtzebuergesch"]);
    expect(s.count()).toBe(1);
  });

  it("retries past a flaky empty and recovers the real suggestion", async () => {
    const s = stub([], [], ["Waasser"]);

    expect(await retryWhileEmpty(s.fn, 3)).toEqual(["Waasser"]);
    expect(s.count()).toBe(3);
  });

  it("stops as soon as a retry succeeds", async () => {
    const s = stub([], ["Butteker"], ["never reached"]);

    expect(await retryWhileEmpty(s.fn, 3)).toEqual(["Butteker"]);
    expect(s.count()).toBe(2);
  });

  it("gives up after `attempts` and reports empty — never invents a suggestion", async () => {
    const s = stub([]);

    expect(await retryWhileEmpty(s.fn, 3)).toEqual([]);
    expect(s.count()).toBe(3);
  });

  it("still calls once when attempts is 0 or negative", async () => {
    const zero = stub(["x"]);
    expect(await retryWhileEmpty(zero.fn, 0)).toEqual(["x"]);
    expect(zero.count()).toBe(1);

    const negative = stub(["x"]);
    expect(await retryWhileEmpty(negative.fn, -5)).toEqual(["x"]);
    expect(negative.count()).toBe(1);
  });

  it("defaults to the measured attempt count", async () => {
    const s = stub([]);
    await retryWhileEmpty(s.fn);

    expect(SUGGEST_ATTEMPTS).toBe(3);
    expect(s.count()).toBe(SUGGEST_ATTEMPTS);
  });
});
