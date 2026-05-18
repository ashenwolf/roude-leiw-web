import { useEffect, useReducer, useRef } from "react";

import { LESSON_TOTAL_SLOTS, LESSON_WORD_MATCH_PAIR_COUNT } from "./constants";
import { loadAllLessons } from "./lesson-loader";
import { planLessonMode } from "./modes/lesson";
import { planWordMixMode } from "./modes/word-mix";
import { planFixErrorsMode } from "./modes/fix-errors";
import { findCurrentLessonId } from "./progression";
import { computeProgressView } from "./session-progress";
import { sessionReducer, INITIAL_SESSION_STATE } from "./session-reducer";

import type { WordStats } from "../context/auth";
import type { SessionMode } from "./mode-config";
import type { WordResultMap } from "./WordMatch/types";
import type { Exercise } from "./types";

// ============================================================================
// Config (preserved for backward compatibility — now references constants)
// ============================================================================

export const SESSION_CONFIG = {
  PLANNED_SLOTS: LESSON_TOTAL_SLOTS,
  WORD_MATCH_SIZE: LESSON_WORD_MATCH_PAIR_COUNT,
} as const;

// ============================================================================
// Hook — pure wiring: load lessons → plan queue → drive reducer
// ============================================================================

type UseExerciseSessionProps = {
  userWords: Record<string, WordStats>;
  mode?: SessionMode;
};

/** Word-match always succeeds; sentence-builder outcome depends on correctness. */
const determineSlotOutcome = (
  batch: Exercise,
  results: WordResultMap,
): "success" | "mistake" => {
  if (batch.type === "word-match") return "success";
  const r = results[batch.item.phraseKey];
  return r && r.correct > 0 ? "success" : "mistake";
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
        const words = userWordsRef.current;

        const config =
          mode.kind === "word-mix"
            ? planWordMixMode(lessons, words)
            : mode.kind === "fix-errors"
            ? planFixErrorsMode(lessons, words)
            : planLessonMode(
                lessons,
                mode.lessonId ?? findCurrentLessonId(lessons, words),
              );

        dispatch({
          type: "LOADED",
          lessons: config.lessons,
          queue: config.queue,
          plannedSlots: config.plannedSlots,
          blockBoundaries: config.blockBoundaries,
          currentLessonId: config.currentLessonId,
        });
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
      const words = userWords;
      const config =
        mode.kind === "word-mix"
          ? planWordMixMode(lessons, words)
          : mode.kind === "fix-errors"
          ? planFixErrorsMode(lessons, words)
          : planLessonMode(
              lessons,
              mode.lessonId ?? findCurrentLessonId(lessons, words),
            );
      dispatch({
        type: "RESET",
        queue: config.queue,
        plannedSlots: config.plannedSlots,
        blockBoundaries: config.blockBoundaries,
        currentLessonId: config.currentLessonId,
      });
    });
  };

  const isSlotDone = state.status === "slot_complete" || state.status === "section_complete";
  const completedSlots = isSlotDone ? state.currentSlot + 1 : state.currentSlot;
  const progressView = computeProgressView(completedSlots, state.slotProgress, state.queue.length, state.blockBoundaries);

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
