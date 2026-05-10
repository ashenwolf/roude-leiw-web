import { useEffect, useReducer, useRef } from "react";

import { determineSlotOutcome, planSlots, planMadnessSlots, planMistakesSlots } from "./batch-planner";
import { loadAllLessons } from "./lesson-loader";
import { computeProgressView } from "./session-progress";
import { sessionReducer, INITIAL_SESSION_STATE } from "./session-reducer";

import type { WordStats } from "../context/auth";
import type { WordResultMap } from "./WordMatch/types";
import type { SessionMode } from "./batch-planner";

// ============================================================================
// Config
// ============================================================================

export const SESSION_CONFIG = {
  PLANNED_SLOTS: 15,
  WORD_MATCH_SIZE: 5,
} as const;

// ============================================================================
// Hook — pure wiring: load lessons → plan queue → drive reducer
// ============================================================================

type UseExerciseSessionProps = {
  userWords: Record<string, WordStats>;
  mode?: SessionMode;
};

export const useExerciseSession = ({
  userWords,
  mode = { kind: "lesson" },
}: UseExerciseSessionProps) => {
  const [state, dispatch] = useReducer(sessionReducer, INITIAL_SESSION_STATE);

  const userWordsRef = useRef(userWords);
  useEffect(() => { userWordsRef.current = userWords; });

  useEffect(() => {

    loadAllLessons()
      .then((lessons) => {
        const plan = mode.kind === "madness"
          ? planMadnessSlots(lessons, userWordsRef.current)
          : mode.kind === "mistakes"
          ? planMistakesSlots(lessons, userWordsRef.current)
          : planSlots(lessons, userWordsRef.current, (mode as { lessonId?: string }).lessonId);

        dispatch({ type: "LOADED", lessons, queue: plan.queue, plannedSlots: plan.plannedSlots, currentLessonId: plan.currentLessonId });
      })
      .catch((err) => {
        dispatch({ type: "LOAD_ERROR", error: err instanceof Error ? err.message : "Failed to load lessons" });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode.kind, (mode as { lessonId?: string }).lessonId]);

  const startSession = () => dispatch({ type: "START" });

  const handleSlotProgress = (done: number, total: number) =>
    dispatch({ type: "SLOT_PROGRESS", done, total });

  const handleSlotComplete = (results: WordResultMap) => {
    const currentBatch = state.queue[state.currentSlot];
    const outcome = currentBatch ? determineSlotOutcome(currentBatch, results) : "success";

    // Sentence mistakes are re-queued immediately to the back of the queue.
    // Word match is always "success" — failed words live in global stats only.
    const requeueBatch =
      currentBatch?.type === "sentence-builder" && outcome === "mistake"
        ? currentBatch
        : undefined;

    dispatch({ type: "SLOT_COMPLETE", outcome, requeueBatch });
  };

  const dismissMilestone = () => dispatch({ type: "DISMISS_MILESTONE" });

  const resetSession = () => {
    loadAllLessons().then((lessons) => {
      const plan = mode.kind === "madness"
        ? planMadnessSlots(lessons, userWords)
        : mode.kind === "mistakes"
        ? planMistakesSlots(lessons, userWords)
        : planSlots(lessons, userWords, (mode as { lessonId?: string }).lessonId);
      dispatch({ type: "RESET", queue: plan.queue, plannedSlots: plan.plannedSlots, currentLessonId: plan.currentLessonId });
    });
  };

  const isSlotDone = state.status === "slot_complete" || state.status === "section_complete";
  const completedSlots = isSlotDone ? state.currentSlot + 1 : state.currentSlot;
  const progressView = computeProgressView(completedSlots, state.slotProgress, state.queue.length, state.plannedSlots);

  return {
    state: state.status,
    error: state.error,
    lessons: state.lessons,
    currentSlotIndex: state.currentSlot,
    totalSlots: state.queue.length,
    lastSlotOutcome: state.lastSlotOutcome,
    progressView,
    currentBatch: state.queue[state.currentSlot],
    currentLessonId: state.currentLessonId,
    startSession,
    handleSlotComplete,
    handleSlotProgress,
    dismissMilestone,
    resetSession,
  };
};
