// Layer 1 — Exercise builders.
// Pure factories: receive already-selected content, return a typed Exercise value.
// Selection (which words/sentences to use) is the caller's job; these functions
// only concern themselves with the Exercise data shape.
// See CLAUDE.md > Architecture Reference > Encapsulation layering.

import { shuffle } from "../lib/shuffle";
import { phraseKey } from "./progression";
import { entriesToWordPairs } from "./letz-parser";

import type { SentenceEntry, WordEntry } from "./letz-parser";
import type { WordMatchBatch, SentenceBuilderBatch, SentenceBuilderItem } from "./types";

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
 * Builds a sentence-builder exercise from a single sentence entry.
 *
 * Token set = multiset union of all accepted answer variants so the player can
 * assemble any valid variant, preserving duplicate tokens within a single variant
 * (e.g. "d'Mamm an d'Papp" needs two "d'" chips).
 *
 * Distractors: authored first; auto-filled from `lessonVocab` when absent.
 */
export const buildSentenceExercise = (
  entry: SentenceEntry,
  direction: "en-lu" | "lu-en",
  lessonVocab: string[],
): SentenceBuilderBatch => {
  const isEnToLu = direction === "en-lu";
  const targetLang = isEnToLu ? "lu" : "en";

  const promptText = isEnToLu ? entry.enVariants[0] : entry.luVariants[0];
  const acceptedAnswers = isEnToLu ? entry.luVariants : entry.enVariants;

  const rawDistractors = isEnToLu ? (entry.distractorsLu ?? []) : (entry.distractorsEn ?? []);
  const authoredDistractors = rawDistractors.flatMap((d) => tokenizeSentence(d, targetLang));

  // For each token, provide max(count in any single variant) chips.
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

  const distractors =
    authoredDistractors.length > 0
      ? authoredDistractors
      : lessonVocab.filter((w) => !uniqueTargetTokens.includes(w)).slice(0, 3);

  const item: SentenceBuilderItem = {
    promptText,
    acceptedAnswers,
    tokens: shuffle([...uniqueTargetTokens, ...distractors]),
    direction,
    phraseKey: phraseKey("en-lu", entry.enVariants[0]),
  };

  return { type: "sentence-builder", item };
};
