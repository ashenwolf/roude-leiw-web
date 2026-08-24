import { useEffect } from "react";

import { ExerciseAnswerArea, ExerciseTilePool } from "../ExerciseLayout";
import { Button } from "../../ui/Button";
import { PinnedBottomBar } from "../../ui/PinnedBottomBar";
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

type AssembledRowProps = {
  tokens: string[];
  assembled: number[];
  status: PillStatus;
  onTap?: (assembledPos: number) => void;
};

/**
 * The answer under construction, stacked in one grid cell on top of an invisible
 * copy of the whole token set. That copy fixes the row at the tallest the answer
 * can ever be — a subset of the same tiles can never wrap to more lines — so
 * placing a tile changes no geometry and nothing on screen shifts under the
 * learner's finger. Chips stay visible after Check, as the feedback.
 */
const AssembledRow = ({ tokens, assembled, status, onTap }: AssembledRowProps) => (
  <div className="grid border-b-2 border-gray-200 pb-3 px-2">
    <div
      aria-hidden="true"
      className="invisible col-start-1 row-start-1 flex flex-wrap gap-2 justify-center"
    >
      {tokens.map((token, idx) => (
        <Pill key={idx} size="sm" status="blanc">
          {token}
        </Pill>
      ))}
    </div>

    <div className="col-start-1 row-start-1 flex flex-wrap content-start gap-2 justify-center">
      {assembled.length === 0 ? (
        <span className="text-gray-400 text-sm w-full text-center mt-2 italic">
          Tap words below to build your answer
        </span>
      ) : (
        assembled.map((tokenIdx, assembledPos) => (
          <Pill
            key={assembledPos}
            size="sm"
            status={status}
            onClick={onTap ? () => onTap(assembledPos) : undefined}
          >
            {tokens[tokenIdx]}
          </Pill>
        ))
      )}
    </div>
  </div>
);

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
    <div className="flex flex-col flex-1">
      <ExerciseAnswerArea className="gap-3">
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

        <AssembledRow
          tokens={item.tokens}
          assembled={state.assembled}
          status={assembledStatus}
          onTap={canTapAssembled ? handleTapAssembled : undefined}
        />
      </ExerciseAnswerArea>

      <ExerciseTilePool className="gap-2">
        {item.tokens.map((token, idx) =>
          usedSet.has(idx) ? (
            <div
              key={idx}
              className="h-10 px-4 rounded-lg border-2 border-gray-200 bg-gray-100 flex items-center"
            >
              <span className="text-sm text-transparent select-none" aria-hidden="true">{token}</span>
            </div>
          ) : (
            <Pill key={idx} size="sm" status="blanc" onClick={() => handleTapToken(idx)}>
              {token}
            </Pill>
          )
        )}
      </ExerciseTilePool>

      <PinnedBottomBar>
        <div className="w-full max-w-xs mx-auto">
          <Button
            onClick={handleSubmit}
            disabled={state.assembled.length === 0 || state.checkResult !== null}
          >
            Check
          </Button>
        </div>
      </PinnedBottomBar>
    </div>
  );
};
