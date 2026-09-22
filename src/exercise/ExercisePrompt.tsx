import { IconButton, IconButtonSpacer } from "../ui/IconButton";
import { SpeakerHighIcon } from "../ui/icons";
import { usePromptAudio } from "./use-prompt-audio";

type PromptLineProps = {
  text: string;
  emphasis: "headline" | "sub" | "plain";
  /** Reserve room for the audio button (audio was expected for this line). */
  hasAudioSlot?: boolean;
  /** Absent while the file is still unproven or known missing — no button drawn. */
  onPlay?: () => void;
};

/**
 * Both sides reserve the button's width so the text stays centred. Driven by
 * `hasAudioSlot`, not by whether the button renders: a load failure arriving after
 * mount then removes the icon without reflowing the line.
 */
export const PromptLine = ({ text, emphasis, hasAudioSlot = false, onPlay }: PromptLineProps) => {
  const textClass = {
    headline: "text-center text-xl font-bold text-gray-900",
    sub: "text-center text-sm italic text-gray-500",
    plain: "text-center text-lg font-semibold text-gray-800",
  }[emphasis];

  if (!hasAudioSlot) return <p className={`${textClass} px-2`}>{text}</p>;

  return (
    <div className="flex items-center justify-center gap-2 px-2">
      <IconButtonSpacer />
      <p className={textClass}>{text}</p>
      {onPlay === undefined ? (
        <IconButtonSpacer />
      ) : (
        <IconButton icon={SpeakerHighIcon} label="Play prompt audio" onClick={onPlay} />
      )}
    </div>
  );
};

type ExercisePromptProps = {
  /** Examiner question, when the element carries one. Rendered as the headline. */
  question?: string;
  /** The sentence to work from, in the source language. */
  promptText: string;
  /** Prompt audio as resolved by the builder — the question, or the LU phrase. */
  audioUrl?: string;
  /**
   * `plain` when the prompt IS the task (assemble this sentence); `sub` when the
   * work is elsewhere on screen, as a fill's gapped frame is. Ignored under a
   * question, which is always the headline.
   */
  promptEmphasis?: "plain" | "sub";
};

/**
 * The audio button rides the line the audio voices — the question for Q&A, the
 * prompt otherwise. Only one line carries it: one mp3 per item.
 */
export const ExercisePrompt = ({
  question,
  promptText,
  audioUrl,
  promptEmphasis = "plain",
}: ExercisePromptProps) => {
  const { play, isAvailable } = usePromptAudio(audioUrl);
  const hasQuestion = question !== undefined;

  return (
    <>
      {hasQuestion && (
        <PromptLine
          text={question}
          emphasis="headline"
          hasAudioSlot={audioUrl !== undefined}
          onPlay={isAvailable ? play : undefined}
        />
      )}
      <PromptLine
        text={promptText}
        emphasis={hasQuestion ? "sub" : promptEmphasis}
        hasAudioSlot={!hasQuestion && audioUrl !== undefined}
        onPlay={!hasQuestion && isAvailable ? play : undefined}
      />
    </>
  );
};
