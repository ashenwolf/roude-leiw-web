// Canonical constants for the exercise/session system. Every magic number
// tied to mode shape, slot/pair counts, or selection probabilities lives here.
// See .claude/reference/mode-specs.md for the binding model.

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

/**
 * A lesson unlocks the next lesson if `passingElements / totalElements >= this`.
 *
 * 1.0 — **every** Element must pass the mastery gate. The same constant gates the
 * exam track (a SubLesson opens the next step in its Theme once it is fully
 * passed), so "done" means the same thing on both tracks. Unlock stays sticky:
 * `correct` is monotonic and already-unlocked ids are persisted, so nothing
 * re-locks if a later mistake drops live accuracy.
 */
export const UNLOCK_LESSON_THRESHOLD = 1.0;

// --- Block / Slot shape ------------------------------------------------------

/** Every Mode has 3 normal Blocks (plus optional correction for Lesson/Fix Errors/Exam). */
export const BLOCK_COUNT = 3;

// --- Probability tables ------------------------------------------------------
//
// Each table is an ordered list of buckets. A roll in [0, 1) is matched against
// the cumulative `upTo` thresholds; the first bucket whose `upTo` exceeds the
// roll wins. The last bucket's `upTo` must be 1.0.

type Bucket<Name extends string> = { readonly name: Name; readonly upTo: number };

const LESSON_SLOTS_PER_BLOCK = 5;

/**
 * Lesson Mode — Session shape and selection tables.
 *
 * `wordMatchShare` bounds the adaptive slot-type split: the word-match
 * probability scales with how word-heavy the current lesson's remaining backlog
 * is (`clamp(unmasteredWords / backlog, min, max)`; see
 * `lessonSlotTypeDistribution` in `modes/lesson.ts`). `min` preserves the
 * historical 20/80 balance so phrase practice never starves in a word-light
 * lesson; `max` keeps phrase practice present in the most word-heavy one.
 *
 * `buckets.wordMatch` / `buckets.phraseLesson` both lead with
 * `not-yet-mastered` — current-lesson Elements below the unlock gate
 * (`correct < MASTERY_CORRECT_COUNT`). That covers never-seen Elements AND
 * stragglers shown many times but still missed, which would otherwise drop out
 * of every priority bucket and permanently cap the lesson below threshold.
 * Empty buckets re-roll (see `pickFromPool`).
 *
 * `buckets.wordMatch` / `buckets.phraseLesson` both lead with
 * `not-yet-mastered` — current-lesson Elements below the unlock gate
 * (`correct < MASTERY_CORRECT_COUNT`). That covers never-seen Elements AND
 * stragglers shown many times but still missed, which would otherwise drop out
 * of every priority bucket and permanently cap the lesson below threshold.
 * Empty buckets re-roll (see `pickFromPool`).
 *
 * A **phrase** is one `@sentence` or one `@fill` — one slot type and one bucket
 * table for both, so a lesson's fills get exposure in proportion to how many it
 * declares.
 */
export const LESSON = {
  slotsPerBlock: LESSON_SLOTS_PER_BLOCK,
  totalSlots: BLOCK_COUNT * LESSON_SLOTS_PER_BLOCK,
  wordMatchPairs: 5,
  wordMatchShare: { min: 0.2, max: 0.6 },
  buckets: {
    wordMatch: [
      { name: "not-yet-mastered", upTo: 0.3 },
      { name: "current", upTo: 0.85 },
      { name: "previous", upTo: 1.0 },
    ],
    phraseLesson: [
      { name: "not-yet-mastered", upTo: 0.3 },
      { name: "current", upTo: 0.8 },
      { name: "previous", upTo: 1.0 },
    ],
    direction: [
      { name: "en-lu", upTo: 0.66 },
      { name: "lu-en", upTo: 1.0 },
    ],
  },
} as const satisfies {
  slotsPerBlock: number;
  totalSlots: number;
  wordMatchPairs: number;
  wordMatchShare: { min: number; max: number };
  buckets: {
    wordMatch: ReadonlyArray<Bucket<"not-yet-mastered" | "current" | "previous">>;
    phraseLesson: ReadonlyArray<Bucket<"not-yet-mastered" | "current" | "previous">>;
    direction: ReadonlyArray<Bucket<"en-lu" | "lu-en">>;
  };
};

/** Word Mix — 3 Blocks × 1 Slot, each Slot a 20-pair WordMatch Exercise. */
export const WORD_MIX = {
  slotsPerBlock: 1,
  totalSlots: BLOCK_COUNT,
  pairsPerSlot: 20,
  buckets: {
    pairSource: [
      { name: "errors", upTo: 0.25 },
      { name: "current", upTo: 0.5 },
      { name: "previous", upTo: 1.0 },
    ],
  },
} as const satisfies {
  slotsPerBlock: number;
  totalSlots: number;
  pairsPerSlot: number;
  buckets: { pairSource: ReadonlyArray<Bucket<"errors" | "current" | "previous">> };
};

/**
 * Fix Errors — same Session shape as Lesson, fixed slot-type split.
 *
 * `fill-blank` takes a share of what was sentence-builder's. A rolled type whose
 * error pool is empty re-rolls (see `buildSlot` in `modes/fix-errors.ts`), so this
 * table costs nothing for users whose content carries no `@fill` — most course
 * lessons today — while giving fills real presence once picture themes ship.
 */
export const FIX_ERRORS = {
  buckets: {
    slotType: [
      { name: "word-match", upTo: 0.2 },
      { name: "sentence-builder", upTo: 0.75 },
      { name: "fill-blank", upTo: 1.0 },
    ],
  },
} as const satisfies {
  buckets: {
    slotType: ReadonlyArray<Bucket<"word-match" | "sentence-builder" | "fill-blank">>;
  };
};

/**
 * Exam — WordMatch chunk sizing for full-coverage planning.
 * A trailing chunk below `minChunk` merges into the previous Slot rather than
 * forming a degenerate 1–2 pair Slot (see `chunkIntoWordMatchExercises`).
 */
export const EXAM = {
  wordMatch: { pairCount: 5, minChunk: 3 },
} as const;
