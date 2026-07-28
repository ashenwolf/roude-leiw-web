// Layer 4 — Exam Mode planner.
//
// The only thing this Mode decides is COVERAGE and ORDER: take one SubLesson's
// content, schedule every Element exactly once, shuffle. It owns no exercise
// construction rules — slot building comes from the shared Layer 1 bricks
// (`chunkIntoWordMatchExercises`, `buildSentenceExercise`), which is why
// @question handling, tokenization, and distractor rules behave identically
// here and in Lesson Mode.
// See CLAUDE.md > Architecture Reference > Mode specs > Exam.

import { shuffle } from "../../lib/shuffle";
import { BLOCK_COUNT, EXAM, LESSON } from "../constants";
import {
  buildSentenceExercise,
  chunkIntoWordMatchExercises,
  tokenizeSentence,
} from "../exercise-builders";
import { bucketedPick } from "../selection";

import type { Lesson } from "../letz-parser";
import type { ModeConfig } from "../mode-config";
import type { Exercise } from "../types";

/** Block boundaries: BLOCK_COUNT near-equal cuts, deduplicated for tiny queues. */
const examBlockBoundaries = (slotCount: number): number[] =>
  [...new Set(
    Array.from({ length: BLOCK_COUNT }, (_, i) => Math.ceil((slotCount * (i + 1)) / BLOCK_COUNT)),
  )].filter((boundary) => boundary > 0);

/**
 * Plans an Exam Session over a single SubLesson.
 * Deterministic given `rng`: all Elements once, slot order shuffled.
 */
export const planExamMode = (
  subLesson: Lesson,
  rng: () => number = Math.random,
): ModeConfig => {
  const lessonVocab = [...new Set(
    subLesson.entries.flatMap((entry) => tokenizeSentence(entry.lu, "lu")),
  )];

  const wordSlots = chunkIntoWordMatchExercises(shuffle(subLesson.entries, rng), EXAM.wordMatch);

  // Direction is rolled uniformly; buildSentenceExercise forces en→lu for
  // @question sentences, so the rule lives in one place for every Mode.
  const sentenceSlots = subLesson.sentences
    .filter((sentence) => sentence.enVariants.length > 0 && sentence.luVariants.length > 0)
    .map((sentence) =>
      buildSentenceExercise(sentence, bucketedPick(rng(), LESSON.buckets.direction), lessonVocab),
    );

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
