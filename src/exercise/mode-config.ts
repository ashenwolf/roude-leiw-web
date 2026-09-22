// Layer 3 contract — produced by Mode planners (Layer 4), consumed by SessionMachine.
// See .claude/reference/mode-specs.md > Pipeline alignment invariants.

import type { Lesson } from "./letz-parser";
import type { Exercise } from "./types";

// ─── Mode discriminator ───────────────────────────────────────────────────────

export type SessionMode =
  | { kind: "lesson"; lessonId?: string }
  | { kind: "word-mix" }
  | { kind: "fix-errors" }
  | { kind: "exam"; subLessonId: string };

// ─── ModeConfig ───────────────────────────────────────────────────────────────

/** Side effect to trigger when a Session completes. No callbacks — the wiring
 *  hook reads this tag and acts at the edge (navigation, unlock check, refresh). */
export type CompletionEffect = "unlock-check" | "noop";

/**
 * Everything the SessionMachine needs to run a Mode.
 * Produced once at Session start by the matching Mode planner.
 * Immutable for the lifetime of the Session.
 */
export type ModeConfig = {
  /** Loaded lessons — stored in session state for context (e.g., titles). */
  lessons: Lesson[];
  /** Pre-built exercise queue — every Slot's Exercise is fully seeded at plan time. */
  queue: Exercise[];
  /** Total planned slots (excluding correction Block). */
  plannedSlots: number;
  /** The lesson the Session is focused on (used for unlock-check on completion). */
  currentLessonId: string;
  /**
   * Cumulative slot counts at which each Block ends.
   * E.g., [5, 10, 15] means Block 1 ends after slot 5, Block 2 after slot 10, etc.
   */
  blockBoundaries: ReadonlyArray<number>;
  /** Whether failed SentenceBuilder slots are re-queued into a correction Block. */
  hasCorrectionBlock: boolean;
  /** Side effect tag — no callbacks cross layer boundaries. */
  completionEffect: CompletionEffect;
};

// ─── Planner shape ──────────────────────────────────────────────────────

/**
 * The fields a Mode fixes once, independent of what it ends up scheduling.
 *
 * Every planner needs a `ModeConfig` twice — once for its real plan and once for
 * the empty-pool case — and those two differed only in `queue` while restating
 * five constant fields. Splitting the constants out means a Mode declares its
 * shape in one place, and a new `ModeConfig` field lands in one site per Mode
 * rather than two.
 */
export type ModeShape = {
  /**
   * Slot count and Block cuts, for a Mode that fixes them. Exam omits both: it
   * schedules one Slot per Element, so they are content-derived and arrive with
   * the plan. Optional rather than dummy zeroes — a shape should not claim a
   * number it does not have.
   */
  readonly plannedSlots?: number;
  readonly blockBoundaries?: ReadonlyArray<number>;
  readonly hasCorrectionBlock: boolean;
  readonly completionEffect: CompletionEffect;
};

/**
 * Assembles a `ModeConfig` from a Mode's fixed shape plus what this Session
 * actually planned.
 *
 * The plan wins over the shape for slot count and Block cuts, so a Mode that
 * derives them from content (Exam) passes them here and one that fixes them
 * declares them once in its shape.
 */
export const modeConfig = (
  shape: ModeShape,
  plan: {
    lessons: Lesson[];
    queue: Exercise[];
    currentLessonId: string;
    plannedSlots?: number;
    blockBoundaries?: ReadonlyArray<number>;
  },
): ModeConfig => ({
  lessons: plan.lessons,
  queue: plan.queue,
  plannedSlots: plan.plannedSlots ?? shape.plannedSlots ?? plan.queue.length,
  currentLessonId: plan.currentLessonId,
  blockBoundaries: plan.blockBoundaries ?? shape.blockBoundaries ?? [],
  hasCorrectionBlock: shape.hasCorrectionBlock,
  completionEffect: shape.completionEffect,
});
