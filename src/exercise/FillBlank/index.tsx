import { useEffect } from "react";

import { ExerciseAnswerArea, ExerciseTilePool } from "../ExerciseLayout";
import { ExercisePrompt } from "../ExercisePrompt";
import { Button } from "../../ui/Button";
import { PinnedBottomBar } from "../../ui/PinnedBottomBar";
import { Pill } from "../../ui/Pill";
import { PillGap, PillTile } from "../../ui/PillGap";
import { isComplete, isTileSpent, targetBlank, toWordResultMap } from "./fill-logic";
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

  // Only filled blanks are pills, and a filled blank is never the aim point
  // (tapping one clears it), so there is no "selected" case here.
  const filledStatus: PillStatus =
    state.checkResult === null ? "blanc" : state.checkResult === "correct" ? "success" : "fail";

  return (
    <div className="flex flex-col flex-1">
      <ExerciseAnswerArea className="gap-4">
        <ExercisePrompt
          question={item.question}
          promptText={item.promptText}
          audioUrl={item.audioUrl}
          promptEmphasis="sub"
        />

        {/* The gapped sentence. This is a *paragraph*, not a flex row: normal inline
            flow left-aligned, so a sentence that wraps reads as continuous prose with
            one line-height between lines rather than as centered rows of chips.
            `leading-8` gives the inline pills and underlines room without opening the
            lines up. The one `text-sm` is the size for everything in here — fixed
            segments, empty blanks, and filled `size="inline"` pills all inherit it, and
            it matches the tile pool's `size="sm"` so a tile keeps its size when it
            lands in a blank. */}
        <div className="text-sm leading-8 text-gray-800 border-b-2 border-gray-200 pb-4 px-2">
          {item.frame.map((segment, i) => (
            <span key={i}>
              {segment.length > 0 && <span className="whitespace-pre-wrap">{segment}</span>}
              {i < item.blanks.length &&
                (state.placed[i] !== null ? (
                  <Pill
                    size="inline"
                    status={filledStatus}
                    className="align-middle"
                    onClick={() => handleTapBlank(i)}
                  >
                    {item.tokens[state.placed[i] as number]}
                  </Pill>
                ) : (
                  <PillGap aimed={i === aimed} onClick={() => handleTapBlank(i)}>
                    {item.blanks[i]}
                  </PillGap>
                ))}
            </span>
          ))}
        </div>
      </ExerciseAnswerArea>

      <ExerciseTilePool className="gap-2.5">
        {item.tokens.map((token, idx) => (
          // Spent, not merely placed: a tile two blanks need stays tappable until
          // both are filled.
          <PillTile
            key={idx}
            spent={isTileSpent(item, state, idx)}
            onClick={() => handleTapToken(idx)}
          >
            {token}
          </PillTile>
        ))}
      </ExerciseTilePool>

      <PinnedBottomBar>
        <div className="w-full max-w-xs mx-auto">
          <Button
            onClick={handleSubmit}
            disabled={!isComplete(state) || state.checkResult !== null}
          >
            Check
          </Button>
        </div>
      </PinnedBottomBar>
    </div>
  );
};
