import { useEffect } from "react";

import { Button } from "../../ui/Button";
import { Pill } from "../../ui/Pill";
import { toWordResultMap } from "./sentence-logic";
import { useSentenceGame } from "./use-sentence-game";

import type { PillStatus } from "../../ui/Pill";
import type { SentenceBuilderItem } from "../types";
import type { WordResultMap } from "../WordMatch/types";

type Props = {
  item: SentenceBuilderItem;
  onResult: (results: WordResultMap) => void;
  onInteraction?: () => void;
};

export const SentenceBuilder = ({ item, onResult, onInteraction }: Props) => {
  const { state, tapToken, tapAssembled, submit } = useSentenceGame(item);

  const handleTapToken = (idx: number) => {
    onInteraction?.();
    tapToken(idx);
  };
  const handleTapAssembled = (pos: number) => {
    onInteraction?.();
    tapAssembled(pos);
  };
  const handleSubmit = () => {
    onInteraction?.();
    submit();
  };

  // Call onResult as soon as the answer is checked — always advance to next slot
  useEffect(() => {
    if (state.checkResult !== null) {
      onResult(toWordResultMap(item, state));
    }
  }, [state.checkResult]); // eslint-disable-line react-hooks/exhaustive-deps

  const assembledStatus: PillStatus =
    state.checkResult === "correct" ? "success"
    : state.checkResult === "incorrect" ? "fail"
    : "selected";

  const canTapAssembled = state.checkResult === null;
  const usedSet = new Set(state.assembled);

  return (
    // Spacing is tight because a picture-description Session renders a full-bleed
    // 16:9 photo above this and everything still has to fit without scrolling.
    <div className="flex flex-col gap-3 px-2">
      {item.question !== undefined && (
        <p className="text-center text-xl font-bold text-gray-900 px-2">
          {item.question}
        </p>
      )}
      <p
        className={
          item.question !== undefined
            ? "text-center text-sm italic text-gray-500 px-2"
            : "text-center text-lg font-semibold text-gray-800 px-2"
        }
      >
        {item.promptText}
      </p>

      {/* Assembled row — chips stay visible after check for feedback. The min-h
          reserve keeps the token pool from jumping as chips move between the two
          rows; it fits two rows of pills, and shorter answers just leave slack. */}
      <div className="min-h-24 flex flex-wrap content-start gap-2 justify-center border-b-2 border-gray-200 pb-3">
        {state.assembled.length === 0 ? (
          <span className="text-gray-400 text-sm w-full text-center mt-2 italic">
            Tap words below to build your answer
          </span>
        ) : (
          state.assembled.map((tokenIdx, assembledPos) => (
            <Pill
              key={assembledPos}
              size="sm"
              status={assembledStatus}
              onClick={canTapAssembled ? () => handleTapAssembled(assembledPos) : undefined}
            >
              {item.tokens[tokenIdx]}
            </Pill>
          ))
        )}
      </div>

      {/* Token pool — used tokens show as gray placeholders to keep layout stable */}
      <div className="min-h-24 flex flex-wrap gap-2 justify-center content-start">
        {item.tokens.map((token, idx) =>
          usedSet.has(idx) ? (
            <div
              key={idx}
              className="h-10 px-4 rounded-lg border-2 border-gray-200 bg-gray-100 flex items-center"
            >
              <span className="text-sm text-transparent select-none" aria-hidden="true">{token}</span>
            </div>
          ) : (
            <Pill
              key={idx}
              size="sm"
              status="blanc"
              onClick={() => handleTapToken(idx)}
            >
              {token}
            </Pill>
          )
        )}
      </div>

      <div className="w-full max-w-xs mx-auto mt-1">
        <Button
          onClick={handleSubmit}
          disabled={state.assembled.length === 0 || state.checkResult !== null}
        >
          Check
        </Button>
      </div>
    </div>
  );
};
