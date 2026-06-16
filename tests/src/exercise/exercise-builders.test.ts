import { describe, it, expect } from "vitest";

import {
  tokenizeSentence,
  buildWordMatchExercise,
  buildSentenceExercise,
} from "../../../src/exercise/exercise-builders.ts";

import type { SentenceEntry, WordEntry } from "../../../src/exercise/letz-parser.ts";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const word = (lu: string, en: string): WordEntry => ({ lu, en });

const sentence = (
  enVariants: string[],
  luVariants: string[],
  distractorsEn: string[] = [],
  distractorsLu: string[] = [],
): SentenceEntry => ({ enVariants, luVariants, distractorsEn, distractorsLu });

// ─── tokenizeSentence ─────────────────────────────────────────────────────────

describe("tokenizeSentence", () => {
  it("splits a plain sentence into word tokens", () => {
    expect(tokenizeSentence("Gudde Moien", "lu")).toEqual(["Gudde", "Moien"]);
    expect(tokenizeSentence("Good morning", "en")).toEqual(["Good", "morning"]);
  });

  it("strips trailing punctuation", () => {
    expect(tokenizeSentence("Moien!", "lu")).toEqual(["Moien"]);
    expect(tokenizeSentence("Hello, world.", "en")).toEqual(["Hello", "world"]);
  });

  it("splits LU contractions after the apostrophe", () => {
    // "d'Mamm" → ["d'", "Mamm"]
    expect(tokenizeSentence("d'Mamm", "lu")).toEqual(["d'", "Mamm"]);
  });

  it("splits EN contractions before the apostrophe", () => {
    // "Who's" → ["Who", "'s"]
    expect(tokenizeSentence("Who's", "en")).toEqual(["Who", "'s"]);
  });

  it("handles sentences with multiple contractions", () => {
    expect(tokenizeSentence("d'Mamm an d'Papp", "lu")).toEqual(["d'", "Mamm", "an", "d'", "Papp"]);
  });

  it("filters out empty tokens from multiple spaces", () => {
    expect(tokenizeSentence("Gudde  Moien", "lu")).toEqual(["Gudde", "Moien"]);
  });
});

// ─── buildWordMatchExercise ───────────────────────────────────────────────────

describe("buildWordMatchExercise", () => {
  it("returns a word-match exercise with pairs derived from entries", () => {
    const pairs = [word("Moien", "hi"), word("Äddi", "bye")];
    const exercise = buildWordMatchExercise(pairs);

    expect(exercise.type).toBe("word-match");
    expect(exercise.pairs).toHaveLength(2);
    expect(exercise.pairs[0]).toEqual(["Moien", "hi"]);
    expect(exercise.pairs[1]).toEqual(["Äddi", "bye"]);
  });

  it("returns empty pairs array for empty input", () => {
    expect(buildWordMatchExercise([]).pairs).toHaveLength(0);
  });
});

// ─── buildSentenceExercise ────────────────────────────────────────────────────

describe("buildSentenceExercise — en→lu direction", () => {
  it("sets promptText to the first EN variant", () => {
    const entry = sentence(["Good morning"], ["Gudde Moien"]);
    const ex = buildSentenceExercise(entry, "en-lu", []);
    expect(ex.item.promptText).toBe("Good morning");
  });

  it("sets acceptedAnswers to LU variants", () => {
    const entry = sentence(["Good morning"], ["Gudde Moien", "Moien"]);
    const ex = buildSentenceExercise(entry, "en-lu", []);
    expect(ex.item.acceptedAnswers).toEqual(["Gudde Moien", "Moien"]);
  });

  it("produces tokens covering all accepted variants (multiset union)", () => {
    // "Gudde Moien" needs tokens ["Gudde", "Moien"]
    // A second variant "Moien" only needs ["Moien"]
    // Union: max(1,0) "Gudde" + max(1,1) "Moien" = ["Gudde", "Moien"]
    const entry = sentence(["Good morning"], ["Gudde Moien", "Moien"]);
    const ex = buildSentenceExercise(entry, "en-lu", []);
    const tokenSet = new Set(ex.item.tokens);
    expect(tokenSet.has("Gudde")).toBe(true);
    expect(tokenSet.has("Moien")).toBe(true);
  });

  it("preserves duplicate tokens needed by any single variant", () => {
    // "d'Mamm an d'Papp" tokenises to ["d'", "Mamm", "an", "d'", "Papp"]
    // Two "d'" chips are required.
    const entry = sentence(["Mom and dad"], ["d'Mamm an d'Papp"]);
    const ex = buildSentenceExercise(entry, "en-lu", []);
    const dApostrophe = ex.item.tokens.filter((t) => t === "d'");
    expect(dApostrophe.length).toBeGreaterThanOrEqual(2);
  });

  it("uses authored LU distractors when provided", () => {
    const entry = sentence(["Good morning"], ["Gudde Moien"], [], ["Äddi", "Owend"]);
    const ex = buildSentenceExercise(entry, "en-lu", []);
    expect(ex.item.tokens).toContain("Äddi");
    expect(ex.item.tokens).toContain("Owend");
  });

  it("falls back to lessonVocab for distractors when none authored", () => {
    const entry = sentence(["Good morning"], ["Gudde Moien"]);
    const ex = buildSentenceExercise(entry, "en-lu", ["Äddi", "Merci", "Jo"]);
    // lessonVocab items not in the target tokens should appear as distractors
    expect(ex.item.tokens).toContain("Äddi");
  });

  it("records the phraseKey under the actual presented direction", () => {
    const entry = sentence(["Good morning"], ["Gudde Moien"]);
    // Each presentation direction is tracked separately so the error pool can
    // repeat the exact direction the user failed.
    expect(buildSentenceExercise(entry, "en-lu", []).item.phraseKey).toBe("phrase:en-lu:Good morning");
    expect(buildSentenceExercise(entry, "lu-en", []).item.phraseKey).toBe("phrase:lu-en:Good morning");
  });

  it("sets direction field", () => {
    const entry = sentence(["Good morning"], ["Gudde Moien"]);
    expect(buildSentenceExercise(entry, "en-lu", []).item.direction).toBe("en-lu");
  });
});

describe("buildSentenceExercise — lu→en direction", () => {
  it("sets promptText to the first LU variant", () => {
    const entry = sentence(["Good morning"], ["Gudde Moien"]);
    const ex = buildSentenceExercise(entry, "lu-en", []);
    expect(ex.item.promptText).toBe("Gudde Moien");
  });

  it("sets acceptedAnswers to EN variants", () => {
    const entry = sentence(["Good morning", "Morning"], ["Gudde Moien"]);
    const ex = buildSentenceExercise(entry, "lu-en", []);
    expect(ex.item.acceptedAnswers).toEqual(["Good morning", "Morning"]);
  });

  it("uses authored EN distractors when provided", () => {
    const entry = sentence(["Good morning"], ["Gudde Moien"], ["Goodbye", "Evening"]);
    const ex = buildSentenceExercise(entry, "lu-en", []);
    expect(ex.item.tokens).toContain("Goodbye");
  });

  it("direction field is lu-en", () => {
    const entry = sentence(["Good morning"], ["Gudde Moien"]);
    expect(buildSentenceExercise(entry, "lu-en", []).item.direction).toBe("lu-en");
  });
});
