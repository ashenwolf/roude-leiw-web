import type { WordPair } from "./WordMatch/types";

// Exercise type registry — extend as new exercise types are added
export const EXERCISE_TYPE = {
  WordMatch: "word-match",
  SentenceBuilder: "sentence-builder",
} as const;

export type ExerciseType = typeof EXERCISE_TYPE[keyof typeof EXERCISE_TYPE];

// Opaque exercise batch — each type carries its own data shape
export type WordMatchBatch = {
  type: "word-match";
  pairs: WordPair[];
};

export type SentenceBuilderItem = {
  promptText: string;
  acceptedAnswers: string[];
  tokens: string[];
  direction: "en-lu" | "lu-en";
  phraseKey: string;
};

export type SentenceBuilderBatch = {
  type: "sentence-builder";
  item: SentenceBuilderItem;
};

export type Exercise = WordMatchBatch | SentenceBuilderBatch;
/** @deprecated Use Exercise */
export type ExerciseBatch = Exercise;
