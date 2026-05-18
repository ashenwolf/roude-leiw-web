// Layer 1 — Selection primitives.
// Pure functions: no React, no fetch, no KV. Mode planners (Layer 4) import from here.
// See CLAUDE.md > Architecture Reference > Encapsulation layering.

import type { Lesson, WordEntry, SentenceEntry } from "./letz-parser";

// ─── Types ───────────────────────────────────────────────────────────────────

/** A bucket definition matching the shape used in constants.ts probability tables. */
export type Bucket<Name extends string> = {
  readonly name: Name;
  readonly upTo: number; // cumulative upper bound; last bucket must be 1.0
};

// ─── Core primitive ───────────────────────────────────────────────────────────

/**
 * Returns the bucket name for a roll in [0, 1).
 * Selects the first bucket whose `upTo` is strictly greater than the roll.
 * Pure — deterministic given the same roll and buckets.
 */
export const bucketedPick = <Name extends string>(
  roll: number,
  buckets: ReadonlyArray<Bucket<Name>>,
): Name => (buckets.find((b) => roll < b.upTo) ?? buckets[buckets.length - 1]).name;

// ─── Pool selector ────────────────────────────────────────────────────────────

/**
 * Picks one item from bucket-partitioned pools.
 * - Uses `rng()` to select a bucket, then again to select within the bucket.
 * - Re-rolls when the chosen bucket is empty (up to 50 attempts).
 * - Falls back to a uniform pick across all items if retries are exhausted.
 * - Returns `undefined` only when ALL pools are empty.
 *
 * Sampling is with replacement — call multiple times for independent draws.
 */
export const pickFromPool = <K extends string, T>(
  pools: Record<K, ReadonlyArray<T>>,
  buckets: ReadonlyArray<Bucket<K>>,
  rng: () => number = Math.random,
): T | undefined => {
  const allItems = (Object.values(pools) as ReadonlyArray<T>[]).flatMap((p) => [...p]);
  if (allItems.length === 0) return undefined;

  for (let i = 0; i < 50; i++) {
    const bucket = bucketedPick(rng(), buckets);
    const candidates = pools[bucket];
    if (!candidates || candidates.length === 0) continue;
    return candidates[Math.floor(rng() * candidates.length)];
  }

  // All buckets kept coming up empty — fall back to uniform across all items.
  return allItems[Math.floor(rng() * allItems.length)];
};

// ─── Domain helpers ───────────────────────────────────────────────────────────

/**
 * Picks one word pair from bucket-partitioned word pools.
 * Thin wrapper over `pickFromPool` with a `WordEntry` return type.
 */
export const pickPair = <K extends string>(
  pools: Record<K, ReadonlyArray<WordEntry>>,
  buckets: ReadonlyArray<Bucket<K>>,
  rng: () => number = Math.random,
): WordEntry | undefined => pickFromPool(pools, buckets, rng);

/**
 * Picks a lesson from bucket-partitioned lesson pools, then picks a random
 * sentence within that lesson.
 * Returns `undefined` if all lesson pools are empty or the chosen lesson has
 * no sentences.
 */
export const pickSentence = <K extends string>(
  lessonPools: Record<K, ReadonlyArray<Lesson>>,
  buckets: ReadonlyArray<Bucket<K>>,
  rng: () => number = Math.random,
): { lesson: Lesson; sentence: SentenceEntry } | undefined => {
  const lesson = pickFromPool(lessonPools, buckets, rng);
  if (!lesson || lesson.sentences.length === 0) return undefined;
  const sentence = lesson.sentences[Math.floor(rng() * lesson.sentences.length)];
  return { lesson, sentence };
};
