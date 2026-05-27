import { describe, it, expect } from "vitest";

import { bucketedPick, pickFromPool, pickPair, pickSentence } from "../../../src/exercise/selection.ts";
import {
  SLOT_TYPE_DISTRIBUTION,
  LESSON_WORD_MATCH_BUCKETS,
  LESSON_SENTENCE_LESSON_BUCKETS,
  WORD_MIX_BUCKETS,
} from "../../../src/exercise/constants.ts";

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
});

/** A fake RNG that returns a queue of predetermined values. */
const fakeRng = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
};

// ─── bucketedPick ─────────────────────────────────────────────────────────────

describe("bucketedPick", () => {
  it("selects the first bucket whose upTo > roll", () => {
    expect(bucketedPick(0.0, SLOT_TYPE_DISTRIBUTION)).toBe("word-match");
    expect(bucketedPick(0.19, SLOT_TYPE_DISTRIBUTION)).toBe("word-match");
    expect(bucketedPick(0.2, SLOT_TYPE_DISTRIBUTION)).toBe("sentence-builder");
    expect(bucketedPick(0.99, SLOT_TYPE_DISTRIBUTION)).toBe("sentence-builder");
  });

  it("maps lesson word-match buckets correctly", () => {
    expect(bucketedPick(0.0, LESSON_WORD_MATCH_BUCKETS)).toBe("under-exposed");
    expect(bucketedPick(0.29, LESSON_WORD_MATCH_BUCKETS)).toBe("under-exposed");
    expect(bucketedPick(0.3, LESSON_WORD_MATCH_BUCKETS)).toBe("current");
    expect(bucketedPick(0.84, LESSON_WORD_MATCH_BUCKETS)).toBe("current");
    expect(bucketedPick(0.85, LESSON_WORD_MATCH_BUCKETS)).toBe("previous");
    expect(bucketedPick(0.99, LESSON_WORD_MATCH_BUCKETS)).toBe("previous");
  });

  it("maps word-mix buckets correctly", () => {
    expect(bucketedPick(0.0, WORD_MIX_BUCKETS)).toBe("errors");
    expect(bucketedPick(0.24, WORD_MIX_BUCKETS)).toBe("errors");
    expect(bucketedPick(0.25, WORD_MIX_BUCKETS)).toBe("current");
    expect(bucketedPick(0.49, WORD_MIX_BUCKETS)).toBe("current");
    expect(bucketedPick(0.5, WORD_MIX_BUCKETS)).toBe("previous");
    expect(bucketedPick(0.99, WORD_MIX_BUCKETS)).toBe("previous");
  });

  it("falls back to the last bucket for a roll of exactly 1.0", () => {
    // Edge case: roll = 1.0 exceeds all `upTo` bounds.
    expect(bucketedPick(1.0, LESSON_WORD_MATCH_BUCKETS)).toBe("previous");
  });
});

// ─── pickFromPool ─────────────────────────────────────────────────────────────

describe("pickFromPool", () => {
  const current = [word("A", "a"), word("B", "b")];
  const previous = [word("C", "c")];
  const pools = { "under-exposed": [], current, previous };

  it("picks from the bucket that the roll selects", () => {
    // roll=0.5 → 'current' bucket; index roll=0.0 → candidates[0]
    const rng = fakeRng(0.5, 0.0);
    const result = pickFromPool(pools, LESSON_WORD_MATCH_BUCKETS, rng);
    expect(result).toEqual(word("A", "a"));
  });

  it("re-rolls when the selected bucket is empty", () => {
    // First roll → 'previous' bucket (empty here), second roll → 'current' bucket
    const rng = fakeRng(0.9, 0.5, 0.0);
    const result = pickFromPool(
      { "under-exposed": [], current, previous: [] },
      LESSON_WORD_MATCH_BUCKETS,
      rng,
    );
    expect(result).toBeDefined();
    expect(current).toContainEqual(result);
  });

  it("returns undefined when all pools are empty", () => {
    const result = pickFromPool(
      { "under-exposed": [], current: [], previous: [] },
      LESSON_WORD_MATCH_BUCKETS,
    );
    expect(result).toBeUndefined();
  });

  it("allows duplicate picks (with-replacement sampling)", () => {
    // Always roll into 'current' bucket, always pick index 0 — produces duplicates
    const rng = fakeRng(0.5, 0.0);
    const r1 = pickFromPool(pools, LESSON_WORD_MATCH_BUCKETS, rng);
    const r2 = pickFromPool(pools, LESSON_WORD_MATCH_BUCKETS, rng);
    expect(r1).toEqual(r2);
  });

  it("distributes across all three word-mix buckets", () => {
    const errors = [word("E", "e")];
    const cur = [word("C", "c")];
    const prev = [word("P", "p")];

    expect(
      pickFromPool({ errors, current: cur, previous: prev }, WORD_MIX_BUCKETS, fakeRng(0.1, 0.0)),
    ).toEqual(word("E", "e"));

    expect(
      pickFromPool({ errors, current: cur, previous: prev }, WORD_MIX_BUCKETS, fakeRng(0.3, 0.0)),
    ).toEqual(word("C", "c"));

    expect(
      pickFromPool({ errors, current: cur, previous: prev }, WORD_MIX_BUCKETS, fakeRng(0.7, 0.0)),
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
      { "under-exposed": [], current, previous },
      LESSON_WORD_MATCH_BUCKETS,
      rng,
    );
    expect(result).toEqual(word("Moien", "hi"));
  });

  it("re-rolls when current is empty", () => {
    const previous = [word("Äddi", "bye")];
    // First roll → current (empty) → re-roll → previous
    const rng = fakeRng(0.5, 0.9, 0.0);
    const result = pickPair(
      { "under-exposed": [], current: [], previous },
      LESSON_WORD_MATCH_BUCKETS,
      rng,
    );
    expect(result).toEqual(word("Äddi", "bye"));
  });

  it("returns undefined when all pools empty", () => {
    expect(
      pickPair(
        { "under-exposed": [], current: [], previous: [] },
        LESSON_WORD_MATCH_BUCKETS,
      ),
    ).toBeUndefined();
  });
});

// ─── pickSentence ─────────────────────────────────────────────────────────────

describe("pickSentence", () => {
  const sent = sentence("Good morning", "Gudde Moien");
  const currentLesson = lesson("L1", [], [sent]);
  const previousLesson = lesson("L2", [], [sentence("Goodbye", "Äddi")]);

  it("picks from current lesson bucket and returns lesson + sentence", () => {
    // roll 0.5 → current bucket; lesson index 0; sentence index 0
    const rng = fakeRng(0.5, 0.0, 0.0);
    const result = pickSentence(
      { "under-exposed": [], current: [currentLesson], previous: [previousLesson] },
      LESSON_SENTENCE_LESSON_BUCKETS,
      rng,
    );
    expect(result?.lesson.meta.id).toBe("L1");
    expect(result?.sentence.enVariants[0]).toBe("Good morning");
  });

  it("picks from previous lesson bucket when roll hits previous", () => {
    // roll → previous bucket; lesson index 0; sentence index 0
    const rng = fakeRng(0.9, 0.0, 0.0);
    const result = pickSentence(
      { "under-exposed": [], current: [currentLesson], previous: [previousLesson] },
      LESSON_SENTENCE_LESSON_BUCKETS,
      rng,
    );
    expect(result?.lesson.meta.id).toBe("L2");
    expect(result?.sentence.enVariants[0]).toBe("Goodbye");
  });

  it("re-rolls when current lesson pool is empty", () => {
    // First → current (empty) → continue; second → previous → lesson 0; sentence 0
    const rng = fakeRng(0.5, 0.9, 0.0, 0.0);
    const result = pickSentence(
      { "under-exposed": [], current: [], previous: [previousLesson] },
      LESSON_SENTENCE_LESSON_BUCKETS,
      rng,
    );
    expect(result?.lesson.meta.id).toBe("L2");
  });

  it("returns undefined when all lesson pools are empty", () => {
    expect(
      pickSentence(
        { "under-exposed": [], current: [], previous: [] },
        LESSON_SENTENCE_LESSON_BUCKETS,
      ),
    ).toBeUndefined();
  });

  it("returns undefined when chosen lesson has no sentences", () => {
    const emptyLesson = lesson("L3", [word("A", "a")], []);
    // roll 0.5 → current bucket; lesson index 0 → emptyLesson (no sentences)
    const rng = fakeRng(0.5, 0.0);
    const result = pickSentence(
      { "under-exposed": [], current: [emptyLesson], previous: [] },
      LESSON_SENTENCE_LESSON_BUCKETS,
      rng,
    );
    expect(result).toBeUndefined();
  });
});
