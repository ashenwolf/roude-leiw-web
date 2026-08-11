import { useEffect } from "react";

import { Button } from "../../ui/Button";
import { Pill } from "../../ui/Pill";
import { isComplete, targetBlank, toWordResultMap } from "./fill-logic";
import { useFillGame } from "./use-fill-game";

import type { PillStatus } from "../../ui/Pill";
import type { FillBlankItem } from "../types";
import type { WordResultMap } from "../WordMatch/types";

type Props = {
  item: FillBlankItem;
  onResult: (results: WordResultMap) => void;
  onInteraction?: () => void;
};

/**
 * Fill-in-words: the frame is already in place, the learner drops one tile into
 * each blank. Rendered as inline flowing text so the sentence reads as a sentence
 * — `frame[0]`, blank 0, `frame[1]`, blank 1, … which is total because
 * `frame.length === blanks.length + 1`.
 */
export const FillBlank = ({ item, onResult, onInteraction }: Props) => {
  const { state, tapToken, tapBlank, clearBlank, submit } = useFillGame(item);

  const handleTapToken = (idx: number) => {
    onInteraction?.();
    tapToken(idx);
  };
  const handleTapBlank = (idx: number) => {
    onInteraction?.();
    // A filled blank clears on tap (its tile returns to the pool); an empty blank
    // becomes the aim point for the next tile.
    if (state.placed[idx] !== null) clearBlank(idx);
    else tapBlank(idx);
  };
  const handleSubmit = () => {
    onInteraction?.();
    submit();
  };

  // Report as soon as the answer is graded — the session always advances.
  useEffect(() => {
    if (state.checkResult !== null) {
      onResult(toWordResultMap(item, state));
    }
  }, [state.checkResult]); // eslint-disable-line react-hooks/exhaustive-deps

  const aimed = state.checkResult === null ? targetBlank(state) : null;
  const usedSet = new Set(state.placed.filter((p): p is number => p !== null));

  const blankStatus = (blankIdx: number): PillStatus => {
    if (state.checkResult !== null) return state.checkResult === "correct" ? "success" : "fail";
    return blankIdx === aimed ? "selected" : "blanc";
  };

  return (
    <div className="flex flex-col gap-6 p-2">
      <p className="text-center text-sm italic text-gray-500 px-2">{item.promptText}</p>

      {/* The gapped sentence — inline blanks keep the reading flow intact */}
      <div className="min-h-36 flex flex-wrap items-center justify-center gap-y-2 border-b-2 border-gray-200 pb-8 px-2">
        {item.frame.map((segment, i) => (
          <span key={i} className="contents">
            {segment.length > 0 && (
              <span className="text-lg text-gray-800 whitespace-pre-wrap">{segment}</span>
            )}
            {i < item.blanks.length && (
              <Pill size="sm" status={blankStatus(i)} onClick={() => handleTapBlank(i)}>
                {state.placed[i] !== null ? (
                  item.tokens[state.placed[i] as number]
                ) : (
                  // Sized to the answer so the layout doesn't jump when filled,
                  // while keeping the answer itself invisible.
                  <span className="text-transparent select-none" aria-hidden="true">
                    {item.blanks[i]}
                  </span>
                )}
              </Pill>
            )}
          </span>
        ))}
      </div>

      {/* Tile pool — placed tiles leave a gray placeholder to keep layout stable */}
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
            <Pill key={idx} size="sm" status="blanc" onClick={() => handleTapToken(idx)}>
              {token}
            </Pill>
          )
        )}
      </div>

      <div className="w-full max-w-xs mx-auto">
        <Button
          onClick={handleSubmit}
          disabled={!isComplete(state) || state.checkResult !== null}
        >
          Check
        </Button>
      </div>
    </div>
  );
};
