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
};

export const SentenceBuilder = ({ item, onResult }: Props) => {
  const { state, tapToken, tapAssembled, submit } = useSentenceGame(item);

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
    <div className="flex flex-col gap-6 p-2">
      <p className="text-center text-lg font-semibold text-gray-800 px-2">
        {item.promptText}
      </p>

      {/* Assembled row — chips stay visible after check for feedback */}
      <div className="min-h-36 flex flex-wrap content-start gap-2.5 justify-center border-b-2 border-gray-200 pb-8">
        {state.assembled.length === 0 ? (
          <span className="text-gray-400 text-sm w-full text-center mt-3 italic">
            Tap words below to build your answer
          </span>
        ) : (
          state.assembled.map((tokenIdx, assembledPos) => (
            <Pill
              key={assembledPos}
              size="sm"
              status={assembledStatus}
              onClick={canTapAssembled ? () => tapAssembled(assembledPos) : undefined}
            >
              {item.tokens[tokenIdx]}
            </Pill>
          ))
        )}
      </div>

      {/* Token pool — used tokens show as gray placeholders to keep layout stable */}
      <div className="min-h-36 flex flex-wrap gap-2.5 justify-center content-start">
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
              onClick={() => tapToken(idx)}
            >
              {token}
            </Pill>
          )
        )}
      </div>

      <div className="w-full max-w-xs mx-auto">
        <Button
          onClick={submit}
          disabled={state.assembled.length === 0 || state.checkResult !== null}
        >
          Check
        </Button>
      </div>
    </div>
  );
};
