import { useNavigation } from "../context/useNavigation";
import { WordMatch } from "../exercise/WordMatch";
import { useExerciseSession } from "../exercise/use-exercise-session";
import { Button } from "../ui/Button";
import { ProgressBar } from "../ui/ProgressBar";
import { MilestonePopup, CelebrationPopup } from "../ui/Popup";

export const AppExercise = () => {
  const { navigateTo } = useNavigation();

  const {
    state,
    error,
    currentBatch,
    totalBatches,
    currentBatchPairs,
    batchProgress,
    startSession,
    handleBatchComplete,
    handleMatchProgress,
    dismissMilestone,
    resetSession,
  } = useExerciseSession();

  // Loading state
  if (state === "loading") {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="animate-pulse text-gray-500 text-lg">Loading lessons...</div>
      </div>
    );
  }

  // Error state
  if (state === "error") {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <h2 className="text-xl font-bold text-red-600">Failed to load lessons</h2>
        <p className="text-gray-600">{error}</p>
        <Button onClick={() => navigateTo("home")}>Back to Home</Button>
      </div>
    );
  }

  // Ready state - show start button
  if (state === "ready") {
    return (
      <div className="flex flex-col items-center gap-6 py-8">
        <h2 className="text-2xl font-bold text-gray-800">Word Match Exercise</h2>
        <p className="text-gray-600 text-center">
          Match Luxembourgish words with their English translations.
          <br />
          Complete {totalBatches} batches to finish the exercise.
        </p>
        <div className="w-full max-w-xs">
          <Button onClick={startSession}>Start Exercise</Button>
        </div>
        <button
          onClick={() => navigateTo("home")}
          className="text-gray-500 hover:text-gray-700 transition-colors"
        >
          Back to Home
        </button>
      </div>
    );
  }

  // Active state - show the exercise
  return (
    <div className="flex flex-col gap-6">
      {/* Progress bar */}
      <ProgressBar
        batchProgress={batchProgress}
        currentBatch={currentBatch}
        totalBatches={totalBatches}
      />

      {/* Word match game */}
      {currentBatchPairs.length > 0 && (
        <WordMatch
          key={`batch-${currentBatch}`}
          pairs={currentBatchPairs}
          onComplete={handleBatchComplete}
          onMatch={handleMatchProgress}
        />
      )}

      {/* Back button */}
      <div className="mt-4">
        <button
          onClick={() => navigateTo("home")}
          className="text-gray-500 hover:text-gray-700 transition-colors text-sm"
        >
          ← Back to Home
        </button>
      </div>

      {/* Milestone popup (between batches) */}
      <MilestonePopup
        visible={state === "batch_complete"}
        onDismiss={dismissMilestone}
        batchNumber={currentBatch + 1}
        totalBatches={totalBatches}
      />

      {/* Final celebration popup */}
      <CelebrationPopup
        visible={state === "session_complete"}
        onDismiss={() => navigateTo("home")}
        onTryAgain={resetSession}
      />
    </div>
  );
};
