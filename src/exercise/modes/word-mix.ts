// Layer 4 — Word Mix Mode planner.
// See CLAUDE.md > Architecture Reference > Mode specs > Word Mix.

import { BLOCK_COUNT, WORD_MIX } from "../constants";
import { selectErrorPool } from "../error-pool";
import { buildWordMatchExercise } from "../exercise-builders";
import { findCurrentLessonId } from "../progression";
import { pickPair } from "../selection";

import type { WordStats } from "../../context/auth";
import type { Lesson, WordEntry } from "../letz-parser";
import type { ModeConfig } from "../mode-config";
import type { Exercise } from "../types";

// Word Mix: 3 Blocks × 1 Slot each → milestones at 1, 2, 3
const BLOCK_BOUNDARIES = Array.from({ length: BLOCK_COUNT }, (_, i) =>
  (i + 1) * WORD_MIX.slotsPerBlock,
);

/**
 * Plans a Word Mix Session.
 *
 * Pool = all lessons up to and including the cursor (current lesson).
 * All 60 pairs are seeded at plan time from a stats snapshot — mid-session
 * results do not re-bucket later pairs.
 */
export const planWordMixMode = (
  lessons: Lesson[],
  stats: Record<string, WordStats>,
  rng: () => number = Math.random,
): ModeConfig => {
  const currentLessonId = findCurrentLessonId(lessons, stats);
  const pool = lessons.filter((l) => l.meta.id <= currentLessonId);

  if (pool.length === 0) {
    return {
      lessons,
      queue: [],
      plannedSlots: WORD_MIX.totalSlots,
      currentLessonId,
      blockBoundaries: BLOCK_BOUNDARIES,
      hasCorrectionBlock: false,
      completionEffect: "noop",
    };
  }

  const currentLesson = pool[pool.length - 1];
  const errorWords = selectErrorPool(stats, pool).words;

  const wordPools = {
    errors: errorWords,
    current: currentLesson.entries,
    previous: pool.slice(0, -1).flatMap((l) => l.entries),
  };

  // 3 slots, each a WordMatch Exercise with WORD_MIX.pairsPerSlot pairs.
  // Pairs are seeded here, not per-slot-start.
  const queue: Exercise[] = Array.from(
    { length: WORD_MIX.totalSlots },
    () => buildWordMatchExercise(buildPairs(wordPools, rng)),
  );

  return {
    lessons,
    queue,
    plannedSlots: WORD_MIX.totalSlots,
    currentLessonId,
    blockBoundaries: BLOCK_BOUNDARIES,
    hasCorrectionBlock: false,
    completionEffect: "noop",
  };
};

// ─── Internal ─────────────────────────────────────────────────────────────────

const buildPairs = (
  wordPools: Record<"errors" | "current" | "previous", ReadonlyArray<WordEntry>>,
  rng: () => number,
): WordEntry[] =>
  Array.from({ length: WORD_MIX.pairsPerSlot }, () =>
    pickPair(wordPools, WORD_MIX.buckets.pairSource, rng),
  ).filter((p): p is WordEntry => p !== undefined);
