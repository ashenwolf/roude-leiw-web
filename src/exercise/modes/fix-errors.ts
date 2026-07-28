// Layer 4 — Fix Errors Mode planner.
// See CLAUDE.md > Architecture Reference > Mode specs > Fix Errors.

import { FIX_ERRORS, LESSON } from "../constants";
import { selectErrorPool } from "../error-pool";
import { buildSentenceExercise, buildWordMatchExercise } from "../exercise-builders";
import { findCurrentLessonId } from "../progression";
import { bucketedPick, pickPair } from "../selection";

import type { WordStats } from "../../context/auth";
import type { PhraseError } from "../error-pool";
import type { Lesson, WordEntry } from "../letz-parser";
import type { ModeConfig } from "../mode-config";
import type { Exercise } from "../types";

const BLOCK_BOUNDARIES = [
  LESSON.slotsPerBlock,
  2 * LESSON.slotsPerBlock,
  3 * LESSON.slotsPerBlock,
] as const;

// Single-bucket pool — all draws come from the error pool.
const ERRORS_ONLY_BUCKET = [{ name: "errors" as const, upTo: 1.0 }];

/**
 * Plans a Fix Errors Session.
 *
 * Both word and phrase pools come from the centralized error pool.
 * The Home button is disabled when the error pool is empty, so the planner
 * always runs with at least one element available (but handles empty defensively).
 */
export const planFixErrorsMode = (
  lessons: Lesson[],
  stats: Record<string, WordStats>,
  rng: () => number = Math.random,
): ModeConfig => {
  const errorPool = selectErrorPool(stats, lessons);
  const currentLessonId = findCurrentLessonId(lessons, stats);

  const empty = errorPool.words.length === 0 && errorPool.phrases.length === 0;
  if (empty) {
    return {
      lessons,
      queue: [],
      plannedSlots: LESSON.totalSlots,
      currentLessonId,
      blockBoundaries: BLOCK_BOUNDARIES,
      hasCorrectionBlock: true,
      completionEffect: "noop",
    };
  }

  const wordPools = { errors: errorPool.words };
  const phrasePool = errorPool.phrases;

  const queue: Exercise[] = [];
  for (let i = 0; i < LESSON.totalSlots; i++) {
    const slot = buildSlot(wordPools, phrasePool, rng);
    if (slot) queue.push(slot);
  }

  return {
    lessons,
    queue,
    plannedSlots: LESSON.totalSlots,
    currentLessonId,
    blockBoundaries: BLOCK_BOUNDARIES,
    hasCorrectionBlock: true,
    completionEffect: "noop",
  };
};

// ─── Internal ─────────────────────────────────────────────────────────────────

const buildSlot = (
  wordPools: Record<"errors", ReadonlyArray<WordEntry>>,
  phrasePool: ReadonlyArray<PhraseError>,
  rng: () => number,
): Exercise | null => {
  const hasWords = wordPools.errors.length > 0;
  const hasPhrases = phrasePool.length > 0;

  for (let attempt = 0; attempt < 20; attempt++) {
    const slotType = bucketedPick(rng(), FIX_ERRORS.buckets.slotType);

    if (slotType === "sentence-builder" && hasPhrases) {
      const { sentence, direction } = phrasePool[Math.floor(rng() * phrasePool.length)];
      return buildSentenceExercise(sentence, direction, []);
    }

    if (slotType === "word-match" && hasWords) {
      // Independent draws with replacement from the error pool
      const pairs = Array.from({ length: LESSON.wordMatchPairs }, () =>
        pickPair(wordPools, ERRORS_ONLY_BUCKET, rng),
      ).filter((p): p is WordEntry => p !== undefined);

      if (pairs.length > 0) return buildWordMatchExercise(pairs);
    }
    // Empty bucket for rolled type → re-roll (up to attempt limit)
  }

  // Fallback: if only one pool type available, use it
  if (hasWords) {
    const pairs = Array.from({ length: LESSON.wordMatchPairs }, () =>
      pickPair(wordPools, ERRORS_ONLY_BUCKET, rng),
    ).filter((p): p is WordEntry => p !== undefined);
    return pairs.length > 0 ? buildWordMatchExercise(pairs) : null;
  }
  if (hasPhrases) {
    const { sentence, direction } = phrasePool[Math.floor(rng() * phrasePool.length)];
    return buildSentenceExercise(sentence, direction, []);
  }
  return null;
};
