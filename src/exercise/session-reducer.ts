import { multimethod, __ } from "../lib/multimethod";

import type { Lesson } from "./letz-parser";
import type { ExerciseBatch } from "./types";

// ============================================================================
// State
// ============================================================================

export type SessionStatus = "loading" | "error" | "ready" | "active" | "batch_complete" | "session_complete";

export type SessionState = {
  status: SessionStatus;
  error: string | null;
  lessons: Lesson[];
  batches: ExerciseBatch[];
  currentBatch: number;
  batchProgress: number;
  currentLessonId: string;
};

export const INITIAL_SESSION_STATE: SessionState = {
  status: "loading",
  error: null,
  lessons: [],
  batches: [],
  currentBatch: 0,
  batchProgress: 0,
  currentLessonId: "",
};

// ============================================================================
// Actions
// ============================================================================

export type SessionAction =
  | { type: "LOADED"; lessons: Lesson[]; batches: ExerciseBatch[]; currentLessonId: string }
  | { type: "LOAD_ERROR"; error: string }
  | { type: "START" }
  | { type: "MATCH_PROGRESS"; matchedCount: number; totalPairs: number }
  | { type: "BATCH_COMPLETE" }
  | { type: "DISMISS_MILESTONE" }
  | { type: "RESET"; batches: ExerciseBatch[]; currentLessonId: string };

// Narrow action to a specific type — avoids verbose `as Extract<>` casts
const narrow = <T extends SessionAction["type"]>(action: SessionAction) =>
  action as Extract<SessionAction, { type: T }>;

// ============================================================================
// Reducer — multimethod dispatches on [action.type, state.status]
// Guards are encoded in the pattern: no guard clauses needed in handlers
// ============================================================================

export const sessionReducer = multimethod(
  (state: SessionState, action: SessionAction) => [action.type, state.status],
)
  .method(["LOADED", __], (state: SessionState, action: SessionAction) => {
    const { lessons, batches, currentLessonId } = narrow<"LOADED">(action);
    return { ...state, status: "ready" as const, error: null, lessons, batches, currentLessonId };
  })

  .method(["LOAD_ERROR", __], (state: SessionState, action: SessionAction) => ({
    ...state, status: "error" as const, error: narrow<"LOAD_ERROR">(action).error,
  }))

  .method(["START", __], (state: SessionState) => ({
    ...state, status: "active" as const, currentBatch: 0, batchProgress: 0,
  }))

  .method(["MATCH_PROGRESS", "active"], (state: SessionState, action: SessionAction) => {
    const { matchedCount, totalPairs } = narrow<"MATCH_PROGRESS">(action);
    return { ...state, batchProgress: totalPairs > 0 ? matchedCount / totalPairs : 0 };
  })

  .method(["BATCH_COMPLETE", "active"], (state: SessionState) => ({
    ...state,
    status: (state.currentBatch >= state.batches.length - 1
      ? "session_complete"
      : "batch_complete") as SessionStatus,
  }))

  .method(["DISMISS_MILESTONE", "batch_complete"], (state: SessionState) => ({
    ...state, status: "active" as const, currentBatch: state.currentBatch + 1, batchProgress: 0,
  }))

  .method(["RESET", __], (state: SessionState, action: SessionAction) => {
    const { batches, currentLessonId } = narrow<"RESET">(action);
    return { ...state, status: "ready" as const, batches, currentLessonId, currentBatch: 0, batchProgress: 0 };
  })

  .default((state: SessionState) => state);
