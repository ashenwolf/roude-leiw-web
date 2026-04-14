import { useEffect, useReducer, useRef } from "react";

import { entriesToWordPairs } from "./letz-parser";
import { loadAllLessons } from "./lesson-loader";
import { computeUnlockedLessonIds, findCurrentLessonId } from "./progression";
import { sessionReducer, INITIAL_SESSION_STATE } from "./session-reducer";
import { lessonsToCandidates, selectItemsForBatch } from "./word-selector";

import type { WordStats } from "../context/auth";
import type { Lesson } from "./letz-parser";
import type { ExerciseBatch, WordMatchBatch } from "./types";
import type { ItemSelectionConfig } from "./word-selector";
import type { WordResultMap } from "./WordMatch/types";

// ============================================================================
// Config
// ============================================================================

export const SESSION_CONFIG = {
  BATCH_SIZE: 20,
  BATCH_COUNT: 3,
} as const;

// ============================================================================
// Pure helpers
// ============================================================================

const buildWordMatchBatch = (
  lessons: Lesson[],
  unlockedIds: ReadonlyArray<string>,
  currentLessonId: string,
  userWords: Record<string, WordStats>,
  config: ItemSelectionConfig,
): WordMatchBatch => {
  const candidates = lessonsToCandidates(lessons, unlockedIds);
  const selected = selectItemsForBatch(candidates, userWords, currentLessonId, new Set(), config);
  return {
    type: "word-match",
    pairs: entriesToWordPairs(selected.map((s) => s.item)),
  };
};

const buildBatches = (
  lessons: Lesson[],
  userWords: Record<string, WordStats>,
  targetLessonId: string | undefined,
  batchSize: number,
  batchCount: number,
): ExerciseBatch[] => {
  if (lessons.length === 0) return [];

  const unlockedIds = computeUnlockedLessonIds(lessons, userWords);
  const currentId = targetLessonId ?? findCurrentLessonId(lessons, userWords);

  return Array.from({ length: batchCount }).map((_, idx) => {
    const isLastBatch = idx === batchCount - 1;
    const config: ItemSelectionConfig = isLastBatch
      ? { batchSize, bucketRatios: { new: 0.15, struggling: 0.25, reinforcing: 0.30, reviewing: 0.30 } }
      : { batchSize, bucketRatios: { new: 0.25, struggling: 0.25, reinforcing: 0.25, reviewing: 0.25 } };

    return buildWordMatchBatch(lessons, unlockedIds, currentId, userWords, config);
  });
};

// ============================================================================
// Hook
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

  // Ref for userWords — needed in async effect callback where closure would be stale
  const userWordsRef = useRef(userWords);
  useEffect(() => { userWordsRef.current = userWords; });

  // Single async effect: load lessons → dispatch LOADED
  useEffect(() => {
    loadAllLessons()
      .then((lessons) => {
        const batches = buildBatches(lessons, userWordsRef.current, targetLessonId, batchSize, batchCount);
        const currentLessonId = targetLessonId ?? findCurrentLessonId(lessons, userWordsRef.current);
        dispatch({ type: "LOADED", lessons, batches, currentLessonId });
      })
      .catch((err) => {
        dispatch({ type: "LOAD_ERROR", error: err instanceof Error ? err.message : "Failed to load lessons" });
      });
  }, [targetLessonId, batchSize, batchCount]);

  // ── Callbacks — React Compiler handles memoization ─────────────────

  const startSession = () => {
    dispatch({ type: "START" });
  };

  const handleMatchProgress = (matchedCount: number, totalPairs: number) => {
    dispatch({ type: "MATCH_PROGRESS", matchedCount, totalPairs });
  };

  const handleBatchComplete = (wordResults: WordResultMap) => {
    // Side effect first (fire-and-forget), then state transition
    onBatchResults?.(wordResults);
    dispatch({ type: "BATCH_COMPLETE" });
  };

  const dismissMilestone = () => {
    dispatch({ type: "DISMISS_MILESTONE" });
  };

  const resetSession = () => {
    const batches = buildBatches(state.lessons, userWords, targetLessonId, batchSize, batchCount);
    const currentLessonId = targetLessonId ?? findCurrentLessonId(state.lessons, userWords);
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
