// Layer 4 — Lesson Mode planner.
// Reads lessons + stats, emits a complete ModeConfig with every Slot pre-built.
// See CLAUDE.md > Architecture Reference > Mode specs > Lesson.

import { LESSON, MASTERY_CORRECT_COUNT } from "../constants";
import { buildSentenceExercise, buildWordMatchExercise, tokenizeSentence } from "../exercise-builders";
import { combinedPhraseStats, wordKey } from "../progression";
import { bucketedPick, pickPair, pickSentence } from "../selection";

import type { WordStats } from "../../context/auth";
import type { Lesson, SentenceEntry, WordEntry } from "../letz-parser";
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

  const budget = makeSentenceBudget(notYetMasteredSentences);

  const queue = Array.from(
    { length: LESSON.totalSlots },
    () => buildSlot(wordPools, sentencePools, slotTypeDistribution, lessonVocab, rng, budget),
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

/** Per-Session scheduling budget for sentences (see `makeSentenceBudget`). */
type SentenceBudget = {
  /** Times each sentence identity has already been scheduled this Session. */
  readonly uses: Map<string, number>;
  /** Sentence identities in the current lesson still below the mastery gate. */
  readonly notYetMastered: ReadonlySet<string>;
  /** Schedulings allowed per not-yet-mastered sentence. 1 = strict dedup. */
  readonly repeatAllowance: number;
};

/**
 * How often a sentence may be scheduled within one Session.
 *
 * A sentence earns at most +1 `correct` per appearance, so a flat
 * once-per-Session cap put a hard floor of MASTERY_CORRECT_COUNT Sessions under
 * any lesson whose remaining backlog is sentences: the lesson percentage could
 * not move at all until the third Session, and — because the not-yet-mastered
 * bucket is probabilistic — usually not until the fourth or fifth. Words never
 * had that floor (a straggler word can be drawn by several word-match Slots in
 * one Session and clear the gate immediately), which is why a lesson climbs
 * smoothly to ~98% and then looks frozen: what survives into the tail is
 * disproportionately sentences.
 *
 * So a not-yet-mastered sentence gets MASTERY_CORRECT_COUNT schedulings —
 * enough to clear the gate in one clean Session, matching words.
 *
 * Repeats unlock only when the remaining backlog is too small to fill a Session
 * with distinct sentences. Above that threshold there is ample variety, several
 * sentences cross the gate every Session so the percentage moves on its own, and
 * strict dedup (the 2026-06-03 variety guarantee) still holds. Already-mastered
 * sentences are always capped at one appearance: repeating them buys no progress.
 */
const makeSentenceBudget = (
  notYetMasteredSentences: ReadonlyArray<SentenceEntry>,
): SentenceBudget => ({
  uses: new Map<string, number>(),
  notYetMastered: new Set(notYetMasteredSentences.map(sentenceIdentity)),
  repeatAllowance:
    notYetMasteredSentences.length > 0 && notYetMasteredSentences.length < LESSON.totalSlots
      ? MASTERY_CORRECT_COUNT
      : 1,
});

/** Direction-agnostic identity of a sentence within a Session plan. */
const sentenceIdentity = (s: SentenceEntry): string => s.enVariants[0] ?? "";

/**
 * Records one scheduling of `key` if the budget allows, and reports whether it
 * did. Mutates `budget.uses` — the budget is shared across all Slots of a Session.
 */
const claimSentence = (budget: SentenceBudget, key: string): boolean => {
  const allowed = budget.notYetMastered.has(key) ? budget.repeatAllowance : 1;
  const used = budget.uses.get(key) ?? 0;
  if (used >= allowed) return false;
  budget.uses.set(key, used + 1);
  return true;
};

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
  budget: SentenceBudget,
): Exercise | null => {
  for (let attempt = 0; attempt < 10; attempt++) {
    const slotType = bucketedPick(rng(), slotTypeDistribution);

    if (slotType === "sentence-builder") {
      const picked = pickSentence(sentencePools, LESSON.buckets.sentenceLesson, rng);
      if (!picked) continue; // no sentences in pool → re-roll
      // Out of budget for this sentence (see makeSentenceBudget) → try again.
      if (!claimSentence(budget, sentenceIdentity(picked.sentence))) continue;
      const direction = bucketedPick(rng(), LESSON.buckets.direction);
      return buildSentenceExercise(picked.sentence, direction, lessonVocab);
    }

    // word-match: pick LESSON.wordMatchPairs unique pairs
    const pairs = pickUniquePairs(wordPools, LESSON.wordMatchPairs, rng);
    if (pairs.length > 0) return buildWordMatchExercise(pairs);
  }

  // Retries exhausted — most likely sentence-builder kept rolling but every
  // session sentence is out of budget. Accept a repeat rather than skip the slot.
  const fallback = pickSentence(sentencePools, LESSON.buckets.sentenceLesson, rng);
  if (fallback) {
    const key = sentenceIdentity(fallback.sentence);
    budget.uses.set(key, (budget.uses.get(key) ?? 0) + 1);
    const direction = bucketedPick(rng(), LESSON.buckets.direction);
    return buildSentenceExercise(fallback.sentence, direction, lessonVocab);
  }
  // No sentences at all in pool → fall back to word-match
  const fallbackPairs = pickUniquePairs(wordPools, LESSON.wordMatchPairs, rng);
  return fallbackPairs.length > 0 ? buildWordMatchExercise(fallbackPairs) : null;
};
