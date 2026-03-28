import type { WordResultMap } from "./WordMatch/types";

export type WordPair = [string, string];

export type ExerciseProps = {
  pairs: WordPair[];
  onComplete: (results: WordResultMap) => void;
  onProgress: (matchedCount: number, totalPairs: number) => void;
};

export type ExerciseType = "word-match";
