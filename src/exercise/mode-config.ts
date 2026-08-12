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
