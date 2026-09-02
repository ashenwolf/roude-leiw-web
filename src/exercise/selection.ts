// Layer 1 — Selection primitives.
// Pure functions: no React, no fetch, no KV. Mode planners (Layer 4) import from here.
// See .claude/reference/mode-specs.md > Encapsulation layering.

import { wordKey } from "./progression";

import type { Lesson, WordEntry, SentenceEntry, FillEntry } from "./letz-parser";

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
 * Picks up to `count` **distinct** word pairs for ONE WordMatch Slot.
 *
 * Dedup is per Slot, not per Session: a word recurring in later Slots is how a
 * straggler reaches the gate, but two tiles of the same word inside one Slot make
 * every pairing between them correct.
 *
 * The `count * 4` over-draw is fixed regardless of how many survive, so rng
 * consumption does not depend on the dedup outcome and `fakeRng` tests keep
 * describing real Sessions.
 *
 * Returns fewer than `count` when the pools hold fewer distinct words — the caller
 * decides whether that is a usable Slot (see `MIN_WORD_MATCH_PAIRS`).
 */
export const pickUniquePairs = <K extends string>(
  pools: Record<K, ReadonlyArray<WordEntry>>,
  buckets: ReadonlyArray<Bucket<K>>,
  count: number,
  rng: () => number = Math.random,
): WordEntry[] => {
  const seen = new Set<string>();
  return Array.from({ length: count * 4 }, () => pickPair(pools, buckets, rng))
    .filter((p): p is WordEntry => p !== undefined)
    .reduce<WordEntry[]>((acc, entry) => {
      if (acc.length >= count) return acc;
      const key = wordKey(entry.lu, entry.en);
      if (seen.has(key)) return acc;
      seen.add(key);
      return [...acc, entry];
    }, []);
};

/** One `@sentence` or one `@fill`: the same Element to every stage that schedules it. */
export type Phrase =
  | { readonly kind: "sentence"; readonly sentence: SentenceEntry }
  | { readonly kind: "fill"; readonly fill: FillEntry };

export const phrasesOf = (lesson: Lesson): ReadonlyArray<Phrase> => [
  ...lesson.sentences.map((sentence) => ({ kind: "sentence" as const, sentence })),
  ...lesson.fills.map((fill) => ({ kind: "fill" as const, fill })),
];

/**
 * Picks a lesson from bucket-partitioned lesson pools, then one phrase uniformly
 * within it. Two-stage on purpose: the buckets are lesson-scoped, so flattening
 * first would let a phrase-heavy lesson dominate the review pool.
 *
 * Drawing sentences and fills from one list gives a lesson's fills exposure in
 * proportion to how many it declares — no share constant, and a fill-free lesson
 * can never yield one.
 */
export const pickPhrase = <K extends string>(
  lessonPools: Record<K, ReadonlyArray<Lesson>>,
  buckets: ReadonlyArray<Bucket<K>>,
  rng: () => number = Math.random,
): { lesson: Lesson; phrase: Phrase } | undefined => {
  const lesson = pickFromPool(lessonPools, buckets, rng);
  if (!lesson) return undefined;
  const phrases = phrasesOf(lesson);
  if (phrases.length === 0) return undefined;
  return { lesson, phrase: phrases[Math.floor(rng() * phrases.length)] };
};
