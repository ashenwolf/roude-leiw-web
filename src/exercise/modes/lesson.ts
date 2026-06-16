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
  MIN_ANSWERS,
  SLOT_TYPE_DISTRIBUTION,
} from "../constants";
import { buildSentenceExercise, buildWordMatchExercise, tokenizeSentence } from "../exercise-builders";
import { combinedPhraseStats, wordKey } from "../progression";
import { bucketedPick, pickPair, pickSentence } from "../selection";

import type { WordStats } from "../../context/auth";
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
  userWords: Record<string, WordStats> = {},
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

  const isWordUnderExposed = (e: WordEntry) =>
    (userWords[wordKey(e.lu, e.en)]?.shown ?? 0) < MIN_ANSWERS;

  // Under-exposure is measured on the phrase's combined shown count (both
  // directions summed — a sentence is one element). The under-exposed pool is a
  // synthetic lesson containing ONLY the under-exposed sentences — not the whole
  // lesson. Prevents the bucket from spending 70%+ of its weight on already-shown
  // sentences when only a few stragglers remain.
  const underExposedSentences = currentLesson.sentences.filter(
    (s) =>
      s.enVariants[0] !== undefined &&
      combinedPhraseStats(userWords, s.enVariants[0]).shown < MIN_ANSWERS,
  );

  const wordPools = {
    "under-exposed": currentLesson.entries.filter(isWordUnderExposed),
    current: currentLesson.entries,
    previous: previousLessons.flatMap((l) => l.entries),
  };

  const sentencePools = {
    "under-exposed": underExposedSentences.length > 0
      ? [{ ...currentLesson, sentences: underExposedSentences }]
      : [],
    current: [currentLesson],
    previous: previousLessons,
  };

  // Lesson vocab used as distractor fallback for sentence-builder
  const lessonVocab = [...new Set(
    currentLesson.entries.flatMap((e) => tokenizeSentence(e.lu, "lu")),
  )];

  // Shared set tracking sentence keys already used in this session plan.
  // buildSlot mutates it so no sentence is repeated until the pool is exhausted.
  const usedSentenceKeys = new Set<string>();
  const queue = Array.from(
    { length: LESSON_TOTAL_SLOTS },
    () => buildSlot(wordPools, sentencePools, lessonVocab, rng, usedSentenceKeys),
  ).filter((slot): slot is Exercise => slot !== null);

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

type WordBucketName = (typeof LESSON_WORD_MATCH_BUCKETS)[number]["name"];
type SentenceBucketName = (typeof LESSON_SENTENCE_LESSON_BUCKETS)[number]["name"];

// Picks up to `count` unique word pairs (deduplicated by wordKey).
// Generates count*4 candidates via with-replacement draws, then keeps the first
// `count` distinct ones. Returns fewer than `count` only when the pool itself
// has fewer unique words.
const pickUniquePairs = (
  pools: Record<WordBucketName, ReadonlyArray<WordEntry>>,
  count: number,
  rng: () => number,
): WordEntry[] => {
  const seen = new Set<string>();
  return Array.from({ length: count * 4 }, () =>
    pickPair(pools, LESSON_WORD_MATCH_BUCKETS, rng),
  )
    .filter((p): p is WordEntry => p !== undefined)
    .reduce<WordEntry[]>((acc, entry) => {
      if (acc.length >= count) return acc;
      const k = wordKey(entry.lu, entry.en);
      if (seen.has(k)) return acc;
      seen.add(k);
      return [...acc, entry];
    }, []);
};

const buildSlot = (
  wordPools: Record<WordBucketName, ReadonlyArray<WordEntry>>,
  sentencePools: Record<SentenceBucketName, ReadonlyArray<Lesson>>,
  lessonVocab: string[],
  rng: () => number,
  usedSentenceKeys: Set<string>,
): Exercise | null => {
  for (let attempt = 0; attempt < 10; attempt++) {
    const slotType = bucketedPick(rng(), SLOT_TYPE_DISTRIBUTION);

    if (slotType === "sentence-builder") {
      const picked = pickSentence(sentencePools, LESSON_SENTENCE_LESSON_BUCKETS, rng);
      if (!picked) continue; // no sentences in pool → re-roll
      const key = picked.sentence.enVariants[0] ?? ""; // sentence identity (direction-agnostic)
      if (usedSentenceKeys.has(key)) continue; // already used this session → try again
      usedSentenceKeys.add(key);
      const direction = bucketedPick(rng(), LESSON_SENTENCE_DIRECTION_BUCKETS);
      return buildSentenceExercise(picked.sentence, direction, lessonVocab);
    }

    // word-match: pick LESSON_WORD_MATCH_PAIR_COUNT unique pairs
    const pairs = pickUniquePairs(wordPools, LESSON_WORD_MATCH_PAIR_COUNT, rng);
    if (pairs.length > 0) return buildWordMatchExercise(pairs);
  }

  // Retries exhausted — most likely sentence-builder kept rolling but all session
  // sentences are already used. Accept a sentence repeat rather than skip the slot.
  const fallback = pickSentence(sentencePools, LESSON_SENTENCE_LESSON_BUCKETS, rng);
  if (fallback) {
    usedSentenceKeys.add(fallback.sentence.enVariants[0] ?? "");
    const direction = bucketedPick(rng(), LESSON_SENTENCE_DIRECTION_BUCKETS);
    return buildSentenceExercise(fallback.sentence, direction, lessonVocab);
  }
  // No sentences at all in pool → fall back to word-match
  const fallbackPairs = pickUniquePairs(wordPools, LESSON_WORD_MATCH_PAIR_COUNT, rng);
  return fallbackPairs.length > 0 ? buildWordMatchExercise(fallbackPairs) : null;
};
