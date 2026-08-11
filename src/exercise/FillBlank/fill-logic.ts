import { normalizeAnswer } from "../SentenceBuilder/sentence-logic";

import type { FillBlankItem } from "../types";
import type { WordResultMap } from "../WordMatch/types";
import type { FillGameState } from "./types";

/**
 * Pure logic for the fill-in-words mechanic. Structural sibling of
 * `SentenceBuilder/sentence-logic.ts`: same immutable-record shape, same one-way
 * `checkResult` lock, same `toWordResultMap` exit.
 *
 * The mechanic differs in exactly one way that matters here: tiles go into
 * *positions* rather than onto the end of a list, so state carries a fixed-length
 * `placed` array instead of an append-only `assembled` one.
 */

export const initFillGame = (item: FillBlankItem): FillGameState => ({
  placed: item.blanks.map(() => null),
  selectedBlank: null,
  checkResult: null,
  result: { shown: 1, correct: 0, incorrect: 0 },
});

const isLocked = (state: FillGameState): boolean => state.checkResult !== null;

/** The blank a tapped tile should fill: the selected one, else the first empty. */
export const targetBlank = (state: FillGameState): number | null => {
  if (state.selectedBlank !== null) return state.selectedBlank;
  const firstEmpty = state.placed.findIndex((p) => p === null);
  return firstEmpty === -1 ? null : firstEmpty;
};

/** Taps a blank to aim the next tile at it; re-tapping the same blank deselects. */
export const applyBlankTap = (state: FillGameState, blankIdx: number): FillGameState =>
  isLocked(state)
    ? state
    : { ...state, selectedBlank: state.selectedBlank === blankIdx ? null : blankIdx };

/**
 * Places a tile into the target blank. A tile already sitting in another blank
 * moves (it is not duplicated), and any tile displaced from the target blank
 * returns to the pool. Selection clears so the next tap flows to the next empty
 * blank — which makes left-to-right filling work with no blank taps at all.
 */
export const applyTokenTap = (state: FillGameState, tokenIdx: number): FillGameState => {
  const blankIdx = targetBlank(state);
  if (isLocked(state) || blankIdx === null) return state;

  return {
    ...state,
    placed: state.placed.map((placed, i) =>
      i === blankIdx ? tokenIdx : placed === tokenIdx ? null : placed,
    ),
    selectedBlank: null,
  };
};

/** Clears one blank, returning its tile to the pool. */
export const applyBlankClear = (state: FillGameState, blankIdx: number): FillGameState =>
  isLocked(state)
    ? state
    : {
        ...state,
        placed: state.placed.map((placed, i) => (i === blankIdx ? null : placed)),
        selectedBlank: null,
      };

/** Every blank filled — the precondition for submitting. */
export const isComplete = (state: FillGameState): boolean =>
  state.placed.every((p) => p !== null);

/**
 * All-or-nothing grading in one submit: every blank must hold the tile whose text
 * matches that blank's answer under `normalizeAnswer` (the same comparison the
 * sentence builder uses, so punctuation and casing don't decide correctness).
 *
 * Comparing *text* rather than tile index matters: two tiles may carry the same
 * text, and placing either one must count as correct.
 */
export const applySubmit = (state: FillGameState, item: FillBlankItem): FillGameState => {
  if (isLocked(state)) return state;

  const isCorrect =
    isComplete(state) &&
    state.placed.every((tokenIdx, i) =>
      tokenIdx !== null && normalizeAnswer(item.tokens[tokenIdx]) === normalizeAnswer(item.blanks[i]),
    );

  return {
    ...state,
    // Keep `placed` so the tiles stay visible during feedback.
    checkResult: isCorrect ? "correct" : "incorrect",
    result: isCorrect
      ? { ...state.result, correct: 1 }
      : { ...state.result, incorrect: state.result.incorrect + 1 },
  };
};

/** One graded decision per item, so exactly one stat entry — one tick per Slot. */
export const toWordResultMap = (item: FillBlankItem, state: FillGameState): WordResultMap => ({
  [item.fillKey]: state.result,
});

/**
 * The complete correct sentence, for the "here's the answer" feedback popup.
 * Interleaves frame and blanks — total because `frame.length === blanks.length + 1`.
 */
export const correctSentence = (item: FillBlankItem): string =>
  item.frame.reduce(
    (acc, segment, i) => acc + segment + (i < item.blanks.length ? item.blanks[i] : ""),
    "",
  );
