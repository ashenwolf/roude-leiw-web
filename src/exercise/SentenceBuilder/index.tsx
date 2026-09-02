import { useEffect, useRef, useState } from "react";

import { ExerciseAnswerArea, ExerciseTilePool } from "../ExerciseLayout";
import { Button } from "../../ui/Button";
import { PinnedBottomBar } from "../../ui/PinnedBottomBar";
import { Pill } from "../../ui/Pill";
import { SpeakerHighIcon } from "../../ui/icons";
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

/**
 * Owns the prompt's <audio> element and reports whether the file is actually
 * playable, so a missing mp3 renders no speaker button at all rather than a
 * control that does nothing.
 *
 * Plays once on arrival and stops on unmount, so audio never bleeds into the
 * next Slot.
 *
 * The two failure modes must not be conflated:
 * - **`error` on the element** — the file is missing or undecodable (audio for
 *   this phrase was never generated, or the R2 sync skipped it). Unavailable:
 *   hide the button.
 * - **`play()` rejecting** — usually the browser's autoplay policy vetoing the
 *   first playback before any user gesture. The file is fine, and the button is
 *   exactly the recovery, so this must NOT hide it.
 *
 * Availability is therefore optimistic: it is derived by comparing the current
 * url against the one that last errored, so only a real `error` event withdraws
 * the button, and a new slot's url is trusted again without an effect having to
 * reset state. Waiting for `canplay` instead would flicker the button in on
 * every slot once the network resolves.
 */
const usePromptAudio = (url: string | undefined) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (url === undefined) return;
    const audio = new Audio(url);
    audioRef.current = audio;
    const handleError = () => setFailedUrl(url);
    audio.addEventListener("error", handleError);
    audio.play().catch(() => {});
    return () => {
      audio.removeEventListener("error", handleError);
      audio.pause();
      audioRef.current = null;
    };
  }, [url]);

  const play = () => {
    const audio = audioRef.current;
    if (audio === null) return;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  };

  return { play, isAvailable: url !== undefined && failedUrl !== url };
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

type PromptLineProps = {
  text: string;
  emphasis: "headline" | "sub" | "plain";
  /** Reserve room for the audio button (audio was expected for this line). */
  hasAudioSlot?: boolean;
  /** Absent while the file is still unproven or known missing — no button drawn. */
  onPlay?: () => void;
};

/**
 * One prompt line, optionally with the audio replay button.
 *
 * Both sides of the flex row reserve the button's width — the visible control on
 * the right, an invisible mirror on the left — so the text stays truly centered.
 * The reservation is driven by `hasAudioSlot`, not by whether the button renders,
 * so a load failure arriving after mount removes the icon without reflowing the
 * line under the learner's eyes.
 */
const PromptLine = ({ text, emphasis, hasAudioSlot = false, onPlay }: PromptLineProps) => {
  const textClass = {
    headline: "text-center text-xl font-bold text-gray-900",
    sub: "text-center text-sm italic text-gray-500",
    plain: "text-center text-lg font-semibold text-gray-800",
  }[emphasis];

  if (!hasAudioSlot) return <p className={`${textClass} px-2`}>{text}</p>;

  return (
    <div className="flex items-center justify-center gap-2 px-2">
      <div aria-hidden="true" className="shrink-0 w-9 h-9" />
      <p className={textClass}>{text}</p>
      {onPlay === undefined ? (
        <div aria-hidden="true" className="shrink-0 w-9 h-9" />
      ) : (
        <button
          type="button"
          onClick={onPlay}
          aria-label="Play prompt audio"
          className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sky-600 hover:bg-sky-50 active:bg-sky-100"
        >
          <SpeakerHighIcon className="w-6 h-6" />
        </button>
      )}
    </div>
  );
};

export const SentenceBuilder = ({ item, onResult, onInteraction }: Props) => {
  const { state, tapToken, tapAssembled, submit } = useSentenceGame(item);
  const { play: playPrompt, isAvailable: hasAudio } = usePromptAudio(item.audioUrl);

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
        {/* The audio button rides the line the audio voices: the question for
            Q&A, the Luxembourgish prompt for lu→en. It disappears entirely when
            the file failed to load — the exercise is fully usable without it. */}
        {item.question !== undefined && (
          <PromptLine
            text={item.question}
            emphasis="headline"
            hasAudioSlot={item.audioUrl !== undefined}
            onPlay={hasAudio ? playPrompt : undefined}
          />
        )}
        <PromptLine
          text={item.promptText}
          emphasis={item.question !== undefined ? "sub" : "plain"}
          hasAudioSlot={item.question === undefined && item.audioUrl !== undefined}
          onPlay={item.question === undefined && hasAudio ? playPrompt : undefined}
        />

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
