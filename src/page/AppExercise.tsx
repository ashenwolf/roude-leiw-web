import { useEffect, useRef } from "react";
import { usePostHog } from "@posthog/react";

import { useNavigation } from "../context/useNavigation";
import { SentenceBuilder } from "../exercise/SentenceBuilder";
import { WordMatch } from "../exercise/WordMatch";
import { computeUnlockedLessonIds } from "../exercise/progression";
import { SESSION_XP } from "../exercise/xp";
import { useActivityTimer } from "../exercise/use-activity-timer";
import { useExerciseSession } from "../exercise/use-exercise-session";
import { mergeWordStats } from "../lib/stats-merge";
import { useProgress } from "../persistence/hooks/use-progress";
import { refreshGuestProgress } from "../persistence/hooks/use-guest-progress";
import { Button } from "../ui/Button";
import { ProgressBar } from "../ui/ProgressBar";
import { MilestonePopup, SectionMilestonePopup, CelebrationPopup } from "../ui/Popup";
import { DebugPanel } from "../ui/DebugPanel";

import type { SessionMode } from "../exercise/mode-config";
import type { ProgressView } from "../exercise/session-progress";
import type { Exercise } from "../exercise/types";
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
      {mode.kind === "word-mix" ? "Word Mix" : mode.kind === "fix-errors" ? "Fix Your Mistakes" : "Word Match Exercise"}
    </h2>
    <p className="text-gray-600 text-center">
      {mode.kind === "word-mix"
        ? "Test yourself across all words you've seen."
        : mode.kind === "fix-errors"
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
  currentBatch: Exercise | undefined;
  onSlotComplete: (wordResults: WordResultMap) => void;
  onSlotProgress: (done: number, total: number) => void;
  onInteraction: () => void;
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
  onInteraction,
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
        onInteraction={onInteraction}
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
      correctAnswer={
        lastSlotOutcome === "mistake" && currentBatch?.type === "sentence-builder"
          ? currentBatch.item.acceptedAnswers[0]
          : undefined
      }
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
  const { words, unlockedLessons, syncBatch } = useProgress();
  const timer = useActivityTimer();
  const posthog = usePostHog();

  const mode: SessionMode =
    currentPage === "word-mix" ? { kind: "word-mix" }
    : currentPage === "fix-errors" ? { kind: "fix-errors" }
    : { kind: "lesson", lessonId: params.lessonId };

  // session is defined first so handlers below can reference it without TDZ risk
  const session = useExerciseSession({ userWords: words, mode });

  // Accumulate word results and duration across all slots. Flushed once on
  // session complete or abandon so local state and the remote POST update together.
  const pendingResults = useRef<WordResultMap>({});
  const pendingDuration = useRef<number>(0);

  // Anchor the activity timer when a new slot becomes visible so the user's
  // think-time before the first interaction is measured against this moment.
  useEffect(() => {
    if (session.state === "active") timer.start();
  }, [session.state, session.currentSlotIndex, timer]);

  const goHome = () => {
    refreshGuestProgress();
    navigateTo("home");
  };

  // Merge accumulated results into local + remote state, then clear the buffer.
  const flushProgress = (extraUnlockCheck: boolean, xpEarned = 0) => {
    const wordResults = pendingResults.current;
    const durationSeconds = pendingDuration.current;
    pendingResults.current = {};
    pendingDuration.current = 0;

    const newlyUnlockedLessons = extraUnlockCheck
      ? computeUnlockedLessonIds(
          session.lessons,
          mergeWordStats(words, wordResults),
          unlockedLessons,
        ).filter((id) => !new Set(unlockedLessons).has(id))
      : [];

    syncBatch(wordResults, durationSeconds, newlyUnlockedLessons, xpEarned);
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
    pendingResults.current = mergeWordStats(pendingResults.current, wordResults);
    pendingDuration.current += durationSeconds;
    session.handleSlotComplete(wordResults); // determines outcome + re-queues if end of plan
  };

  const handleSlotProgress = (done: number, total: number) => {
    timer.registerInteraction();
    session.handleSlotProgress(done, total);
  };

  const handleTryAgain = () => {
    posthog?.capture("session_restarted", { lesson_id: params.lessonId });
    flushProgress(mode.kind === "lesson");
    timer.reset();
    session.resetSession();
  };

  const handleAbandon = () => {
    posthog?.capture("exercise_abandoned", {
      lesson_id: params.lessonId,
      slot_index: session.currentSlotIndex,
      total_slots: session.totalSlots,
    });
    flushProgress(mode.kind === "lesson");
    goHome();
  };

  const handleSessionComplete = () => {
    posthog?.capture("session_completed", { lesson_id: params.lessonId });
    flushProgress(mode.kind === "lesson", SESSION_XP[mode.kind]);
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
        onInteraction={timer.registerInteraction}
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
