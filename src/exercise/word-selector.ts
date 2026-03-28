import type { WordStats } from "../context/auth";
import type { Lesson, WordEntry } from "./letz-parser";
import { classifyWord, wordKey, type WordMastery } from "./progression";

// --- Types ---

export type WordBucket = "new" | "struggling" | "reinforcing" | "reviewing";

export type SelectedWord = {
  entry: WordEntry;
  lessonId: string;
  bucket: WordBucket;
};

export type WordSelectionConfig = {
  batchSize: number;
  bucketRatios: Record<WordBucket, number>;
};

// --- Defaults ---

const DEFAULT_CONFIG: WordSelectionConfig = {
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

// --- Helpers ---

type TaggedEntry = {
  entry: WordEntry;
  lessonId: string;
  mastery: WordMastery;
  stats: WordStats | undefined;
};

const tagEntries = (
  lessons: Lesson[],
  lessonIds: ReadonlyArray<string>,
  userWords: Record<string, WordStats>,
): TaggedEntry[] =>
  lessons
    .filter((l) => lessonIds.includes(l.meta.id))
    .flatMap((lesson) =>
      lesson.entries.map((entry) => {
        const key = wordKey(entry.lu, entry.en);
        const stats = userWords[key];
        return { entry, lessonId: lesson.meta.id, mastery: classifyWord(stats), stats };
      }),
    );

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

const bucketComparators: Record<WordBucket, (a: TaggedEntry, b: TaggedEntry) => number> = {
  new: () => 0,
  struggling: (a, b) => accuracy(a.stats ?? EMPTY_STATS) - accuracy(b.stats ?? EMPTY_STATS),
  reinforcing: (a, b) => (a.stats?.shown ?? 0) - (b.stats?.shown ?? 0),
  reviewing: (a, b) => (a.stats?.shown ?? 0) - (b.stats?.shown ?? 0),
};

const shuffle = <T>(arr: ReadonlyArray<T>): T[] =>
  arr
    .map((value) => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value);

// --- Main Selection ---

export const selectWordsForBatch = (
  allLessons: Lesson[],
  unlockedLessonIds: ReadonlyArray<string>,
  currentLessonId: string,
  userWords: Record<string, WordStats>,
  excludeKeys: ReadonlySet<string> = new Set(),
  config: WordSelectionConfig = DEFAULT_CONFIG,
): SelectedWord[] => {
  const tagged = tagEntries(allLessons, unlockedLessonIds, userWords)
    .filter((t) => !excludeKeys.has(wordKey(t.entry.lu, t.entry.en)));

  // Group by bucket
  const buckets: Record<WordBucket, TaggedEntry[]> = {
    new: tagged
      .filter((t) => toBucket(t.mastery, t.lessonId, currentLessonId) === "new")
      .sort(bucketComparators.new),
    struggling: tagged
      .filter((t) => toBucket(t.mastery, t.lessonId, currentLessonId) === "struggling")
      .sort(bucketComparators.struggling),
    reinforcing: tagged
      .filter((t) => toBucket(t.mastery, t.lessonId, currentLessonId) === "reinforcing")
      .sort(bucketComparators.reinforcing),
    reviewing: tagged
      .filter((t) => toBucket(t.mastery, t.lessonId, currentLessonId) === "reviewing")
      .sort(bucketComparators.reviewing),
  };

  // Calculate target counts per bucket
  const targetCounts: Record<WordBucket, number> = {
    new: Math.round(config.batchSize * config.bucketRatios.new),
    struggling: Math.round(config.batchSize * config.bucketRatios.struggling),
    reinforcing: Math.round(config.batchSize * config.bucketRatios.reinforcing),
    reviewing: Math.round(config.batchSize * config.bucketRatios.reviewing),
  };

  // First pass: take what each bucket can fill
  const taken: Record<WordBucket, TaggedEntry[]> = {
    new: buckets.new.slice(0, targetCounts.new),
    struggling: buckets.struggling.slice(0, targetCounts.struggling),
    reinforcing: buckets.reinforcing.slice(0, targetCounts.reinforcing),
    reviewing: buckets.reviewing.slice(0, targetCounts.reviewing),
  };

  // Calculate overflow (unfilled slots)
  const totalTaken = Object.values(taken).reduce((sum, arr) => sum + arr.length, 0);
  const remaining = config.batchSize - totalTaken;

  // Distribute overflow using priority order
  const usedKeys = new Set(
    Object.values(taken).flatMap((arr) => arr.map((t) => wordKey(t.entry.lu, t.entry.en))),
  );

  const overflowResult = remaining > 0
    ? OVERFLOW_PRIORITY.reduce<{ filled: TaggedEntry[]; slotsLeft: number; used: ReadonlySet<string> }>(
        ({ filled, slotsLeft, used }, bucket) => {
          if (slotsLeft <= 0) return { filled, slotsLeft, used };
          const available = buckets[bucket]
            .filter((t) => !used.has(wordKey(t.entry.lu, t.entry.en)))
            .slice(0, slotsLeft);
          const newUsed = new Set([...used, ...available.map((t) => wordKey(t.entry.lu, t.entry.en))]);
          return { filled: [...filled, ...available], slotsLeft: slotsLeft - available.length, used: newUsed };
        },
        { filled: [], slotsLeft: remaining, used: usedKeys },
      )
    : { filled: [] as TaggedEntry[], slotsLeft: 0, used: usedKeys };

  // Combine all selected entries and shuffle
  const allSelected = [
    ...Object.values(taken).flat(),
    ...overflowResult.filled,
  ];

  return shuffle(allSelected).map((t) => ({
    entry: t.entry,
    lessonId: t.lessonId,
    bucket: toBucket(t.mastery, t.lessonId, currentLessonId),
  }));
};
