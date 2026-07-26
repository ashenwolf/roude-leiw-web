// Layer 4 — Exam Mode planner.
// One sub-lesson's content, deterministic exercise set, shuffled order — no
// selection buckets, no stats input ("we only shuffle it"). Every element of
// the sub-lesson appears exactly once per Session.
// See CLAUDE.md > Architecture Reference > Mode specs > Exam.

import { shuffle } from "../../lib/shuffle";
import {
  BLOCK_COUNT,
  EXAM_WORD_MATCH_MIN_CHUNK,
  EXAM_WORD_MATCH_PAIR_COUNT,
  LESSON_SENTENCE_DIRECTION_BUCKETS,
} from "../constants";
import { buildSentenceExercise, buildWordMatchExercise, tokenizeSentence } from "../exercise-builders";
import { bucketedPick } from "../selection";

import type { Lesson, SentenceEntry, WordEntry } from "../letz-parser";
import type { ModeConfig } from "../mode-config";
import type { Exercise } from "../types";

/**
 * Chunks shuffled vocabulary into WordMatch slots of EXAM_WORD_MATCH_PAIR_COUNT
 * pairs; a trailing chunk below EXAM_WORD_MATCH_MIN_CHUNK merges into the
 * previous slot instead of forming a degenerate slot.
 */
const chunkEntries = (entries: ReadonlyArray<WordEntry>): WordEntry[][] => {
  const chunks = Array.from(
    { length: Math.ceil(entries.length / EXAM_WORD_MATCH_PAIR_COUNT) },
    (_, i) => entries.slice(i * EXAM_WORD_MATCH_PAIR_COUNT, (i + 1) * EXAM_WORD_MATCH_PAIR_COUNT),
  );
  const last = chunks[chunks.length - 1];
  const shouldMerge = chunks.length > 1 && last.length < EXAM_WORD_MATCH_MIN_CHUNK;
  return shouldMerge
    ? [...chunks.slice(0, -2), [...chunks[chunks.length - 2], ...last]]
    : chunks;
};

/** `@question` sentences are always answered in Luxembourgish (en→lu assembly). */
const sentenceDirection = (sentence: SentenceEntry, rng: () => number): "en-lu" | "lu-en" =>
  sentence.question !== undefined
    ? "en-lu"
    : bucketedPick(rng(), LESSON_SENTENCE_DIRECTION_BUCKETS);

/** Block boundaries: BLOCK_COUNT near-equal cuts, deduplicated for tiny queues. */
const examBlockBoundaries = (slotCount: number): number[] =>
  [...new Set(
    Array.from({ length: BLOCK_COUNT }, (_, i) =>
      Math.ceil((slotCount * (i + 1)) / BLOCK_COUNT),
    ),
  )].filter((b) => b > 0);

/**
 * Plans an Exam Session over a single sub-lesson.
 * Deterministic given `rng`: all elements once, slot order shuffled.
 */
export const planExamMode = (
  subLesson: Lesson,
  rng: () => number = Math.random,
): ModeConfig => {
  const lessonVocab = [...new Set(
    subLesson.entries.flatMap((e) => tokenizeSentence(e.lu, "lu")),
  )];

  const wordSlots = chunkEntries(shuffle(subLesson.entries, rng))
    .filter((chunk) => chunk.length > 0)
    .map(buildWordMatchExercise);

  const sentenceSlots = subLesson.sentences
    .filter((s) => s.enVariants.length > 0 && s.luVariants.length > 0)
    .map((s) => buildSentenceExercise(s, sentenceDirection(s, rng), lessonVocab));

  const queue: Exercise[] = shuffle([...wordSlots, ...sentenceSlots], rng);

  return {
    lessons: [subLesson],
    queue,
    plannedSlots: queue.length,
    currentLessonId: subLesson.meta.id,
    blockBoundaries: examBlockBoundaries(queue.length),
    hasCorrectionBlock: true,
    completionEffect: "noop",
  };
};
