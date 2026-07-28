import type { WordPair } from "./WordMatch/types";

// Exercise type registry — extend as new exercise types are added
export const EXERCISE_TYPE = {
  WordMatch: "word-match",
  SentenceBuilder: "sentence-builder",
} as const;

export type ExerciseType = typeof EXERCISE_TYPE[keyof typeof EXERCISE_TYPE];

// Opaque exercise batch — each type carries its own data shape

/** Match Luxembourgish words to their English translations. One Step per pair. */
export type WordMatchBatch = {
  type: "word-match";
  /** `[lu, en]` pairs to match. Selection is the Mode planner's job. */
  pairs: WordPair[];
};

/** Everything the SentenceBuilder UI needs to render and grade one puzzle. */
export type SentenceBuilderItem = {
  /** The sentence to translate, in the source language of `direction`. */
  promptText: string;
  /** Every answer variant accepted as correct, in the target language. */
  acceptedAnswers: string[];
  /** Shuffled tiles: the answer tokens plus distractors. */
  tokens: string[];
  /** Which way the puzzle is presented — decides prompt/answer languages. */
  direction: "en-lu" | "lu-en";
  /** Stat key for this phrase in this direction (`phrase:{direction}:{firstEn}`). */
  phraseKey: string;
  /**
   * Examiner question in Luxembourgish, rendered above the prompt. Present only
   * for Q&A sentences, which are always assembled en→lu (see
   * `resolveSentenceDirection`).
   */
  question?: string;
};

/** Assemble a sentence from token tiles. One Step per submit. */
export type SentenceBuilderBatch = {
  type: "sentence-builder";
  item: SentenceBuilderItem;
};

export type Exercise = WordMatchBatch | SentenceBuilderBatch;
/** @deprecated Use Exercise */
export type ExerciseBatch = Exercise;
