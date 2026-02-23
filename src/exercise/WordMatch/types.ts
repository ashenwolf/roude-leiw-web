export const DISPLAY_SLOTS = 5;

export type WordPair = [string, string];

export type ColumnSide = "left" | "right";

// Unified slot state - each slot is self-contained
export type SlotState =
  | { type: "active"; pairIndex: number }
  | { type: "selected"; pairIndex: number }
  | { type: "fail"; pairIndex: number }
  | { type: "fading"; pairIndex: number; nextPairIndex: number | null }
  | { type: "empty" };

// Per-word tracking: keyed by "{lu}|{en}"
export type WordResultEntry = {
  shown: number;
  correct: number;
  incorrect: number;
};

export type WordResultMap = Record<string, WordResultEntry>;

// Game state combining both columns and the pair pool
export type GameState = {
  leftSlots: SlotState[];
  rightSlots: SlotState[];
  pairPool: number[];
  matchedCount: number;
  wordResults: WordResultMap;
};
