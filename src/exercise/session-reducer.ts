import { multimethod, __ } from "../lib/multimethod";

import type { Lesson } from "./letz-parser";
import type { ExerciseBatch } from "./types";
import type { SessionMode } from "./batch-planner";

// ============================================================================
// State
// ============================================================================

export type SessionStatus =
  | "loading"
  | "error"
  | "ready"
  | "active"
  | "slot_complete"      // individual slot done — brief auto-dismiss
  | "section_complete"   // 5-slot block done — user-dismissed
  | "session_complete";

export type SessionState = {
  status: SessionStatus;
  error: string | null;
  lessons: Lesson[];
  queue: ExerciseBatch[];
  plannedSlots: number;
  currentSlot: number;
  slotProgress: number;
  currentLessonId: string;
  mode: SessionMode;
  lastSlotOutcome: "success" | "mistake" | null;
};

export const INITIAL_SESSION_STATE: SessionState = {
  status: "loading",
  error: null,
  lessons: [],
  queue: [],
  plannedSlots: 0,
  currentSlot: 0,
  slotProgress: 0,
  currentLessonId: "",
  mode: { kind: "lesson" },
  lastSlotOutcome: null,
};

// ============================================================================
// Actions
// ============================================================================

export type SessionAction =
  | { type: "LOADED"; lessons: Lesson[]; queue: ExerciseBatch[]; plannedSlots: number; currentLessonId: string }
  | { type: "LOAD_ERROR"; error: string }
  | { type: "START" }
  | { type: "SLOT_PROGRESS"; done: number; total: number }
  | { type: "SLOT_COMPLETE"; outcome: "success" | "mistake"; requeueBatch?: ExerciseBatch }
  | { type: "DISMISS_MILESTONE" }
  | { type: "RESET"; queue: ExerciseBatch[]; plannedSlots: number; currentLessonId: string };

const narrow = <T extends SessionAction["type"]>(action: SessionAction) =>
  action as Extract<SessionAction, { type: T }>;

// ============================================================================
// Reducer
// ============================================================================

export const sessionReducer = multimethod(
  (state: SessionState, action: SessionAction) => [action.type, state.status],
)
  .method(["LOADED", __], (state: SessionState, action: SessionAction) => {
    const { lessons, queue, plannedSlots, currentLessonId } = narrow<"LOADED">(action);
    return { ...state, status: "ready" as const, error: null, lessons, queue, plannedSlots, currentLessonId };
  })

  .method(["LOAD_ERROR", __], (state: SessionState, action: SessionAction) => ({
    ...state, status: "error" as const, error: narrow<"LOAD_ERROR">(action).error,
  }))

  .method(["START", __], (state: SessionState) => ({
    ...state, status: "active" as const, currentSlot: 0, slotProgress: 0, lastSlotOutcome: null,
  }))

  .method(["SLOT_PROGRESS", "active"], (state: SessionState, action: SessionAction) => {
    const { done, total } = narrow<"SLOT_PROGRESS">(action);
    return { ...state, slotProgress: total > 0 ? done / total : 0 };
  })

  .method(["SLOT_COMPLETE", "active"], (state: SessionState, action: SessionAction) => {
    const { outcome, requeueBatch } = narrow<"SLOT_COMPLETE">(action);
    const queue = requeueBatch ? [...state.queue, requeueBatch] : state.queue;
    const isLast = state.currentSlot >= queue.length - 1;
    const sectionSize = state.plannedSlots > 0 ? Math.ceil(state.plannedSlots / 3) : 5;
    // Section boundaries only count within planned slots — overflow is one continuous block
    const isAtSectionEnd = state.currentSlot + 1 <= state.plannedSlots
      && (state.currentSlot + 1) % sectionSize === 0;
    const status: SessionStatus = isLast
      ? "session_complete"
      : isAtSectionEnd
      ? "section_complete"
      : "slot_complete";
    return { ...state, queue, status, lastSlotOutcome: outcome };
  })

  .method(["DISMISS_MILESTONE", "slot_complete"], (state: SessionState) => ({
    ...state, status: "active" as const, currentSlot: state.currentSlot + 1, slotProgress: 0,
  }))

  .method(["DISMISS_MILESTONE", "section_complete"], (state: SessionState) => ({
    ...state, status: "active" as const, currentSlot: state.currentSlot + 1, slotProgress: 0,
  }))

  .method(["RESET", __], (state: SessionState, action: SessionAction) => {
    const { queue, plannedSlots, currentLessonId } = narrow<"RESET">(action);
    return { ...state, status: "ready" as const, queue, plannedSlots, currentLessonId, currentSlot: 0, slotProgress: 0, lastSlotOutcome: null };
  })

  .default((state: SessionState) => state);
