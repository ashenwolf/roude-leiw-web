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

  // Only filled blanks are pills, and a filled blank is never the aim point
  // (tapping one clears it), so there is no "selected" case here.
  const filledStatus: PillStatus =
    state.checkResult === null ? "blanc" : state.checkResult === "correct" ? "success" : "fail";

  // An empty blank is a gap in a sentence, not a tile: it reads as an underline,
  // the same quiet affordance the sentence builder's empty assembled row uses.
  // Type size is inherited from the sentence container (as it is for `size="inline"`
  // pills), and the px-2 + 2px border match the filled pill, so a blank sits in the
  // reading flow at one size and dropping a tile in changes no geometry.
  const emptyBlankClass = (blankIdx: number): string =>
    [
      "align-middle leading-tight px-2 border-2 border-transparent cursor-pointer transition",
      blankIdx === aimed ? "border-b-sky-400" : "border-b-gray-300",
    ].join(" ");

  return (
    <div className="flex flex-col gap-6 p-2">
      <p className="text-center text-sm italic text-gray-500 px-2">{item.promptText}</p>

      {/* The gapped sentence. This is a *paragraph*, not a flex row: normal inline
          flow left-aligned, so a sentence that wraps reads as continuous prose with
          one line-height between lines rather than as centered rows of chips.
          `leading-8` gives the inline pills and underlines room without opening the
          lines up. The one `text-sm` is the size for everything in here — fixed
          segments, empty blanks, and filled `size="inline"` pills all inherit it, and
          it matches the tile pool's `size="sm"` so a tile keeps its size when it
          lands in a blank. */}
      <div className="min-h-36 text-sm leading-8 text-gray-800 border-b-2 border-gray-200 pb-8 px-2">
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
                <button className={emptyBlankClass(i)} onClick={() => handleTapBlank(i)}>
                  {/* Sized to the answer so the layout doesn't jump when filled,
                      while keeping the answer itself invisible. */}
                  <span className="text-transparent select-none" aria-hidden="true">
                    {item.blanks[i]}
                  </span>
                </button>
              ))}
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
