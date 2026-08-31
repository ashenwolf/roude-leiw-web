// Layer 4 — Lesson Mode planner.
// Reads lessons + stats, emits a complete ModeConfig with every Slot pre-built.
// See .claude/reference/mode-specs.md > Mode specs > Lesson.

import { LESSON, MASTERY_CORRECT_COUNT } from "../constants";
import {
  buildFillExercise,
  buildSentenceExercise,
  buildWordMatchExercise,
  tokenizeSentence,
} from "../exercise-builders";
import { combinedFillStats, combinedPhraseStats, wordKey } from "../progression";
import { bucketedPick, phrasesOf, pickPair, pickPhrase } from "../selection";

import type { WordStats } from "../../context/auth";
import type { Lesson, WordEntry } from "../letz-parser";
import type { ModeConfig } from "../mode-config";
import type { Exercise } from "../types";
import type { Bucket, Phrase } from "../selection";

type SlotType = "word-match" | "phrase";

/**
 * Adaptive slot-type distribution for Lesson Mode.
 *
 * The word-match share scales with how word-heavy the current lesson's remaining
 * backlog is, clamped to [MIN, MAX]. When there is no backlog at all (everything
 * mastered) the share falls back to MIN — the historical fixed split.
 *
 * `unmasteredPhrases` counts sentences AND fills, because both compete for the
 * same Slot. Counting only sentences would over-weight word-match in a fill-heavy
 * lesson.
 */
export const lessonSlotTypeDistribution = (
  unmasteredWords: number,
  unmasteredPhrases: number,
): ReadonlyArray<Bucket<SlotType>> => {
  const backlog = unmasteredWords + unmasteredPhrases;
  const raw = backlog > 0 ? unmasteredWords / backlog : LESSON.wordMatchShare.min;
  const share = Math.min(
    LESSON.wordMatchShare.max,
    Math.max(LESSON.wordMatchShare.min, raw),
  );
  return [
    { name: "word-match", upTo: share },
    { name: "phrase", upTo: 1.0 },
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
 * passes that lesson's id (clamps the pool — see .claude/reference/mode-specs.md > Mode specs > Lesson).
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

  const notYetMasteredPhrases = phrasesOf(currentLesson).filter(
    (p) => phraseStats(userWords, p).correct < MASTERY_CORRECT_COUNT,
  );

  const unmasteredWords = currentLesson.entries.filter(isWordNotYetMastered);

  const slotTypeDistribution = lessonSlotTypeDistribution(
    unmasteredWords.length,
    notYetMasteredPhrases.length,
  );

  const wordPools = {
    "not-yet-mastered": unmasteredWords,
    current: currentLesson.entries,
    previous: previousLessons.flatMap((l) => l.entries),
  };

  const phrasePools = {
    "not-yet-mastered": notYetMasteredPhrases.length > 0
      ? [lessonOfPhrases(currentLesson, notYetMasteredPhrases)]
      : [],
    current: [currentLesson],
    previous: previousLessons,
  };

  // Lesson vocab used as distractor fallback for sentence-builder
  const lessonVocab = [...new Set(
    currentLesson.entries.flatMap((e) => tokenizeSentence(e.lu, "lu")),
  )];

  const budget = makePhraseBudget(notYetMasteredPhrases);

  const queue = Array.from(
    { length: LESSON.totalSlots },
    () => buildSlot(wordPools, phrasePools, slotTypeDistribution, lessonVocab, rng, budget),
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
type PhraseBucketName = (typeof LESSON.buckets.phraseLesson)[number]["name"];

/** The per-kind dispatch. Everything downstream is kind-agnostic. */
const phraseStats = (userWords: Record<string, WordStats>, phrase: Phrase): WordStats =>
  phrase.kind === "sentence"
    ? combinedPhraseStats(userWords, phrase.sentence.enVariants[0] ?? "")
    : combinedFillStats(userWords, phrase.fill.en);

/** Direction-agnostic identity of a phrase within a Session plan. */
const phraseIdentity = (phrase: Phrase): string =>
  phrase.kind === "sentence" ? phrase.sentence.enVariants[0] ?? "" : phrase.fill.en;

const buildPhraseExercise = (
  phrase: Phrase,
  direction: "en-lu" | "lu-en",
  lessonVocab: string[],
): Exercise =>
  phrase.kind === "sentence"
    ? buildSentenceExercise(phrase.sentence, direction, lessonVocab)
    : buildFillExercise(phrase.fill, direction);

/**
 * A synthetic single-lesson pool holding just `phrases`, so the not-yet-mastered
 * bucket reuses `pickPhrase` unchanged rather than needing a filter parameter
 * (which would break Layer-1 uniformity).
 */
const lessonOfPhrases = (lesson: Lesson, phrases: ReadonlyArray<Phrase>): Lesson => ({
  ...lesson,
  sentences: phrases.flatMap((p) => (p.kind === "sentence" ? [p.sentence] : [])),
  fills: phrases.flatMap((p) => (p.kind === "fill" ? [p.fill] : [])),
});

type PhraseBudget = {
  readonly uses: Map<string, number>;
  readonly notYetMastered: ReadonlySet<string>;
  readonly repeatAllowance: number;
};

/**
 * How often a phrase may be scheduled within one Session.
 *
 * A phrase earns at most +1 `correct` per appearance, so a flat once-per-Session
 * cap put a hard floor of MASTERY_CORRECT_COUNT Sessions under any lesson whose
 * remaining backlog is phrases. Words never had that floor (a straggler word can
 * be drawn by several word-match Slots in one Session), which is why a lesson
 * climbs to ~98% and then looks frozen.
 *
 * Repeats unlock only when the backlog is too small to fill a Session with
 * distinct phrases; above that there is ample variety and strict dedup holds.
 * Already-mastered phrases stay capped at 1 — repeating them buys no progress.
 */
const makePhraseBudget = (
  notYetMasteredPhrases: ReadonlyArray<Phrase>,
): PhraseBudget => ({
  uses: new Map<string, number>(),
  notYetMastered: new Set(notYetMasteredPhrases.map(phraseIdentity)),
  repeatAllowance:
    notYetMasteredPhrases.length > 0 && notYetMasteredPhrases.length < LESSON.totalSlots
      ? MASTERY_CORRECT_COUNT
      : 1,
});

/** Mutates `budget.uses`; the budget is shared across all Slots of a Session. */
const claimPhrase = (budget: PhraseBudget, key: string): boolean => {
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
  phrasePools: Record<PhraseBucketName, ReadonlyArray<Lesson>>,
  slotTypeDistribution: ReadonlyArray<Bucket<SlotType>>,
  lessonVocab: string[],
  rng: () => number,
  budget: PhraseBudget,
): Exercise | null => {
  for (let attempt = 0; attempt < 10; attempt++) {
    const slotType = bucketedPick(rng(), slotTypeDistribution);

    if (slotType === "phrase") {
      const picked = pickPhrase(phrasePools, LESSON.buckets.phraseLesson, rng);
      if (!picked) continue;
      if (!claimPhrase(budget, phraseIdentity(picked.phrase))) continue;
      const direction = bucketedPick(rng(), LESSON.buckets.direction);
      return buildPhraseExercise(picked.phrase, direction, lessonVocab);
    }

    const pairs = pickUniquePairs(wordPools, LESSON.wordMatchPairs, rng);
    if (pairs.length > 0) return buildWordMatchExercise(pairs);
  }

  // Retries exhausted — every session phrase is out of budget. Accept a repeat
  // rather than skip the slot.
  const fallback = pickPhrase(phrasePools, LESSON.buckets.phraseLesson, rng);
  if (fallback) {
    const key = phraseIdentity(fallback.phrase);
    budget.uses.set(key, (budget.uses.get(key) ?? 0) + 1);
    const direction = bucketedPick(rng(), LESSON.buckets.direction);
    return buildPhraseExercise(fallback.phrase, direction, lessonVocab);
  }
  // No phrases at all in pool → fall back to word-match
  const fallbackPairs = pickUniquePairs(wordPools, LESSON.wordMatchPairs, rng);
  return fallbackPairs.length > 0 ? buildWordMatchExercise(fallbackPairs) : null;
};
