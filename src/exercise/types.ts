import type { WordPair } from "./WordMatch/types";

// Exercise type registry — extend as new exercise types are added
export const EXERCISE_TYPE = {
  WordMatch: "word-match",
  SentenceBuilder: "sentence-builder",
  FillBlank: "fill-blank",
} as const;

export type ExerciseType = typeof EXERCISE_TYPE[keyof typeof EXERCISE_TYPE];

// Opaque exercise batch — each type carries its own data shape

/** Match Luxembourgish words to their English translations. One Step per pair. */
export type WordMatchBatch = {
  type: "word-match";
  /** `[lu, en]` pairs to match. Selection is the Mode planner's job. */
  pairs: WordPair[];
};

/** Everything the SentenceBuilder UI needs to render and grade one puzzle. */
export type SentenceBuilderItem = {
  /** The sentence to translate, in the source language of `direction`. */
  promptText: string;
  /** Every answer variant accepted as correct, in the target language. */
  acceptedAnswers: string[];
  /** Shuffled tiles: the answer tokens plus distractors. */
  tokens: string[];
  /** Which way the puzzle is presented — decides prompt/answer languages. */
  direction: "en-lu" | "lu-en";
  /** Stat key for this phrase in this direction (`phrase:{direction}:{firstEn}`). */
  phraseKey: string;
  /**
   * Examiner question in Luxembourgish, rendered above the prompt. Present only
   * for Q&A sentences, which are always assembled en→lu (see
   * `resolveSentenceDirection`).
   */
  question?: string;
  /**
   * Pre-generated audio of the PROMPT as presented — the examiner question for
   * Q&A sentences, the Luxembourgish phrase for lu→en, and absent for plain
   * en→lu (hearing the Luxembourgish would leak the answer). Played on arrival
   * and replayable via the speaker button.
   */
  audioUrl?: string;
};

/** Assemble a sentence from token tiles. One Step per submit. */
export type SentenceBuilderBatch = {
  type: "sentence-builder";
  item: SentenceBuilderItem;
};

/**
 * Everything the FillBlank UI needs to render and grade one fill-in-words item.
 *
 * The frame arrives **pre-split**, so the UI never re-parses brackets: render
 * `frame[0]`, blank 0, `frame[1]`, blank 1, … and the invariant
 * `frame.length === blanks.length + 1` makes that interleave total (a blank at the
 * very start or end yields an empty string, not a missing element).
 */
export type FillBlankItem = {
  /**
   * Fixed text segments around the blanks, in order.
   * `frame.length === blanks.length + 1`; segments may be empty strings.
   */
  frame: string[];
  /**
   * The correct tile for each blank, in order. One blank = one tile taken
   * verbatim, so a multi-word blank (`[Ferris wheel]`) is a single entry — never
   * tokenized (see .claude/memory/fill-in-words-exercise.md).
   */
  blanks: string[];
  /** Shuffled tiles: the blank answers plus distractors. */
  tokens: string[];
  /** The complete sentence in the source language, shown as the prompt. */
  promptText: string;
  /** Which way the item is presented — decides prompt/answer languages. */
  direction: "en-lu" | "lu-en";
  /** Stat key for this fill in this direction (`fill:{direction}:{firstEn}`). */
  fillKey: string;
};

/** Drop tiles into a sentence's blanks. One Step per submit (all-or-nothing). */
export type FillBlankBatch = {
  type: "fill-blank";
  item: FillBlankItem;
};

export type Exercise = WordMatchBatch | SentenceBuilderBatch | FillBlankBatch;
/** @deprecated Use Exercise */
export type ExerciseBatch = Exercise;
