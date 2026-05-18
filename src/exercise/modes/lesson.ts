// Layer 4 — Lesson Mode planner.
// Reads lessons + stats, emits a complete ModeConfig with every Slot pre-built.
// See CLAUDE.md > Architecture Reference > Mode specs > Lesson.

import {
  LESSON_SENTENCE_DIRECTION_BUCKETS,
  LESSON_SENTENCE_LESSON_BUCKETS,
  LESSON_SLOTS_PER_BLOCK,
  LESSON_TOTAL_SLOTS,
  LESSON_WORD_MATCH_BUCKETS,
  LESSON_WORD_MATCH_PAIR_COUNT,
  SLOT_TYPE_DISTRIBUTION,
} from "../constants";
import { buildSentenceExercise, buildWordMatchExercise, tokenizeSentence } from "../exercise-builders";
import { bucketedPick, pickPair, pickSentence } from "../selection";

import type { Lesson, WordEntry } from "../letz-parser";
import type { ModeConfig } from "../mode-config";
import type { Exercise } from "../types";

const BLOCK_BOUNDARIES = [
  LESSON_SLOTS_PER_BLOCK,
  2 * LESSON_SLOTS_PER_BLOCK,
  3 * LESSON_SLOTS_PER_BLOCK,
] as const;

/**
 * Plans a Lesson Session.
 *
 * Pool = all lessons where `lesson.meta.id <= upperBoundId` (lexicographic).
 * "Start Learning" passes the cursor as upperBoundId; picking a specific lesson
 * passes that lesson's id (clamps the pool — see CLAUDE.md > Mode specs > Lesson).
 */
export const planLessonMode = (
  lessons: Lesson[],
  upperBoundId: string,
  rng: () => number = Math.random,
): ModeConfig => {
  const pool = lessons.filter((l) => l.meta.id <= upperBoundId);
  if (pool.length === 0) {
    return {
      lessons,
      queue: [],
      plannedSlots: LESSON_TOTAL_SLOTS,
      currentLessonId: "",
      blockBoundaries: BLOCK_BOUNDARIES,
      hasCorrectionBlock: true,
      completionEffect: "unlock-check",
    };
  }

  const currentLesson = pool[pool.length - 1];
  const previousLessons = pool.slice(0, -1);

  const wordPools = {
    current: currentLesson.entries,
    previous: previousLessons.flatMap((l) => l.entries),
  };

  const sentencePools = {
    current: [currentLesson],
    previous: previousLessons,
  };

  // Lesson vocab used as distractor fallback for sentence-builder
  const lessonVocab = [...new Set(
    currentLesson.entries.flatMap((e) => tokenizeSentence(e.lu, "lu")),
  )];

  const queue: Exercise[] = [];
  for (let i = 0; i < LESSON_TOTAL_SLOTS; i++) {
    const slot = buildSlot(wordPools, sentencePools, lessonVocab, rng);
    if (slot) queue.push(slot);
  }

  return {
    lessons,
    queue,
    plannedSlots: LESSON_TOTAL_SLOTS,
    currentLessonId: currentLesson.meta.id,
    blockBoundaries: BLOCK_BOUNDARIES,
    hasCorrectionBlock: true,
    completionEffect: "unlock-check",
  };
};

// ─── Internal ─────────────────────────────────────────────────────────────────

const buildSlot = (
  wordPools: Record<"current" | "previous", ReadonlyArray<WordEntry>>,
  sentencePools: Record<"current" | "previous", ReadonlyArray<Lesson>>,
  lessonVocab: string[],
  rng: () => number,
): Exercise | null => {
  for (let attempt = 0; attempt < 10; attempt++) {
    const slotType = bucketedPick(rng(), SLOT_TYPE_DISTRIBUTION);

    if (slotType === "sentence-builder") {
      const picked = pickSentence(sentencePools, LESSON_SENTENCE_LESSON_BUCKETS, rng);
      if (!picked) continue; // no sentences in pool → re-roll
      const direction = bucketedPick(rng(), LESSON_SENTENCE_DIRECTION_BUCKETS);
      return buildSentenceExercise(picked.sentence, direction, lessonVocab);
    }

    // word-match: LESSON_WORD_MATCH_PAIR_COUNT independent draws
    const pairs = Array.from({ length: LESSON_WORD_MATCH_PAIR_COUNT }, () =>
      pickPair(wordPools, LESSON_WORD_MATCH_BUCKETS, rng),
    ).filter((p): p is WordEntry => p !== undefined);

    if (pairs.length > 0) return buildWordMatchExercise(pairs);
  }

  // Exhausted retries (e.g. rng always hits sentence-builder but no sentences exist).
  // Fall back to word-match unconditionally so the slot is never silently skipped.
  const fallbackPairs = Array.from({ length: LESSON_WORD_MATCH_PAIR_COUNT }, () =>
    pickPair(wordPools, LESSON_WORD_MATCH_BUCKETS, rng),
  ).filter((p): p is WordEntry => p !== undefined);
  return fallbackPairs.length > 0 ? buildWordMatchExercise(fallbackPairs) : null;
};
