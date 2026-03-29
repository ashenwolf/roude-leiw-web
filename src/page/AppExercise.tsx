import { useNavigation } from "../context/useNavigation";
import { WordMatch } from "../exercise/WordMatch";
import { useActivityTimer } from "../exercise/use-activity-timer";
import { useExerciseSession } from "../exercise/use-exercise-session";
import { useProgress } from "../persistence/hooks/use-progress";
import { refreshGuestProgress } from "../persistence/hooks/use-guest-progress";
import { Button } from "../ui/Button";
import { ProgressBar } from "../ui/ProgressBar";
import { MilestonePopup, CelebrationPopup } from "../ui/Popup";
import { DebugPanel } from "../ui/DebugPanel";

import type { WordPair, WordResultMap } from "../exercise/WordMatch/types";
import type { SessionStatus } from "../exercise/session-reducer";

// ── Sub-components ──────────────────────────────────────────────────────

const ExerciseLoading = () => (
  <div className="flex flex-col items-center justify-center py-16">
    <div className="animate-pulse text-gray-500 text-lg">Loading lessons...</div>
  </div>
);

type ExerciseErrorProps = {
  error: string | null;
  onBack: () => void;
};

const ExerciseError = ({ error, onBack }: ExerciseErrorProps) => (
  <div className="flex flex-col items-center gap-4 py-8">
    <h2 className="text-xl font-bold text-red-600">Failed to load lessons</h2>
    <p className="text-gray-600">{error}</p>
    <Button onClick={onBack}>Back to Home</Button>
  </div>
);

type ExerciseReadyProps = {
  totalBatches: number;
  onStart: () => void;
  onBack: () => void;
};

const ExerciseReady = ({ totalBatches, onStart, onBack }: ExerciseReadyProps) => (
  <div className="flex flex-col items-center gap-6 py-8">
    <h2 className="text-2xl font-bold text-gray-800">Word Match Exercise</h2>
    <p className="text-gray-600 text-center">
      Match Luxembourgish words with their English translations.
      <br />
      Complete {totalBatches} batches to finish the exercise.
    </p>
    <div className="w-full max-w-xs">
      <Button onClick={onStart}>Start Exercise</Button>
    </div>
    <button
      onClick={onBack}
      className="text-gray-500 hover:text-gray-700 transition-colors"
    >
      Back to Home
    </button>
  </div>
);

type ExerciseActiveProps = {
  state: SessionStatus;
  currentBatch: number;
  totalBatches: number;
  currentBatchPairs: WordPair[];
  batchProgress: number;
  onBatchComplete: (wordResults: WordResultMap) => void;
  onMatchProgress: (matchedCount: number, totalPairs: number) => void;
  onDismissMilestone: () => void;
  onSessionComplete: () => void;
  onTryAgain: () => void;
  onBack: () => void;
};

const ExerciseActive = ({
  state,
  currentBatch,
  totalBatches,
  currentBatchPairs,
  batchProgress,
  onBatchComplete,
  onMatchProgress,
  onDismissMilestone,
  onSessionComplete,
  onTryAgain,
  onBack,
}: ExerciseActiveProps) => (
  <div className="flex flex-col gap-6">
    <ProgressBar
      batchProgress={batchProgress}
      currentBatch={currentBatch}
      totalBatches={totalBatches}
    />

    {currentBatchPairs.length > 0 && (
      <WordMatch
        key={`batch-${currentBatch}`}
        pairs={currentBatchPairs}
        onComplete={onBatchComplete}
        onMatch={onMatchProgress}
      />
    )}

    <div className="mt-4">
      <button
        onClick={onBack}
        className="text-gray-500 hover:text-gray-700 transition-colors text-sm"
      >
        ← Back to Home
      </button>
    </div>

    <MilestonePopup
      visible={state === "batch_complete"}
      onDismiss={onDismissMilestone}
      batchNumber={currentBatch + 1}
      totalBatches={totalBatches}
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
  const { navigateTo, params } = useNavigation();
  const { words, syncBatch } = useProgress();
  const timer = useActivityTimer();

  const handleBatchSync = (wordResults: WordResultMap) => {
    const durationSeconds = timer.getElapsedSeconds();
    timer.reset();
    syncBatch(wordResults, durationSeconds);
  };

  const handleMatchProgress = (matchedCount: number, totalPairs: number) => {
    timer.registerInteraction();
    session.handleMatchProgress(matchedCount, totalPairs);
  };

  const handleTryAgain = () => {
    timer.reset();
    session.resetSession();
  };

  const session = useExerciseSession({
    userWords: words,
    targetLessonId: params.lessonId,
    onBatchResults: handleBatchSync,
  });

  const goHome = () => {
    refreshGuestProgress();
    navigateTo("home");
  };

  if (session.state === "loading") return <ExerciseLoading />;
  if (session.state === "error") return <ExerciseError error={session.error} onBack={goHome} />;
  if (session.state === "ready") {
    return <ExerciseReady totalBatches={session.totalBatches} onStart={session.startSession} onBack={goHome} />;
  }

  return (
    <>
      <ExerciseActive
        state={session.state}
        currentBatch={session.currentBatch}
        totalBatches={session.totalBatches}
        currentBatchPairs={session.currentBatchPairs}
        batchProgress={session.batchProgress}
        onBatchComplete={session.handleBatchComplete}
        onMatchProgress={handleMatchProgress}
        onDismissMilestone={session.dismissMilestone}
        onSessionComplete={goHome}
        onTryAgain={handleTryAgain}
        onBack={goHome}
      />
      <DebugPanel
        lessons={session.lessons}
        userWords={words}
        currentBatchPairs={session.currentBatchPairs}
        currentLessonId={session.currentLessonId}
      />
    </>
  );
};
