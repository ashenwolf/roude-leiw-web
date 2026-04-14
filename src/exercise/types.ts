import type { WordPair } from "./WordMatch/types";

// Exercise type registry — extend as new exercise types are added
export const EXERCISE_TYPE = {
  WordMatch: "word-match",
} as const;

export type ExerciseType = typeof EXERCISE_TYPE[keyof typeof EXERCISE_TYPE];

// Opaque exercise batch — each type carries its own data shape
export type WordMatchBatch = {
  type: "word-match";
  pairs: WordPair[];
};

export type ExerciseBatch = WordMatchBatch; // | FillBlankBatch | ...
