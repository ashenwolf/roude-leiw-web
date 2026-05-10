import type { SentenceBuilderItem } from "../types";
import type { WordResultMap } from "../WordMatch/types";
import type { SentenceGameState } from "./types";

export const normalizeAnswer = (s: string): string =>
  s
    .replace(/[.,!?;:'"''"]+/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

export const joinAssembled = (tokens: string[]): string =>
  tokens.reduce((acc, token, i) => {
    if (i === 0) return token;
    const glue = token.startsWith("'") || token.startsWith("'") || acc.endsWith("'") || acc.endsWith("'")
      ? ""
      : " ";
    return acc + glue + token;
  }, "");

export const initSentenceGame = (): SentenceGameState => ({
  assembled: [],
  checkResult: null,
  result: { shown: 1, correct: 0, incorrect: 0 },
});

export const applyTokenTap = (state: SentenceGameState, tokenIdx: number): SentenceGameState => ({
  ...state,
  assembled: [...state.assembled, tokenIdx],
});

export const applyAssembledTap = (state: SentenceGameState, assembledPos: number): SentenceGameState => ({
  ...state,
  assembled: state.assembled.filter((_, i) => i !== assembledPos),
});

export const applySubmit = (state: SentenceGameState, item: SentenceBuilderItem): SentenceGameState => {
  const tokens = state.assembled.map((i) => item.tokens[i]);
  const attempt = normalizeAnswer(joinAssembled(tokens));
  const isCorrect = item.acceptedAnswers.some((a) => normalizeAnswer(a) === attempt);
  return {
    ...state,
    checkResult: isCorrect ? "correct" : "incorrect",
    // Keep assembled so chips stay visible during feedback popup
    result: isCorrect
      ? { ...state.result, correct: 1 }
      : { ...state.result, incorrect: state.result.incorrect + 1 },
  };
};

export const toWordResultMap = (item: SentenceBuilderItem, state: SentenceGameState): WordResultMap => ({
  [item.phraseKey]: state.result,
});
