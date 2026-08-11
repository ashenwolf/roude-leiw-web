// Layer 4 — Fix Errors Mode planner.
// See CLAUDE.md > Architecture Reference > Mode specs > Fix Errors.

import { FIX_ERRORS, LESSON } from "../constants";
import { selectErrorPool } from "../error-pool";
import {
  buildFillExercise,
  buildSentenceExercise,
  buildWordMatchExercise,
} from "../exercise-builders";
import { findCurrentLessonId } from "../progression";
import { bucketedPick, pickPair } from "../selection";

import type { WordStats } from "../../context/auth";
import type { FillError, PhraseError } from "../error-pool";
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
 * All three pools (words, phrases, fills) come from the centralized error pool,
 * and each entry carries the direction it was failed in, so an item is repeated
 * exactly as the user got it wrong — no direction roll here.
 * The Home button is disabled when the error pool is empty, so the planner
 * always runs with at least one element available (but handles empty defensively).
 */
export const planFixErrorsMode = (
  lessons: Lesson[],
  stats: Record<string, WordStats>,
  persistedUnlocked: ReadonlyArray<string> = [],
  rng: () => number = Math.random,
): ModeConfig => {
  const errorPool = selectErrorPool(stats, lessons);
  // Display/debug only — Fix Errors draws exclusively from the error pool.
  const currentLessonId = findCurrentLessonId(lessons, stats, persistedUnlocked);

  const empty =
    errorPool.words.length === 0 &&
    errorPool.phrases.length === 0 &&
    errorPool.fills.length === 0;
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
  const fillPool = errorPool.fills;

  const queue: Exercise[] = [];
  for (let i = 0; i < LESSON.totalSlots; i++) {
    const slot = buildSlot(wordPools, phrasePool, fillPool, rng);
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
  fillPool: ReadonlyArray<FillError>,
  rng: () => number,
): Exercise | null => {
  // One builder per slot type, each returning null when its pool is empty. The
  // roll/re-roll loop below is then type-agnostic — adding a fourth Exercise type
  // means adding one entry here, not another branch in the loop.
  const builders = {
    "word-match": (): Exercise | null => {
      // Checked before drawing: a builder for an empty pool must consume no rng,
      // or a re-roll would silently shift every later draw.
      if (wordPools.errors.length === 0) return null;
      // Independent draws with replacement from the error pool
      const pairs = Array.from({ length: LESSON.wordMatchPairs }, () =>
        pickPair(wordPools, ERRORS_ONLY_BUCKET, rng),
      ).filter((p): p is WordEntry => p !== undefined);
      return pairs.length > 0 ? buildWordMatchExercise(pairs) : null;
    },
    "sentence-builder": (): Exercise | null => {
      if (phrasePool.length === 0) return null;
      const { sentence, direction } = phrasePool[Math.floor(rng() * phrasePool.length)];
      return buildSentenceExercise(sentence, direction, []);
    },
    // Rebuilt in the SAME direction it was failed in — the pool entry carries it.
    "fill-blank": (): Exercise | null => {
      if (fillPool.length === 0) return null;
      const { fill, direction } = fillPool[Math.floor(rng() * fillPool.length)];
      return buildFillExercise(fill, direction);
    },
  };

  // Empty bucket for the rolled type → re-roll (up to the attempt limit).
  // Recursive rather than a pre-generated roll list: each attempt must draw its
  // roll only when it is actually taken, or the rng consumption order shifts and
  // fakeRng-driven tests stop describing real Sessions.
  const rollSlot = (attemptsLeft: number): Exercise | null => {
    if (attemptsLeft === 0) return null;
    const slotType = bucketedPick(rng(), FIX_ERRORS.buckets.slotType);
    return builders[slotType]() ?? rollSlot(attemptsLeft - 1);
  };

  const rolled = rollSlot(20);
  if (rolled) return rolled;

  // Fallback: whichever pool is non-empty, in a fixed order.
  return (
    builders["word-match"]() ??
    builders["sentence-builder"]() ??
    builders["fill-blank"]()
  );
};
