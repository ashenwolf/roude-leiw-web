// Layer 1 — Exercise builders.
// Pure factories: receive already-selected content, return a typed Exercise value.
// Selection (which words/sentences to use) is the caller's job; these functions
// only concern themselves with the Exercise data shape.
// See .claude/reference/mode-specs.md > Encapsulation layering.

import { shuffle } from "../lib/shuffle";
import { fillKey, phraseKey } from "./progression";
import { entriesToWordPairs } from "./letz-parser";
import { normalizeAnswer } from "./SentenceBuilder/sentence-logic";

import type { FillEntry, SentenceEntry, WordEntry } from "./letz-parser";
import type {
  FillBlankBatch,
  FillBlankItem,
  SentenceBuilderBatch,
  SentenceBuilderItem,
  WordMatchBatch,
} from "./types";

// ─── Tokenization ─────────────────────────────────────────────────────────────

// EN: split before apostrophe — "Who's" → ["Who", "'s"]
// LU: split after apostrophe  — "d'Mamm" → ["d'", "Mamm"]
const EN_CONTRACTION = /^([A-Za-zÀ-ÿ]+)([''][A-Za-zÀ-ÿ]{1,3})$/;
const LU_CONTRACTION = /^([A-Za-zÀ-ÿ]{1,4}[''])([A-Za-zÀ-ÿ].*)$/;

const splitWord = (word: string, language: "en" | "lu"): string[] => {
  const m = language === "lu" ? word.match(LU_CONTRACTION) : word.match(EN_CONTRACTION);
  return m ? [m[1], m[2]] : [word];
};

/**
 * Splits a sentence into word/contraction chips.
 * Strips trailing punctuation; apostrophes split differently per language.
 */
export const tokenizeSentence = (text: string, language: "en" | "lu"): string[] =>
  text
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => {
      const stripped = word.replace(/[.,!?;:]+$/, "");
      return stripped ? splitWord(stripped, language) : [];
    });

// ─── Exercise factories ───────────────────────────────────────────────────────

/**
 * Builds a word-match exercise from a pre-selected list of word pairs.
 * The caller is responsible for selecting which pairs to include.
 */
export const buildWordMatchExercise = (pairs: WordEntry[]): WordMatchBatch => ({
  type: "word-match",
  pairs: entriesToWordPairs(pairs),
});

/**
 * Splits an ordered word list into consecutive WordMatch exercises of **exactly**
 * `pairCount` pairs each, covering every entry at least once.
 *
 * A short final chunk is padded with repeats rather than merged into an oversized
 * Slot: the UI shows a fixed `DISPLAY_SLOTS` rows, so an odd-sized Slot either
 * hides pairs or leaves holes, while a repeat costs one extra correct answer
 * toward that word's gate.
 *
 * Pads come from entries *outside* the chunk they fill — WordMatch matches by
 * value, so two identical tiles in one Slot make every pairing between them
 * correct. That always suffices once `entries.length >= pairCount`; below it the
 * single Slot is short.
 *
 * Mode-agnostic: any Mode that wants "cover this whole word list" slots uses it,
 * passing its own sizing. Callers shuffle first if they want random order.
 */
export const chunkIntoWordMatchExercises = (
  entries: ReadonlyArray<WordEntry>,
  { pairCount }: { pairCount: number },
): WordMatchBatch[] => {
  if (entries.length === 0) return [];
  if (entries.length <= pairCount) return [buildWordMatchExercise([...entries])];

  const slotCount = Math.ceil(entries.length / pairCount);
  const shortfall = slotCount * pairCount - entries.length;
  // From the front, which is outside the final chunk — the only one that can be short.
  const padded = [...entries, ...entries.slice(0, shortfall)];

  return Array.from({ length: slotCount }, (_, i) =>
    buildWordMatchExercise(padded.slice(i * pairCount, (i + 1) * pairCount)),
  );
};

/**
 * The direction a Sentence must be presented in.
 *
 * A Sentence carrying a `question` is an examiner prompt: the learner answers
 * it in Luxembourgish, so it is **always** assembled en→lu regardless of what
 * the caller rolled. This is a property of the content, not of the Mode — every
 * Mode that schedules sentences gets the rule for free by going through here.
 */
export const resolveSentenceDirection = (
  entry: SentenceEntry,
  rolled: "en-lu" | "lu-en",
): "en-lu" | "lu-en" => (entry.question !== undefined ? "en-lu" : rolled);

/**
 * Builds a sentence-builder exercise from a single sentence entry.
 *
 * Token set = multiset union of all accepted answer variants so the player can
 * assemble any valid variant, preserving duplicate tokens within a single variant
 * (e.g. "d'Mamm an d'Papp" needs two "d'" chips).
 *
 * Distractors: authored first; auto-filled from `lessonVocab` when absent.
 *
 * `direction` is normalized through `resolveSentenceDirection`, so a
 * question-carrying Sentence is en→lu no matter which direction was requested.
 */
export const buildSentenceExercise = (
  entry: SentenceEntry,
  requestedDirection: "en-lu" | "lu-en",
  lessonVocab: string[],
): SentenceBuilderBatch => {
  const direction = resolveSentenceDirection(entry, requestedDirection);
  const isEnToLu = direction === "en-lu";
  const targetLang = isEnToLu ? "lu" : "en";

  const promptText = isEnToLu ? entry.enVariants[0] : entry.luVariants[0];
  const acceptedAnswers = isEnToLu ? entry.luVariants : entry.enVariants;

  // For each token, provide max(count in any single variant) chips. Shared tokens
  // across variants collapse to one chip; diverging tokens (e.g. formal "Ären" vs
  // informal "däin") both appear, so any single variant is fully buildable.
  const variantTokenLists = acceptedAnswers.map((a) => tokenizeSentence(a, targetLang));
  const maxCounts = variantTokenLists.reduce<Map<string, number>>((acc, tokens) => {
    const counts = tokens.reduce<Map<string, number>>(
      (m, t) => m.set(t, (m.get(t) ?? 0) + 1),
      new Map(),
    );
    counts.forEach((n, t) => acc.set(t, Math.max(acc.get(t) ?? 0, n)));
    return acc;
  }, new Map());
  const uniqueTargetTokens = [...maxCounts.entries()].flatMap(([t, n]) =>
    Array.from({ length: n }, () => t),
  );

  // A distractor tile must be a wrong answer, never a word that is also part of a
  // correct variant — otherwise it is either a free correct chip or (for a
  // multi-word phrase distractor) leaks shared function words. Drop any distractor
  // token that collides with an accepted-answer token, comparing under the same
  // normalization the answer checker uses (see normalizeAnswer). Variety between
  // variants comes from the accepted answers, not from distractors.
  const acceptedTokenSet = new Set(uniqueTargetTokens.map((t) => normalizeAnswer(t)));
  const rawDistractors = isEnToLu ? (entry.distractorsLu ?? []) : (entry.distractorsEn ?? []);
  const authoredDistractors = rawDistractors
    .flatMap((d) => tokenizeSentence(d, targetLang))
    .filter((t) => !acceptedTokenSet.has(normalizeAnswer(t)));

  const distractors =
    authoredDistractors.length > 0
      ? authoredDistractors
      : lessonVocab.filter((w) => !acceptedTokenSet.has(normalizeAnswer(w))).slice(0, 3);

  const item: SentenceBuilderItem = {
    promptText,
    acceptedAnswers,
    tokens: shuffle([...uniqueTargetTokens, ...distractors]),
    direction,
    // Record under the actual presented direction so the error pool can later
    // repeat the exact direction the user struggled with.
    phraseKey: phraseKey(direction, entry.enVariants[0]),
    ...(entry.question !== undefined ? { question: entry.question } : {}),
    // Prompt audio: the question for Q&A (always en→lu), the Luxembourgish
    // phrase when it IS the prompt (lu→en). Plain en→lu gets none — the
    // Luxembourgish is the answer, and audio would give it away.
    ...(entry.question !== undefined && entry.questionAudioUrl !== undefined
      ? { audioUrl: entry.questionAudioUrl }
      : {}),
    ...(entry.question === undefined && direction === "lu-en" && entry.luAudioUrl !== undefined
      ? { audioUrl: entry.luAudioUrl }
      : {}),
  };

  return { type: "sentence-builder", item };
};

// ─── Fill-in-words ────────────────────────────────────────────────────────────

/** Matches one `[bracketed]` blank. Non-greedy and `[^\][]` so nesting can't match. */
const BLANK_RX = /\[([^[\]]*)\]/g;

export type ParsedFillLine = {
  /** Fixed segments around the blanks; `frame.length === blanks.length + 1`. */
  frame: string[];
  /** Blank contents in order, trimmed, verbatim otherwise (never tokenized). */
  blanks: string[];
};

/**
 * Splits an authored `@fill` line into its fixed frame and its blanks.
 *
 * Pure and total: a line with no brackets yields `{ frame: [line], blanks: [] }`,
 * so callers get a well-formed value rather than an exception, and content rules
 * (1–4 blanks, balanced brackets) are enforced by the integration tests where the
 * failure message can name the offending file. Unbalanced brackets simply don't
 * match `BLANK_RX` and stay as literal frame text — visible in the UI, which is
 * exactly the kind of loud failure a content slip should produce.
 *
 * Whitespace is preserved in the frame (segments carry their own spacing) but
 * trimmed off each blank, since the tile text is what gets compared.
 */
export const parseFillLine = (line: string): ParsedFillLine => {
  const matches = [...line.matchAll(BLANK_RX)];

  const frame = matches.reduce<{ segments: string[]; cursor: number }>(
    (acc, m) => ({
      segments: [...acc.segments, line.slice(acc.cursor, m.index)],
      cursor: m.index + m[0].length,
    }),
    { segments: [], cursor: 0 },
  );

  return {
    frame: [...frame.segments, line.slice(frame.cursor)],
    blanks: matches.map((m) => m[1].trim()),
  };
};

/** The complete sentence with its brackets removed — the prompt the learner reads. */
export const stripBlankMarkers = (line: string): string => line.replace(BLANK_RX, "$1");

/**
 * Builds a fill-in-words exercise from a single `@fill` entry.
 *
 * **One blank = one tile, verbatim.** Unlike `buildSentenceExercise`, neither the
 * blanks nor the distractors go through `tokenizeSentence`: a multi-word blank
 * (`[Ferris wheel]`) is a single tile. That is what removes within-blank ordering
 * ambiguity, and it is a deliberate divergence — do not "unify" the two builders
 * by tokenizing here (see .claude/memory/fill-in-words-exercise.md).
 *
 * `direction` is honoured as requested; there is no question-carrying override,
 * because a `@fill` has no `@question` (the frame itself is the prompt).
 *
 * The prompt is the **source-language sentence with its markers stripped** — the
 * learner reads a complete sentence and reconstructs the gapped one in the target
 * language. Distractors colliding with a blank answer under `normalizeAnswer` are
 * dropped: such a tile would be a free correct answer rather than a wrong one.
 */
export const buildFillExercise = (
  entry: FillEntry,
  direction: "en-lu" | "lu-en",
): FillBlankBatch => {
  const isEnToLu = direction === "en-lu";
  const targetLine = isEnToLu ? entry.lu : entry.en;
  const sourceLine = isEnToLu ? entry.en : entry.lu;

  const { frame, blanks } = parseFillLine(targetLine);

  const blankSet = new Set(blanks.map(normalizeAnswer));
  const rawDistractors = isEnToLu ? (entry.distractorsLu ?? []) : (entry.distractorsEn ?? []);
  const distractors = rawDistractors
    .map((d) => d.trim())
    .filter((d) => d.length > 0 && !blankSet.has(normalizeAnswer(d)));

  const item: FillBlankItem = {
    frame,
    blanks,
    tokens: shuffle([...blanks, ...distractors]),
    promptText: stripBlankMarkers(sourceLine),
    direction,
    // Keyed on the @en line verbatim (brackets included) and on the presented
    // direction, so the error pool can repeat the exact direction that failed.
    fillKey: fillKey(direction, entry.en),
  };

  return { type: "fill-blank", item };
};
