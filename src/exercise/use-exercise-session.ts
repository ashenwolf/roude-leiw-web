import { useCallback, useEffect, useMemo, useState } from "react";

import { combineAndShuffleEntries, entriesToWordPairs } from "./letz-parser";
import { loadLessonsForLevel } from "./lesson-loader";

import type { WordEntry } from "./letz-parser";

// Configuration constants - can be adjusted as needed
export const SESSION_CONFIG = {
  BATCH_SIZE: 20, // Pairs per batch
  BATCH_COUNT: 3, // Total batches per session
  USER_LEVEL: "A1", // Hardcoded placeholder for now
} as const;

export type SessionState = "loading" | "error" | "ready" | "active" | "batch_complete" | "session_complete";

type UseExerciseSessionProps = {
  userLevel?: string;
  batchSize?: number;
  batchCount?: number;
};

type UseExerciseSessionReturn = {
  state: SessionState;
  error: string | null;
  currentBatch: number;
  totalBatches: number;
  currentBatchPairs: [string, string][];
  batchProgress: number;
  startSession: () => void;
  handleBatchComplete: () => void;
  handleMatchProgress: (matchedCount: number, totalPairs: number) => void;
  dismissMilestone: () => void;
  resetSession: () => void;
};

export const useExerciseSession = ({
  userLevel = SESSION_CONFIG.USER_LEVEL,
  batchSize = SESSION_CONFIG.BATCH_SIZE,
  batchCount = SESSION_CONFIG.BATCH_COUNT,
}: UseExerciseSessionProps = {}): UseExerciseSessionReturn => {
  const [state, setState] = useState<SessionState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [allEntries, setAllEntries] = useState<WordEntry[]>([]);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [batchProgress, setBatchProgress] = useState(0);

  // Load lessons on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        setState("loading");
        setError(null);
        const lessons = await loadLessonsForLevel(userLevel);
        const entries = combineAndShuffleEntries(lessons);
        setAllEntries(entries);
        setState("ready");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load lessons");
        setState("error");
      }
    };

    loadData();
  }, [userLevel]);

  // Calculate total pairs needed for all batches
  const totalPairsNeeded = batchSize * batchCount;

  // Split entries into batches
  const batches = useMemo(() => {
    // If we don't have enough entries, use what we have
    const availableEntries = allEntries.slice(0, totalPairsNeeded);

    // If we have fewer entries than needed, adjust batch sizes proportionally
    const actualBatchSize = Math.ceil(availableEntries.length / batchCount);

    const result: [string, string][][] = [];
    for (let i = 0; i < batchCount; i++) {
      const start = i * actualBatchSize;
      const end = Math.min(start + actualBatchSize, availableEntries.length);
      if (start < availableEntries.length) {
        result.push(entriesToWordPairs(availableEntries.slice(start, end)));
      }
    }

    return result;
  }, [allEntries, batchCount, totalPairsNeeded]);

  // Get current batch pairs
  const currentBatchPairs = batches[currentBatch] ?? [];

  // Calculate actual total batches (may be less if not enough data)
  const totalBatches = batches.length || batchCount;

  const startSession = useCallback(() => {
    setCurrentBatch(0);
    setBatchProgress(0);
    setState("active");
  }, []);

  const handleMatchProgress = useCallback((matchedCount: number, totalPairs: number) => {
    if (totalPairs > 0) {
      setBatchProgress(matchedCount / totalPairs);
    }
  }, []);

  const handleBatchComplete = useCallback(() => {
    const isLastBatch = currentBatch >= totalBatches - 1;

    if (isLastBatch) {
      setState("session_complete");
    } else {
      setState("batch_complete");
    }
  }, [currentBatch, totalBatches]);

  const dismissMilestone = useCallback(() => {
    // Move to next batch
    setCurrentBatch((prev) => prev + 1);
    setBatchProgress(0);
    setState("active");
  }, []);

  const resetSession = useCallback(() => {
    // Reshuffle entries for a new session
    setAllEntries((prev) =>
      combineAndShuffleEntries([{ meta: { id: "", title: "", level: "" }, entries: prev.map((e) => e) }])
    );
    setCurrentBatch(0);
    setBatchProgress(0);
    setState("ready");
  }, []);

  return {
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
  };
};
