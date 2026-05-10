import type { WordResultEntry } from "../WordMatch/types";

export type SentenceGameState = {
  assembled: number[];                            // ordered indices into item.tokens
  checkResult: "correct" | "incorrect" | null;   // null = still assembling
  result: WordResultEntry;
};
