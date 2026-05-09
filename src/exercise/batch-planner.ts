import { entriesToWordPairs } from "./letz-parser";
import { computeUnlockedLessonIds, findCurrentLessonId } from "./progression";
import { lessonsToCandidates, selectItemsForBatch } from "./word-selector";

import type { WordStats } from "../context/auth";
import type { Lesson } from "./letz-parser";
import type { ExerciseBatch, WordMatchBatch } from "./types";
import type { ItemSelectionConfig } from "./word-selector";

export type PlanBatchesOptions = {
  batchSize: number;
  batchCount: number;
};

export type BatchPlan = {
  batches: ExerciseBatch[];
  currentLessonId: string;
};

const buildWordMatchBatch = (
  lessons: Lesson[],
  unlockedIds: ReadonlyArray<string>,
  currentLessonId: string,
  userWords: Record<string, WordStats>,
  config: ItemSelectionConfig,
): WordMatchBatch => {
  const candidates = lessonsToCandidates(lessons, unlockedIds);
  const selected = selectItemsForBatch(candidates, userWords, currentLessonId, new Set(), config);
  return {
    type: "word-match",
    pairs: entriesToWordPairs(selected.map((s) => s.item)),
  };
};

const configForBatch = (batchIdx: number, batchCount: number, batchSize: number): ItemSelectionConfig =>
  batchIdx === batchCount - 1
    ? { batchSize, bucketRatios: { new: 0.15, struggling: 0.25, reinforcing: 0.30, reviewing: 0.30 } }
    : { batchSize, bucketRatios: { new: 0.25, struggling: 0.25, reinforcing: 0.25, reviewing: 0.25 } };

export const planBatches = (
  lessons: Lesson[],
  userWords: Record<string, WordStats>,
  targetLessonId: string | undefined,
  { batchSize, batchCount }: PlanBatchesOptions,
): BatchPlan => {
  if (lessons.length === 0) return { batches: [], currentLessonId: "" };

  const unlockedIds = computeUnlockedLessonIds(lessons, userWords);
  const currentLessonId = targetLessonId ?? findCurrentLessonId(lessons, userWords);

  const batches = Array.from({ length: batchCount }).map((_, idx) =>
    buildWordMatchBatch(lessons, unlockedIds, currentLessonId, userWords, configForBatch(idx, batchCount, batchSize)),
  );

  return { batches, currentLessonId };
};
