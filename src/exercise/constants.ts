// Canonical constants for the exercise/session system. Every magic number
// tied to mode shape, slot/pair counts, or selection probabilities lives here.
// See CLAUDE.md > Architecture Reference for the binding model.

// --- Stats gate (global) -----------------------------------------------------

/** Minimum `shown` count before an Element's success rate is allowed to influence
 *  unlock or error-pool membership. Below this, the Element contributes 0. */
export const MIN_ANSWERS = 5;

// --- Thresholds --------------------------------------------------------------

/** An Element is in the "error pool" if its success rate drops below this. */
export const ERROR_THRESHOLD = 0.9;

/** An Element passes the lesson's unlock check if `correct/shown >= this`. */
export const UNLOCK_ELEMENT_THRESHOLD = 0.8;

/** A lesson unlocks the next lesson if `passingElements / totalElements >= this`. */
export const UNLOCK_LESSON_THRESHOLD = 0.8;

// --- Block / Slot shape per Mode --------------------------------------------

/** All three Modes have 3 normal Blocks (plus optional correction for Lesson/Fix Errors). */
export const BLOCK_COUNT = 3;

/** Lesson and Fix Errors: 5 Slots per Block. */
export const LESSON_SLOTS_PER_BLOCK = 5;

/** Pairs inside a single WordMatch Slot in Lesson / Fix Errors. */
export const LESSON_WORD_MATCH_PAIR_COUNT = 5;

/** Word Mix: 1 Slot per Block (each Slot is a 20-pair WordMatch Exercise). */
export const WORD_MIX_SLOTS_PER_BLOCK = 1;

/** Word Mix: 20 pairs in each Slot's WordMatch Exercise. */
export const WORD_MIX_PAIRS_PER_SLOT = 20;

/** Lesson / Fix Errors total Slots before any correction Block. */
export const LESSON_TOTAL_SLOTS = BLOCK_COUNT * LESSON_SLOTS_PER_BLOCK;

/** Word Mix total Slots (always exactly BLOCK_COUNT × WORD_MIX_SLOTS_PER_BLOCK). */
export const WORD_MIX_TOTAL_SLOTS = BLOCK_COUNT * WORD_MIX_SLOTS_PER_BLOCK;

// --- Probability tables ------------------------------------------------------
//
// Each table is an ordered list of buckets. A roll in [0, 1) is matched against
// the cumulative `upTo` thresholds; the first bucket whose `upTo` exceeds the
// roll wins. The last bucket's `upTo` must be 1.0.

type Bucket<Name extends string> = { readonly name: Name; readonly upTo: number };

/** Slot-type roll for Lesson and Fix Errors Modes. */
export const SLOT_TYPE_DISTRIBUTION = [
  { name: "word-match", upTo: 0.2 },
  { name: "sentence-builder", upTo: 1.0 },
] as const satisfies ReadonlyArray<Bucket<"word-match" | "sentence-builder">>;

/** Lesson WordMatch per-pair source. */
export const LESSON_WORD_MATCH_BUCKETS = [
  { name: "current", upTo: 0.8 },
  { name: "previous", upTo: 1.0 },
] as const satisfies ReadonlyArray<Bucket<"current" | "previous">>;

/** Lesson SentenceBuilder per-Slot lesson source. */
export const LESSON_SENTENCE_LESSON_BUCKETS = [
  { name: "current", upTo: 0.75 },
  { name: "previous", upTo: 1.0 },
] as const satisfies ReadonlyArray<Bucket<"current" | "previous">>;

/** Lesson SentenceBuilder per-Slot direction. */
export const LESSON_SENTENCE_DIRECTION_BUCKETS = [
  { name: "en-lu", upTo: 0.66 },
  { name: "lu-en", upTo: 1.0 },
] as const satisfies ReadonlyArray<Bucket<"en-lu" | "lu-en">>;

/** Word Mix per-pair source. */
export const WORD_MIX_BUCKETS = [
  { name: "errors", upTo: 0.25 },
  { name: "current", upTo: 0.5 },
  { name: "previous", upTo: 1.0 },
] as const satisfies ReadonlyArray<Bucket<"errors" | "current" | "previous">>;
