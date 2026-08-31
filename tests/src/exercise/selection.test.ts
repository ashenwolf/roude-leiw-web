import { describe, it, expect } from "vitest";

import { bucketedPick, pickFromPool, pickPair, pickPhrase } from "../../../src/exercise/selection.ts";
import { FIX_ERRORS, LESSON, WORD_MIX } from "../../../src/exercise/constants.ts";

import type { Lesson, SentenceEntry, WordEntry } from "../../../src/exercise/letz-parser.ts";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const word = (lu: string, en: string): WordEntry => ({ lu, en });

const sentence = (firstEn: string, ...luVariants: string[]): SentenceEntry => ({
  luVariants,
  enVariants: [firstEn],
  distractorsEn: [],
  distractorsLu: [],
});

const lesson = (id: string, words: WordEntry[], sentences: SentenceEntry[] = []): Lesson => ({
  meta: { id, title: id, level: "A1" },
  entries: words,
  sentences,
  fills: [],
});

/** A fake RNG that returns a queue of predetermined values. */
const fakeRng = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
};

// ─── bucketedPick ─────────────────────────────────────────────────────────────

describe("bucketedPick", () => {
  it("selects the first bucket whose upTo > roll", () => {
    expect(bucketedPick(0.0, FIX_ERRORS.buckets.slotType)).toBe("word-match");
    expect(bucketedPick(0.19, FIX_ERRORS.buckets.slotType)).toBe("word-match");
    expect(bucketedPick(0.2, FIX_ERRORS.buckets.slotType)).toBe("sentence-builder");
    expect(bucketedPick(0.74, FIX_ERRORS.buckets.slotType)).toBe("sentence-builder");
    expect(bucketedPick(0.75, FIX_ERRORS.buckets.slotType)).toBe("fill-blank");
    expect(bucketedPick(0.99, FIX_ERRORS.buckets.slotType)).toBe("fill-blank");
  });

  it("maps lesson word-match buckets correctly", () => {
    expect(bucketedPick(0.0, LESSON.buckets.wordMatch)).toBe("not-yet-mastered");
    expect(bucketedPick(0.29, LESSON.buckets.wordMatch)).toBe("not-yet-mastered");
    expect(bucketedPick(0.3, LESSON.buckets.wordMatch)).toBe("current");
    expect(bucketedPick(0.84, LESSON.buckets.wordMatch)).toBe("current");
    expect(bucketedPick(0.85, LESSON.buckets.wordMatch)).toBe("previous");
    expect(bucketedPick(0.99, LESSON.buckets.wordMatch)).toBe("previous");
  });

  it("maps word-mix buckets correctly", () => {
    expect(bucketedPick(0.0, WORD_MIX.buckets.pairSource)).toBe("errors");
    expect(bucketedPick(0.24, WORD_MIX.buckets.pairSource)).toBe("errors");
    expect(bucketedPick(0.25, WORD_MIX.buckets.pairSource)).toBe("current");
    expect(bucketedPick(0.49, WORD_MIX.buckets.pairSource)).toBe("current");
    expect(bucketedPick(0.5, WORD_MIX.buckets.pairSource)).toBe("previous");
    expect(bucketedPick(0.99, WORD_MIX.buckets.pairSource)).toBe("previous");
  });

  it("falls back to the last bucket for a roll of exactly 1.0", () => {
    // Edge case: roll = 1.0 exceeds all `upTo` bounds.
    expect(bucketedPick(1.0, LESSON.buckets.wordMatch)).toBe("previous");
  });
});

// ─── pickFromPool ─────────────────────────────────────────────────────────────

describe("pickFromPool", () => {
  const current = [word("A", "a"), word("B", "b")];
  const previous = [word("C", "c")];
  const pools = { "not-yet-mastered": [], current, previous };

  it("picks from the bucket that the roll selects", () => {
    // roll=0.5 → 'current' bucket; index roll=0.0 → candidates[0]
    const rng = fakeRng(0.5, 0.0);
    const result = pickFromPool(pools, LESSON.buckets.wordMatch, rng);
    expect(result).toEqual(word("A", "a"));
  });

  it("re-rolls when the selected bucket is empty", () => {
    // First roll → 'previous' bucket (empty here), second roll → 'current' bucket
    const rng = fakeRng(0.9, 0.5, 0.0);
    const result = pickFromPool(
      { "not-yet-mastered": [], current, previous: [] },
      LESSON.buckets.wordMatch,
      rng,
    );
    expect(result).toBeDefined();
    expect(current).toContainEqual(result);
  });

  it("returns undefined when all pools are empty", () => {
    const result = pickFromPool(
      { "not-yet-mastered": [], current: [], previous: [] },
      LESSON.buckets.wordMatch,
    );
    expect(result).toBeUndefined();
  });

  it("allows duplicate picks (with-replacement sampling)", () => {
    // Always roll into 'current' bucket, always pick index 0 — produces duplicates
    const rng = fakeRng(0.5, 0.0);
    const r1 = pickFromPool(pools, LESSON.buckets.wordMatch, rng);
    const r2 = pickFromPool(pools, LESSON.buckets.wordMatch, rng);
    expect(r1).toEqual(r2);
  });

  it("distributes across all three word-mix buckets", () => {
    const errors = [word("E", "e")];
    const cur = [word("C", "c")];
    const prev = [word("P", "p")];

    expect(
      pickFromPool({ errors, current: cur, previous: prev }, WORD_MIX.buckets.pairSource, fakeRng(0.1, 0.0)),
    ).toEqual(word("E", "e"));

    expect(
      pickFromPool({ errors, current: cur, previous: prev }, WORD_MIX.buckets.pairSource, fakeRng(0.3, 0.0)),
    ).toEqual(word("C", "c"));

    expect(
      pickFromPool({ errors, current: cur, previous: prev }, WORD_MIX.buckets.pairSource, fakeRng(0.7, 0.0)),
    ).toEqual(word("P", "p"));
  });
});

// ─── pickPair ─────────────────────────────────────────────────────────────────

describe("pickPair", () => {
  it("returns a WordEntry from the selected bucket", () => {
    const current = [word("Moien", "hi")];
    const previous = [word("Äddi", "bye")];
    // roll 0.5 → current bucket, pick index 0
    const rng = fakeRng(0.5, 0.0);
    const result = pickPair(
      { "not-yet-mastered": [], current, previous },
      LESSON.buckets.wordMatch,
      rng,
    );
    expect(result).toEqual(word("Moien", "hi"));
  });

  it("re-rolls when current is empty", () => {
    const previous = [word("Äddi", "bye")];
    // First roll → current (empty) → re-roll → previous
    const rng = fakeRng(0.5, 0.9, 0.0);
    const result = pickPair(
      { "not-yet-mastered": [], current: [], previous },
      LESSON.buckets.wordMatch,
      rng,
    );
    expect(result).toEqual(word("Äddi", "bye"));
  });

  it("returns undefined when all pools empty", () => {
    expect(
      pickPair(
        { "not-yet-mastered": [], current: [], previous: [] },
        LESSON.buckets.wordMatch,
      ),
    ).toBeUndefined();
  });
});

// ─── pickPhrase ───────────────────────────────────────────────────────────────

describe("pickPhrase", () => {
  const sent = sentence("Good morning", "Gudde Moien");
  const currentLesson = lesson("L1", [], [sent]);
  const previousLesson = lesson("L2", [], [sentence("Goodbye", "Äddi")]);

  it("picks from current lesson bucket and returns lesson + phrase", () => {
    // roll 0.5 → current bucket; lesson index 0; phrase index 0
    const rng = fakeRng(0.5, 0.0, 0.0);
    const result = pickPhrase(
      { "not-yet-mastered": [], current: [currentLesson], previous: [previousLesson] },
      LESSON.buckets.phraseLesson,
      rng,
    );
    expect(result?.lesson.meta.id).toBe("L1");
    expect(result?.phrase.kind).toBe("sentence");
    expect(result?.phrase.kind === "sentence" && result.phrase.sentence.enVariants[0]).toBe(
      "Good morning",
    );
  });

  it("picks from previous lesson bucket when roll hits previous", () => {
    // roll → previous bucket; lesson index 0; phrase index 0
    const rng = fakeRng(0.9, 0.0, 0.0);
    const result = pickPhrase(
      { "not-yet-mastered": [], current: [currentLesson], previous: [previousLesson] },
      LESSON.buckets.phraseLesson,
      rng,
    );
    expect(result?.lesson.meta.id).toBe("L2");
    expect(result?.phrase.kind === "sentence" && result.phrase.sentence.enVariants[0]).toBe(
      "Goodbye",
    );
  });

  it("re-rolls when current lesson pool is empty", () => {
    // First → current (empty) → continue; second → previous → lesson 0; phrase 0
    const rng = fakeRng(0.5, 0.9, 0.0, 0.0);
    const result = pickPhrase(
      { "not-yet-mastered": [], current: [], previous: [previousLesson] },
      LESSON.buckets.phraseLesson,
      rng,
    );
    expect(result?.lesson.meta.id).toBe("L2");
  });

  it("returns undefined when all lesson pools are empty", () => {
    expect(
      pickPhrase(
        { "not-yet-mastered": [], current: [], previous: [] },
        LESSON.buckets.phraseLesson,
      ),
    ).toBeUndefined();
  });

  it("returns undefined when chosen lesson teaches no phrases", () => {
    const emptyLesson = lesson("L3", [word("A", "a")], []);
    // roll 0.5 → current bucket; lesson index 0 → emptyLesson (no phrases)
    const rng = fakeRng(0.5, 0.0);
    const result = pickPhrase(
      { "not-yet-mastered": [], current: [emptyLesson], previous: [] },
      LESSON.buckets.phraseLesson,
      rng,
    );
    expect(result).toBeUndefined();
  });

  // The reason sentences and fills share one pool: a fill is drawn on the same
  // terms as a sentence, so exposure follows how many of each a lesson declares
  // rather than a tuned share constant.
  it("draws fills from the same pool as sentences", () => {
    const withFill = {
      ...lesson("L4", [], [sentence("Good morning", "Gudde Moien")]),
      fills: [{ en: "I go [to] work", lu: "Ech ginn [op] d'Aarbecht" }],
    };
    // roll 0.5 → current bucket; lesson index 0; phrase index 1 → the fill
    const rng = fakeRng(0.5, 0.0, 0.99);
    const result = pickPhrase(
      { "not-yet-mastered": [], current: [withFill], previous: [] },
      LESSON.buckets.phraseLesson,
      rng,
    );
    expect(result?.phrase.kind).toBe("fill");
  });
});
