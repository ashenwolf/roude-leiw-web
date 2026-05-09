import { useEffect, useReducer, useRef } from "react";

import { planBatches } from "./batch-planner";
import { loadAllLessons } from "./lesson-loader";
import { sessionReducer, INITIAL_SESSION_STATE } from "./session-reducer";

import type { WordStats } from "../context/auth";
import type { WordResultMap } from "./WordMatch/types";

// ============================================================================
// Config
// ============================================================================

export const SESSION_CONFIG = {
  BATCH_SIZE: 20,
  BATCH_COUNT: 3,
} as const;

// ============================================================================
// Hook — pure wiring: load lessons → plan batches → drive reducer
// ============================================================================

type UseExerciseSessionProps = {
  userWords: Record<string, WordStats>;
  targetLessonId?: string;
  batchSize?: number;
  batchCount?: number;
  onBatchResults?: (wordResults: WordResultMap) => void;
};

export const useExerciseSession = ({
  userWords,
  targetLessonId,
  batchSize = SESSION_CONFIG.BATCH_SIZE,
  batchCount = SESSION_CONFIG.BATCH_COUNT,
  onBatchResults,
}: UseExerciseSessionProps) => {
  const [state, dispatch] = useReducer(sessionReducer, INITIAL_SESSION_STATE);

  // userWords may populate after auth resolves (after this effect fires).
  // Read latest via ref at promise-resolution time so planBatches sees real progress.
  const userWordsRef = useRef(userWords);
  useEffect(() => { userWordsRef.current = userWords; });

  useEffect(() => {
    loadAllLessons()
      .then((lessons) => {
        const { batches, currentLessonId } = planBatches(lessons, userWordsRef.current, targetLessonId, { batchSize, batchCount });
        dispatch({ type: "LOADED", lessons, batches, currentLessonId });
      })
      .catch((err) => {
        dispatch({ type: "LOAD_ERROR", error: err instanceof Error ? err.message : "Failed to load lessons" });
      });
  }, [targetLessonId, batchSize, batchCount]);

  const startSession = () => dispatch({ type: "START" });

  const handleMatchProgress = (matchedCount: number, totalPairs: number) =>
    dispatch({ type: "MATCH_PROGRESS", matchedCount, totalPairs });

  const handleBatchComplete = (wordResults: WordResultMap) => {
    // Side effect first (fire-and-forget), then state transition. Order is intentional.
    onBatchResults?.(wordResults);
    dispatch({ type: "BATCH_COMPLETE" });
  };

  const dismissMilestone = () => dispatch({ type: "DISMISS_MILESTONE" });

  const resetSession = () => {
    const { batches, currentLessonId } = planBatches(state.lessons, userWords, targetLessonId, { batchSize, batchCount });
    dispatch({ type: "RESET", batches, currentLessonId });
  };

  return {
    state: state.status,
    error: state.error,
    lessons: state.lessons,
    currentBatchIndex: state.currentBatch,
    totalBatches: state.batches.length || batchCount,
    currentBatch: state.batches[state.currentBatch],
    batchProgress: state.batchProgress,
    currentLessonId: state.currentLessonId,
    startSession,
    handleBatchComplete,
    handleMatchProgress,
    dismissMilestone,
    resetSession,
  };
};
