import { shuffle } from "../lib/shuffle";

import type { WordStats } from "../context/auth";
import type { Lesson, WordEntry } from "./letz-parser";
import { classifyWord, wordKey, type WordMastery } from "./progression";

// --- Types ---

export type WordBucket = "new" | "struggling" | "reinforcing" | "reviewing";

/** A candidate item with its lesson context and a stable progress key. */
export type CandidateItem<T> = {
  item: T;
  lessonId: string;
  key: string;
};

/** A selected item with its assigned bucket (for diagnostics / debug). */
export type SelectedItem<T> = {
  item: T;
  lessonId: string;
  bucket: WordBucket;
};

export type ItemSelectionConfig = {
  batchSize: number;
  bucketRatios: Record<WordBucket, number>;
};

// --- Defaults ---

const DEFAULT_CONFIG: ItemSelectionConfig = {
  batchSize: 20,
  bucketRatios: {
    new: 0.25,
    struggling: 0.25,
    reinforcing: 0.25,
    reviewing: 0.25,
  },
};

// Overflow priority: when a bucket can't fill its quota, distribute to these in order
const OVERFLOW_PRIORITY: ReadonlyArray<WordBucket> = ["struggling", "reinforcing", "reviewing", "new"];

// --- Internal ---

type TaggedItem<T> = CandidateItem<T> & {
  mastery: WordMastery;
  stats: WordStats | undefined;
};

// Only stats fields matter for comparators — keeps them type-agnostic
type WithStats = { stats: WordStats | undefined };

const accuracy = (s: WordStats): number =>
  s.correct + s.incorrect > 0 ? s.correct / (s.correct + s.incorrect) : 0;

const MASTERY_TO_BUCKET: Record<WordMastery, WordBucket | "context"> = {
  unseen: "new",
  struggling: "struggling",
  learning: "reinforcing",
  mastered: "context",
};

const toBucket = (mastery: WordMastery, lessonId: string, currentLessonId: string): WordBucket => {
  const mapped = MASTERY_TO_BUCKET[mastery];
  return mapped === "context"
    ? (lessonId === currentLessonId ? "reinforcing" : "reviewing")
    : mapped;
};

const EMPTY_STATS: WordStats = { shown: 0, correct: 0, incorrect: 0 };

const bucketComparators: Record<WordBucket, (a: WithStats, b: WithStats) => number> = {
  new: () => 0,
  struggling: (a, b) => accuracy(a.stats ?? EMPTY_STATS) - accuracy(b.stats ?? EMPTY_STATS),
  reinforcing: (a, b) => (a.stats?.shown ?? 0) - (b.stats?.shown ?? 0),
  reviewing: (a, b) => (a.stats?.shown ?? 0) - (b.stats?.shown ?? 0),
};

// --- Lesson adapter ---

/** Convert unlocked lessons to generic candidates for the selector. */
export const lessonsToCandidates = (
  lessons: Lesson[],
  unlockedLessonIds: ReadonlyArray<string>,
): CandidateItem<WordEntry>[] =>
  lessons
    .filter((l) => unlockedLessonIds.includes(l.meta.id))
    .flatMap((lesson) =>
      lesson.entries.map((entry) => ({
        item: entry,
        lessonId: lesson.meta.id,
        key: wordKey(entry.lu, entry.en),
      })),
    );

// --- Main Selection ---

/**
 * Select a batch of items using spaced-repetition bucket logic.
 * Works with any item type T — the caller supplies candidates with stable keys.
 */
export const selectItemsForBatch = <T>(
  candidates: CandidateItem<T>[],
  userWords: Record<string, WordStats>,
  currentLessonId: string,
  excludeKeys: ReadonlySet<string> = new Set(),
  config: ItemSelectionConfig = DEFAULT_CONFIG,
): SelectedItem<T>[] => {
  const tagged: TaggedItem<T>[] = candidates
    .filter((c) => !excludeKeys.has(c.key))
    .map((c) => {
      const stats = userWords[c.key];
      return { ...c, mastery: classifyWord(stats), stats };
    });

  const buckets: Record<WordBucket, TaggedItem<T>[]> = {
    new: tagged.filter((t) => toBucket(t.mastery, t.lessonId, currentLessonId) === "new").sort(bucketComparators.new),
    struggling: tagged.filter((t) => toBucket(t.mastery, t.lessonId, currentLessonId) === "struggling").sort(bucketComparators.struggling),
    reinforcing: tagged.filter((t) => toBucket(t.mastery, t.lessonId, currentLessonId) === "reinforcing").sort(bucketComparators.reinforcing),
    reviewing: tagged.filter((t) => toBucket(t.mastery, t.lessonId, currentLessonId) === "reviewing").sort(bucketComparators.reviewing),
  };

  const targetCounts: Record<WordBucket, number> = {
    new: Math.round(config.batchSize * config.bucketRatios.new),
    struggling: Math.round(config.batchSize * config.bucketRatios.struggling),
    reinforcing: Math.round(config.batchSize * config.bucketRatios.reinforcing),
    reviewing: Math.round(config.batchSize * config.bucketRatios.reviewing),
  };

  const taken: Record<WordBucket, TaggedItem<T>[]> = {
    new: buckets.new.slice(0, targetCounts.new),
    struggling: buckets.struggling.slice(0, targetCounts.struggling),
    reinforcing: buckets.reinforcing.slice(0, targetCounts.reinforcing),
    reviewing: buckets.reviewing.slice(0, targetCounts.reviewing),
  };

  const totalTaken = Object.values(taken).reduce((sum, arr) => sum + arr.length, 0);
  const remaining = config.batchSize - totalTaken;

  const usedKeys = new Set(
    Object.values(taken).flatMap((arr) => arr.map((t) => t.key)),
  );

  const overflowResult = remaining > 0
    ? OVERFLOW_PRIORITY.reduce<{ filled: TaggedItem<T>[]; slotsLeft: number; used: ReadonlySet<string> }>(
        ({ filled, slotsLeft, used }, bucket) => {
          if (slotsLeft <= 0) return { filled, slotsLeft, used };
          const available = buckets[bucket]
            .filter((t) => !used.has(t.key))
            .slice(0, slotsLeft);
          const newUsed = new Set([...used, ...available.map((t) => t.key)]);
          return { filled: [...filled, ...available], slotsLeft: slotsLeft - available.length, used: newUsed };
        },
        { filled: [], slotsLeft: remaining, used: usedKeys },
      )
    : { filled: [] as TaggedItem<T>[], slotsLeft: 0, used: usedKeys };

  const allSelected = [
    ...Object.values(taken).flat(),
    ...overflowResult.filled,
  ];

  return shuffle(allSelected).map((t) => ({
    item: t.item,
    lessonId: t.lessonId,
    bucket: toBucket(t.mastery, t.lessonId, currentLessonId),
  }));
};
