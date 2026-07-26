// Canonical constants for the exercise/session system. Every magic number
// tied to mode shape, slot/pair counts, or selection probabilities lives here.
// See CLAUDE.md > Architecture Reference for the binding model.

// --- Stats gate (global) -----------------------------------------------------

/** Minimum `shown` count before an Element's success rate is allowed to influence
 *  unlock or error-pool membership. Below this, the Element contributes 0. */
export const MIN_ANSWERS = 5;

// --- Thresholds --------------------------------------------------------------

/**
 * Accuracy boundary (correct / (correct + incorrect)) below which an element
 * is considered "struggling" and enters the error pool for Fix Errors / Word Mix.
 * Also the boundary above which `classifyWord` returns "mastered" (live view).
 */
export const ERROR_THRESHOLD = 0.8;

/** An Element passes the lesson's unlock check if `correct/shown >= this`. */
export const UNLOCK_ELEMENT_THRESHOLD = 0.8;

/**
 * Number of correct answers an Element needs to "pass" — the **monotonic**
 * mastery gate used by lesson progress, lesson unlock, XP, and the "Learned X/Y"
 * stat. The rule is intentionally simple: pass iff `correct >= this`. There is no
 * accuracy ratio and no minimum-shown gate — three correct answers is enough,
 * regardless of how many times the Element was missed.
 *
 * Unlike `classifyWord` (which uses live accuracy and can fluctuate),
 * `isElementMastered` only becomes `true` and never reverts, because `correct`
 * is a monotonically increasing counter.
 */
export const MASTERY_CORRECT_COUNT = 3;

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

/**
 * Exam Mode: pairs per WordMatch Slot. The planner chunks the sub-lesson's
 * (shuffled) vocabulary into slots of this size; a trailing chunk smaller than
 * EXAM_WORD_MATCH_MIN_CHUNK merges into the previous slot rather than forming
 * a degenerate 1–2 pair slot.
 */
export const EXAM_WORD_MATCH_PAIR_COUNT = 5;
export const EXAM_WORD_MATCH_MIN_CHUNK = 3;

// --- Probability tables ------------------------------------------------------
//
// Each table is an ordered list of buckets. A roll in [0, 1) is matched against
// the cumulative `upTo` thresholds; the first bucket whose `upTo` exceeds the
// roll wins. The last bucket's `upTo` must be 1.0.

type Bucket<Name extends string> = { readonly name: Name; readonly upTo: number };

/** Slot-type roll for Fix Errors Mode (fixed). Lesson Mode derives an adaptive
 *  split at plan time — see LESSON_WORD_MATCH_SHARE_{MIN,MAX} and
 *  `lessonSlotTypeDistribution` in `modes/lesson.ts`. */
export const SLOT_TYPE_DISTRIBUTION = [
  { name: "word-match", upTo: 0.2 },
  { name: "sentence-builder", upTo: 1.0 },
] as const satisfies ReadonlyArray<Bucket<"word-match" | "sentence-builder">>;

/**
 * Lesson Mode adaptive word-match share bounds.
 *
 * The word-match slot-type probability scales with how word-heavy the current
 * lesson's remaining backlog is: `share = clamp(unmasteredWords / (unmastered
 * words + unmastered sentences), MIN, MAX)`. When words dominate the backlog the
 * split shifts toward word-match (up to MAX); once words are mostly mastered it
 * decays back to MIN (the historical fixed 20% word-match / 80% sentence).
 *
 * MIN preserves the original balance so sentence practice never starves in a
 * word-light lesson; MAX keeps sentence-builder present even in the most
 * word-heavy lesson (sentences also drill vocab implicitly).
 */
export const LESSON_WORD_MATCH_SHARE_MIN = 0.2;
export const LESSON_WORD_MATCH_SHARE_MAX = 0.6;

/**
 * Lesson WordMatch per-pair source.
 *
 * The `not-yet-mastered` bucket biases toward current-lesson entries that have
 * not yet passed the unlock gate (`correct < MASTERY_CORRECT_COUNT`). This
 * covers BOTH never-seen elements (shown = 0) AND stragglers that have been
 * shown many times but keep being missed (`shown ≥ MIN_ANSWERS, correct < 3`) —
 * the latter would otherwise drop out of every priority bucket and permanently
 * cap the lesson below the 80% unlock threshold. Keying off `correct` aligns the
 * bucket with the actual gate (`isElementMastered`). When the bucket is empty
 * (all current-lesson entries already mastered), `pickFromPool` re-rolls into the
 * remaining buckets.
 */
export const LESSON_WORD_MATCH_BUCKETS = [
  { name: "not-yet-mastered", upTo: 0.3 },
  { name: "current", upTo: 0.85 },
  { name: "previous", upTo: 1.0 },
] as const satisfies ReadonlyArray<Bucket<"not-yet-mastered" | "current" | "previous">>;

/**
 * Lesson SentenceBuilder per-Slot lesson source.
 *
 * `not-yet-mastered` includes the current lesson only when it contains at
 * least one sentence whose combined `correct < MASTERY_CORRECT_COUNT`. Inside
 * the lesson the sentence pick is uniform, so the bias is "lesson with an
 * unmastered sentence is preferred"; at 30% weight this converges fast enough
 * that stragglers reach the unlock gate without dominating the Session.
 */
export const LESSON_SENTENCE_LESSON_BUCKETS = [
  { name: "not-yet-mastered", upTo: 0.3 },
  { name: "current", upTo: 0.8 },
  { name: "previous", upTo: 1.0 },
] as const satisfies ReadonlyArray<Bucket<"not-yet-mastered" | "current" | "previous">>;

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
