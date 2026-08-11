import type { WordResultEntry } from "../WordMatch/types";

/**
 * Not a state machine — an immutable accumulation record with a one-way lock,
 * the same shape as `SentenceGameState` (deliberately: `fill-logic.ts` is a
 * structural sibling of `sentence-logic.ts`). Once `checkResult` is set, every
 * `apply*` becomes a no-op. If branching mid-item behaviour is ever needed,
 * promote this to a discriminated union rather than adding ad-hoc flags.
 */
export type FillGameState = {
  /**
   * One entry per blank, in blank order: the index into `item.tokens` placed
   * there, or `null` while the blank is empty. Length is fixed at init to
   * `item.blanks.length`, so the UI can render slots without bounds checks.
   */
  placed: (number | null)[];
  /** Blank the next tapped tile goes into; `null` = use the first empty blank. */
  selectedBlank: number | null;
  /** `null` = still filling. One-way lock once set. */
  checkResult: "correct" | "incorrect" | null;
  result: WordResultEntry;
};
