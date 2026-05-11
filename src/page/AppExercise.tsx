import { usePostHog } from "@posthog/react";

import { useNavigation } from "../context/useNavigation";
import { SentenceBuilder } from "../exercise/SentenceBuilder";
import { WordMatch } from "../exercise/WordMatch";
import { useActivityTimer } from "../exercise/use-activity-timer";
import { useExerciseSession } from "../exercise/use-exercise-session";
import { useProgress } from "../persistence/hooks/use-progress";
import { refreshGuestProgress } from "../persistence/hooks/use-guest-progress";
import { Button } from "../ui/Button";
import { ProgressBar } from "../ui/ProgressBar";
import { MilestonePopup, SectionMilestonePopup, CelebrationPopup } from "../ui/Popup";
import { DebugPanel } from "../ui/DebugPanel";

import type { SessionMode } from "../exercise/batch-planner";
import type { ProgressView } from "../exercise/session-progress";
import type { ExerciseBatch } from "../exercise/types";
import type { WordResultMap } from "../exercise/WordMatch/types";
import type { SessionStatus } from "../exercise/session-reducer";

// ── Sub-components ──────────────────────────────────────────────────────

const ExerciseLoading = () => (
  <div className="flex flex-col items-center justify-center py-16">
    <div className="animate-pulse text-gray-500 text-lg">Loading lessons...</div>
  </div>
);

type ExerciseErrorProps = { error: string | null; onBack: () => void };
const ExerciseError = ({ error, onBack }: ExerciseErrorProps) => (
  <div className="flex flex-col items-center gap-4 py-8">
    <h2 className="text-xl font-bold text-red-600">Failed to load lessons</h2>
    <p className="text-gray-600">{error}</p>
    <Button onClick={onBack}>Back to Home</Button>
  </div>
);

type ExerciseReadyProps = { totalSlots: number; onStart: () => void; onBack: () => void; mode: SessionMode };
const ExerciseReady = ({ totalSlots, onStart, onBack, mode }: ExerciseReadyProps) => (
  <div className="flex flex-col items-center gap-6 py-8">
    <h2 className="text-2xl font-bold text-gray-800">
      {mode.kind === "madness" ? "Word Mix" : mode.kind === "mistakes" ? "Fix Your Mistakes" : "Word Match Exercise"}
    </h2>
    <p className="text-gray-600 text-center">
      {mode.kind === "madness"
        ? "Test yourself across all words you've seen."
        : mode.kind === "mistakes"
        ? "Drill the words and phrases you got wrong."
        : `Complete ${totalSlots} exercises to finish the session.`}
    </p>
    <div className="w-full max-w-xs">
      <Button onClick={onStart}>Start</Button>
    </div>
    <button onClick={onBack} className="text-gray-500 hover:text-gray-700 transition-colors">
      Back to Home
    </button>
  </div>
);

type ExerciseActiveProps = {
  state: SessionStatus;
  currentSlotIndex: number;
  lastSlotOutcome: "success" | "mistake" | null;
  progressView: ProgressView;
  currentBatch: ExerciseBatch | undefined;
  onSlotComplete: (wordResults: WordResultMap) => void;
  onSlotProgress: (done: number, total: number) => void;
  onDismissMilestone: () => void;
  onSessionComplete: () => void;
  onTryAgain: () => void;
  onBack: () => void;
};

const ExerciseActive = ({
  state,
  currentSlotIndex,
  lastSlotOutcome,
  progressView,
  currentBatch,
  onSlotComplete,
  onSlotProgress,
  onDismissMilestone,
  onSessionComplete,
  onTryAgain,
  onBack,
}: ExerciseActiveProps) => (
  <div className="flex flex-col gap-6">
    <ProgressBar view={progressView} />

    {currentBatch?.type === "word-match" && (
      <WordMatch
        key={`slot-${currentSlotIndex}`}
        pairs={currentBatch.pairs}
        onComplete={onSlotComplete}
        onMatch={onSlotProgress}
      />
    )}

    {currentBatch?.type === "sentence-builder" && (
      <SentenceBuilder
        key={`slot-${currentSlotIndex}`}
        item={currentBatch.item}
        onResult={onSlotComplete}
      />
    )}

    <div className="mt-4">
      <button onClick={onBack} className="text-gray-500 hover:text-gray-700 transition-colors text-sm">
        ← Back to Home
      </button>
    </div>

    <MilestonePopup
      visible={state === "slot_complete"}
      onDismiss={onDismissMilestone}
      outcome={lastSlotOutcome ?? "success"}
    />

    <SectionMilestonePopup
      visible={state === "section_complete"}
      onDismiss={onDismissMilestone}
      section={Math.floor((currentSlotIndex + 1) / 5)}
    />

    <CelebrationPopup
      visible={state === "session_complete"}
      onDismiss={onSessionComplete}
      onTryAgain={onTryAgain}
    />
  </div>
);

// ── Page Component ──────────────────────────────────────────────────────

export const AppExercise = () => {
  const { navigateTo, params, currentPage } = useNavigation();
  const { words, syncBatch } = useProgress();
  const timer = useActivityTimer();
  const posthog = usePostHog();

  const mode: SessionMode =
    currentPage === "madness" ? { kind: "madness" }
    : currentPage === "mistakes" ? { kind: "mistakes" }
    : { kind: "lesson", lessonId: params.lessonId };

  // session is defined first so handlers below can reference it without TDZ risk
  const session = useExerciseSession({ userWords: words, mode });

  const goHome = () => {
    refreshGuestProgress();
    navigateTo("home");
  };

  const handleSlotSync = (wordResults: WordResultMap) => {
    const durationSeconds = timer.getElapsedSeconds();
    timer.reset();
    posthog?.capture("slot_completed", {
      slot_index: session.currentSlotIndex,
      total_slots: session.totalSlots,
      lesson_id: params.lessonId,
      duration_seconds: durationSeconds,
    });
    syncBatch(wordResults, durationSeconds);
    session.handleSlotComplete(wordResults); // determines outcome + re-queues if end of plan
  };

  const handleSlotProgress = (done: number, total: number) => {
    timer.registerInteraction();
    session.handleSlotProgress(done, total);
  };

  const handleTryAgain = () => {
    posthog?.capture("session_restarted", { lesson_id: params.lessonId });
    timer.reset();
    session.resetSession();
  };

  const handleAbandon = () => {
    posthog?.capture("exercise_abandoned", {
      lesson_id: params.lessonId,
      slot_index: session.currentSlotIndex,
      total_slots: session.totalSlots,
    });
    goHome();
  };

  const handleSessionComplete = () => {
    posthog?.capture("session_completed", { lesson_id: params.lessonId });
    goHome();
  };

  if (session.state === "loading") return <ExerciseLoading />;
  if (session.state === "error") return <ExerciseError error={session.error} onBack={goHome} />;
  if (session.state === "ready") {
    const handleStart = () => {
      posthog?.capture("exercise_started", {
        lesson_id: params.lessonId,
        mode: mode.kind,
        total_slots: session.totalSlots,
      });
      session.startSession();
    };
    return (
      <ExerciseReady
        totalSlots={session.totalSlots}
        onStart={handleStart}
        onBack={goHome}
        mode={mode}
      />
    );
  }

  return (
    <>
      <ExerciseActive
        state={session.state}
        currentSlotIndex={session.currentSlotIndex}
        lastSlotOutcome={session.lastSlotOutcome}
        progressView={session.progressView}
        currentBatch={session.currentBatch}
        onSlotComplete={handleSlotSync}
        onSlotProgress={handleSlotProgress}
        onDismissMilestone={session.dismissMilestone}
        onSessionComplete={handleSessionComplete}
        onTryAgain={handleTryAgain}
        onBack={handleAbandon}
      />
      <DebugPanel
        lessons={session.lessons}
        userWords={words}
        currentBatchPairs={session.currentBatch?.type === "word-match" ? session.currentBatch.pairs : []}
        currentLessonId={session.currentLessonId}
      />
    </>
  );
};
