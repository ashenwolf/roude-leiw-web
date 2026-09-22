import { IconButton, IconButtonSpacer } from "../ui/IconButton";
import { SpeakerHighIcon } from "../ui/icons";
import { usePromptAudio } from "./use-prompt-audio";

/**
 * The prompt header shared by SentenceBuilder and FillBlank: the examiner
 * question, the sentence to work from, and the audio replay button.
 *
 * Extracted because a Q&A `@fill` needs exactly the same header a Q&A
 * `@sentence` has — the question read aloud above the prompt. Two copies would
 * drift in the one place a divergence is invisible in review: the audio
 * availability rules in `usePromptAudio`.
 */

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
 * the right, an `IconButtonSpacer` on the left — so the text stays truly centered.
 * The reservation is driven by `hasAudioSlot`, not by whether the button renders,
 * so a load failure arriving after mount removes the icon without reflowing the
 * line under the learner's eyes.
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
};

/**
 * The full two-line prompt header.
 *
 * The audio button rides the line the audio actually voices: the question for
 * Q&A, the prompt itself otherwise. Only one line ever carries it, because only
 * one mp3 is stamped per item.
 */
export const ExercisePrompt = ({ question, promptText, audioUrl }: ExercisePromptProps) => {
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
        emphasis={hasQuestion ? "sub" : "plain"}
        hasAudioSlot={!hasQuestion && audioUrl !== undefined}
        onPlay={!hasQuestion && isAvailable ? play : undefined}
      />
    </>
  );
};
