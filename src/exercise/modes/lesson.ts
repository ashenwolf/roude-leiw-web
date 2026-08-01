// Layer 4 — Lesson Mode planner.
// Reads lessons + stats, emits a complete ModeConfig with every Slot pre-built.
// See CLAUDE.md > Architecture Reference > Mode specs > Lesson.

import { LESSON, MASTERY_CORRECT_COUNT } from "../constants";
import { buildSentenceExercise, buildWordMatchExercise, tokenizeSentence } from "../exercise-builders";
import { combinedPhraseStats, wordKey } from "../progression";
import { bucketedPick, pickPair, pickSentence } from "../selection";

import type { WordStats } from "../../context/auth";
import type { Lesson, WordEntry } from "../letz-parser";
import type { ModeConfig } from "../mode-config";
import type { Exercise } from "../types";
import type { Bucket } from "../selection";

type SlotType = "word-match" | "sentence-builder";

/**
 * Adaptive slot-type distribution for Lesson Mode.
 *
 * The word-match share scales with how word-heavy the current lesson's remaining
 * backlog is, clamped to [MIN, MAX]. When there is no backlog at all (everything
 * mastered) the share falls back to MIN — the historical fixed split. Returns a
 * bucket table in the same shape as FIX_ERRORS.buckets.slotType so it drops straight
 * into `bucketedPick`.
 */
export const lessonSlotTypeDistribution = (
  unmasteredWords: number,
  unmasteredSentences: number,
): ReadonlyArray<Bucket<SlotType>> => {
  const backlog = unmasteredWords + unmasteredSentences;
  const raw = backlog > 0 ? unmasteredWords / backlog : LESSON.wordMatchShare.min;
  const share = Math.min(
    LESSON.wordMatchShare.max,
    Math.max(LESSON.wordMatchShare.min, raw),
  );
  return [
    { name: "word-match", upTo: share },
    { name: "sentence-builder", upTo: 1.0 },
  ];
};

const BLOCK_BOUNDARIES = [
  LESSON.slotsPerBlock,
  2 * LESSON.slotsPerBlock,
  3 * LESSON.slotsPerBlock,
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
      plannedSlots: LESSON.totalSlots,
      currentLessonId: "",
      blockBoundaries: BLOCK_BOUNDARIES,
      hasCorrectionBlock: true,
      completionEffect: "unlock-check",
    };
  }

  const currentLesson = pool[pool.length - 1];
  const previousLessons = pool.slice(0, -1);

  // "Not yet mastered" is measured against the unlock gate itself
  // (`correct < MASTERY_CORRECT_COUNT`), NOT `shown`. This is the load-bearing
  // fix for stragglers: a word shown 10× but only correct twice is unmastered,
  // holds the lesson below the unlock gate, and — under the old
  // `shown < MIN_ANSWERS` rule — had dropped out of every priority bucket. Keying
  // off `correct` keeps such stragglers in the bias pool until they actually pass
  // the gate. Load-bearing now that the gate is 100% of Elements: a single
  // straggler the planner can't reach would stall the lesson forever.
  const isWordNotYetMastered = (e: WordEntry) =>
    (userWords[wordKey(e.lu, e.en)]?.correct ?? 0) < MASTERY_CORRECT_COUNT;

  // The not-yet-mastered pool is a synthetic lesson containing ONLY the
  // unmastered sentences — not the whole lesson. Prevents the bucket from
  // spending its weight on already-mastered sentences when only a few
  // stragglers remain. Combined `correct` (both directions summed — a sentence
  // is one element) is compared against the same gate.
  const notYetMasteredSentences = currentLesson.sentences.filter(
    (s) =>
      s.enVariants[0] !== undefined &&
      combinedPhraseStats(userWords, s.enVariants[0]).correct < MASTERY_CORRECT_COUNT,
  );

  const unmasteredWords = currentLesson.entries.filter(isWordNotYetMastered);

  // Adaptive slot-type split: the more word-heavy the current lesson's backlog,
  // the more word-match slots this session schedules (clamped to [MIN, MAX]).
  // Counts are the current-lesson unmastered elements only — previous-lesson
  // review is incidental, not what the unlock gate is waiting on.
  const slotTypeDistribution = lessonSlotTypeDistribution(
    unmasteredWords.length,
    notYetMasteredSentences.length,
  );

  const wordPools = {
    "not-yet-mastered": unmasteredWords,
    current: currentLesson.entries,
    previous: previousLessons.flatMap((l) => l.entries),
  };

  const sentencePools = {
    "not-yet-mastered": notYetMasteredSentences.length > 0
      ? [{ ...currentLesson, sentences: notYetMasteredSentences }]
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
    { length: LESSON.totalSlots },
    () => buildSlot(wordPools, sentencePools, slotTypeDistribution, lessonVocab, rng, usedSentenceKeys),
  ).filter((slot): slot is Exercise => slot !== null);

  return {
    lessons,
    queue,
    plannedSlots: LESSON.totalSlots,
    currentLessonId: currentLesson.meta.id,
    blockBoundaries: BLOCK_BOUNDARIES,
    hasCorrectionBlock: true,
    completionEffect: "unlock-check",
  };
};

// ─── Internal ─────────────────────────────────────────────────────────────────

type WordBucketName = (typeof LESSON.buckets.wordMatch)[number]["name"];
type SentenceBucketName = (typeof LESSON.buckets.sentenceLesson)[number]["name"];

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
    pickPair(pools, LESSON.buckets.wordMatch, rng),
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
  slotTypeDistribution: ReadonlyArray<Bucket<SlotType>>,
  lessonVocab: string[],
  rng: () => number,
  usedSentenceKeys: Set<string>,
): Exercise | null => {
  for (let attempt = 0; attempt < 10; attempt++) {
    const slotType = bucketedPick(rng(), slotTypeDistribution);

    if (slotType === "sentence-builder") {
      const picked = pickSentence(sentencePools, LESSON.buckets.sentenceLesson, rng);
      if (!picked) continue; // no sentences in pool → re-roll
      const key = picked.sentence.enVariants[0] ?? ""; // sentence identity (direction-agnostic)
      if (usedSentenceKeys.has(key)) continue; // already used this session → try again
      usedSentenceKeys.add(key);
      const direction = bucketedPick(rng(), LESSON.buckets.direction);
      return buildSentenceExercise(picked.sentence, direction, lessonVocab);
    }

    // word-match: pick LESSON.wordMatchPairs unique pairs
    const pairs = pickUniquePairs(wordPools, LESSON.wordMatchPairs, rng);
    if (pairs.length > 0) return buildWordMatchExercise(pairs);
  }

  // Retries exhausted — most likely sentence-builder kept rolling but all session
  // sentences are already used. Accept a sentence repeat rather than skip the slot.
  const fallback = pickSentence(sentencePools, LESSON.buckets.sentenceLesson, rng);
  if (fallback) {
    usedSentenceKeys.add(fallback.sentence.enVariants[0] ?? "");
    const direction = bucketedPick(rng(), LESSON.buckets.direction);
    return buildSentenceExercise(fallback.sentence, direction, lessonVocab);
  }
  // No sentences at all in pool → fall back to word-match
  const fallbackPairs = pickUniquePairs(wordPools, LESSON.wordMatchPairs, rng);
  return fallbackPairs.length > 0 ? buildWordMatchExercise(fallbackPairs) : null;
};
