import { shuffle } from "../lib/shuffle";
import { entriesToWordPairs } from "./letz-parser";
import {
  computeUnlockedLessonIds,
  findCurrentLessonId,
  phraseKey,
  wordKey,
  classifyWord,
} from "./progression";
import { lessonsToCandidates, lessonsSentencesToCandidates, selectItemsForBatch } from "./word-selector";

import type { WordStats } from "../context/auth";
import type { Lesson, SentenceEntry } from "./letz-parser";
import type { ExerciseBatch, SentenceBuilderBatch, SentenceBuilderItem, WordMatchBatch } from "./types";
import type { ItemSelectionConfig } from "./word-selector";
import type { WordResultMap } from "./WordMatch/types";

// ============================================================================
// Session mode
// ============================================================================

export type SessionMode =
  | { kind: "lesson"; lessonId?: string }
  | { kind: "madness" }
  | { kind: "mistakes" };

// ============================================================================
// BatchPlan
// ============================================================================

export type BatchPlan = {
  queue: ExerciseBatch[];
  plannedSlots: number;
  currentLessonId: string;
};

// ============================================================================
// Tokenization
// ============================================================================

// EN: split before apostrophe — "Who's" → ["Who", "'s"]
// LU: split after apostrophe  — "d'Mamm" → ["d'", "Mamm"]
const EN_CONTRACTION = /^([A-Za-zÀ-ÿ]+)([''][A-Za-zÀ-ÿ]{1,3})$/;
const LU_CONTRACTION = /^([A-Za-zÀ-ÿ]{1,4}[''])([A-Za-zÀ-ÿ].*)$/;

const splitWord = (word: string, language: "en" | "lu"): string[] => {
  const m = language === "lu"
    ? word.match(LU_CONTRACTION)
    : word.match(EN_CONTRACTION);
  return m ? [m[1], m[2]] : [word];
};

/** Split a sentence into word/contraction chips.
 *  Strips trailing punctuation; apostrophes split differently per language. */
export const tokenizeSentence = (text: string, language: "en" | "lu"): string[] =>
  text
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => {
      const stripped = word.replace(/[.,!?;:]+$/, "");
      return stripped ? splitWord(stripped, language) : [];
    });

// ============================================================================
// Slot builders
// ============================================================================

const WORD_MATCH_CONFIG: ItemSelectionConfig = {
  batchSize: 5,
  bucketRatios: { new: 0.4, struggling: 0.3, reinforcing: 0.2, reviewing: 0.1 },
};

const buildWordMatchSlot = (
  lessons: Lesson[],
  unlockedIds: ReadonlyArray<string>,
  currentLessonId: string,
  userWords: Record<string, WordStats>,
  config: ItemSelectionConfig = WORD_MATCH_CONFIG,
): WordMatchBatch => {
  const candidates = lessonsToCandidates(lessons, unlockedIds);
  const selected = selectItemsForBatch(candidates, userWords, currentLessonId, new Set(), config);
  return { type: "word-match", pairs: entriesToWordPairs(selected.map((s) => s.item)) };
};

const buildSentenceSlot = (
  entry: SentenceEntry,
  direction: "en-lu" | "lu-en",
  lessonVocab: string[],
): SentenceBuilderBatch => {
  const isEnToLu = direction === "en-lu";
  const targetLang = isEnToLu ? "lu" : "en";

  const promptText = isEnToLu ? entry.enVariants[0] : entry.luVariants[0];
  const acceptedAnswers = isEnToLu ? entry.luVariants : entry.enVariants;
  // Tokenize authored distractors so each entry becomes individual word chips
  const rawDistractors = isEnToLu ? (entry.distractorsLu ?? []) : (entry.distractorsEn ?? []);
  const authoredDistractors = rawDistractors.flatMap((d) => tokenizeSentence(d, targetLang));

  // Tokens = multiset union across all accepted variants:
  // for each distinct token, provide max(count in any single variant) chips.
  // This lets the player assemble any variant, and preserves duplicates within one variant
  // (e.g. "d'Mamm an d'Papp" needs two "d'" chips).
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

  // Distractors: authored first, then auto-fill from lesson vocabulary if needed
  const distractors = authoredDistractors.length > 0
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

// ============================================================================
// End-of-session mistake re-queue (computed once after all planned slots done)
// ============================================================================

/** Word match is always "success"; sentence depends on whether the answer was correct. */
export const determineSlotOutcome = (
  batch: ExerciseBatch,
  results: WordResultMap,
): "success" | "mistake" => {
  if (batch.type === "word-match") return "success";
  const r = results[batch.item.phraseKey];
  return r && r.correct > 0 ? "success" : "mistake";
};


// ============================================================================
// planSlots — lesson mode (15 slots, mixed)
// ============================================================================

const PLANNED_SLOTS = 15;
const SENTENCE_PROBABILITY = 0.8;
const DIRECTION_EN_LU_PROBABILITY = 0.8;

export const planSlots = (
  lessons: Lesson[],
  userWords: Record<string, WordStats>,
  targetLessonId?: string,
): BatchPlan => {
  if (lessons.length === 0) return { queue: [], plannedSlots: PLANNED_SLOTS, currentLessonId: "" };

  const unlockedIds = computeUnlockedLessonIds(lessons, userWords);
  const currentLessonId = targetLessonId ?? findCurrentLessonId(lessons, userWords);

  const allSentenceCandidates = lessonsSentencesToCandidates(lessons, unlockedIds);
  const unmasteredSentences = allSentenceCandidates.filter((c) => classifyWord(userWords[c.key]) !== "mastered");
  // Fall back to all sentences (for review) when all are mastered — avoids dropping sentences entirely
  const sentenceCandidates = unmasteredSentences.length > 0 ? unmasteredSentences : allSentenceCandidates;

  const currentLesson = lessons.find((l) => l.meta.id === currentLessonId);
  const lessonVocab = currentLesson
    ? [...new Set(currentLesson.entries.flatMap((e) => tokenizeSentence(e.lu, "lu")))]
    : [];

  const wordCandidates = lessonsToCandidates(lessons, unlockedIds);

  const { queue } = Array.from({ length: PLANNED_SLOTS }).reduce<{
    queue: ExerciseBatch[];
    usedWordKeys: ReadonlySet<string>;
  }>(
    ({ queue: slots, usedWordKeys }, _) => {
      const useSentence = Math.random() < SENTENCE_PROBABILITY && sentenceCandidates.length > 0;

      if (useSentence) {
        const candidate = sentenceCandidates[Math.floor(Math.random() * sentenceCandidates.length)];
        const direction = Math.random() < DIRECTION_EN_LU_PROBABILITY ? "en-lu" : "lu-en";
        return { queue: [...slots, buildSentenceSlot(candidate.item, direction, lessonVocab)], usedWordKeys };
      }

      // Rotate through all candidates before repeating: reset exclusions when fewer remain than a full batch
      const remainingCount = wordCandidates.length - usedWordKeys.size;
      const excludeKeys = remainingCount < WORD_MATCH_CONFIG.batchSize ? new Set<string>() : usedWordKeys;
      const selected = selectItemsForBatch(wordCandidates, userWords, currentLessonId, excludeKeys, WORD_MATCH_CONFIG);
      const newUsedKeys = new Set([...excludeKeys, ...selected.map((s) => wordKey(s.item.lu, s.item.en))]);

      return {
        queue: [...slots, { type: "word-match", pairs: entriesToWordPairs(selected.map((s) => s.item)) }],
        usedWordKeys: newUsedKeys,
      };
    },
    { queue: [], usedWordKeys: new Set<string>() },
  );

  return { queue, plannedSlots: PLANNED_SLOTS, currentLessonId };
};

// ============================================================================
// planMadnessSlots — 3 × 20, all seen words
// ============================================================================

const MADNESS_BATCH_COUNT = 3;
const MADNESS_BATCH_SIZE = 20;

const MADNESS_CONFIG: ItemSelectionConfig = {
  batchSize: MADNESS_BATCH_SIZE,
  bucketRatios: { new: 0.0, struggling: 0.3, reinforcing: 0.4, reviewing: 0.3 },
};

export const planMadnessSlots = (
  lessons: Lesson[],
  userWords: Record<string, WordStats>,
): BatchPlan => {
  if (lessons.length === 0) return { queue: [], plannedSlots: MADNESS_BATCH_COUNT, currentLessonId: "" };

  // Madness uses all lessons as unlocked
  const allIds = lessons.map((l) => l.meta.id);
  const currentLessonId = findCurrentLessonId(lessons, userWords);

  const queue: ExerciseBatch[] = Array.from({ length: MADNESS_BATCH_COUNT }).map(() =>
    buildWordMatchSlot(lessons, allIds, currentLessonId, userWords, MADNESS_CONFIG),
  );

  return { queue, plannedSlots: MADNESS_BATCH_COUNT, currentLessonId };
};

// ============================================================================
// planMistakesSlots — all items with incorrect > 0, sorted by mistake count
// ============================================================================

const MISTAKES_WORD_BATCH_SIZE = 5;

export const planMistakesSlots = (
  lessons: Lesson[],
  userWords: Record<string, WordStats>,
): BatchPlan => {
  const currentLessonId = findCurrentLessonId(lessons, userWords);

  // Mistake words: entries with incorrect > 0, sorted most mistakes first
  const allEntries = lessons.flatMap((l) =>
    l.entries.map((e) => ({ entry: e, key: `${e.lu}|${e.en}` })),
  );
  const mistakeWords = allEntries
    .filter(({ key }) => (userWords[key]?.incorrect ?? 0) > 0)
    .sort((a, b) => (userWords[b.key]?.incorrect ?? 0) - (userWords[a.key]?.incorrect ?? 0))
    .map(({ entry }) => entry);

  // Fill-to-5 pool: any non-mistake word (seen or not) to keep batches complete
  const mistakeKeys = new Set(mistakeWords.map((e) => `${e.lu}|${e.en}`));
  const fillPool = allEntries
    .filter(({ key }) => !mistakeKeys.has(key))
    .map(({ entry }) => entry);

  // Group mistake words into 5-word batches, filling last batch if needed
  const wordBatches: WordMatchBatch[] = mistakeWords.length === 0
    ? []
    : Array.from(
        { length: Math.ceil(mistakeWords.length / MISTAKES_WORD_BATCH_SIZE) },
        (_, i) => {
          const slice = mistakeWords.slice(i * MISTAKES_WORD_BATCH_SIZE, (i + 1) * MISTAKES_WORD_BATCH_SIZE);
          const needed = MISTAKES_WORD_BATCH_SIZE - slice.length;
          const filled = needed > 0 ? [...slice, ...fillPool.slice(0, needed)] : slice;
          return { type: "word-match" as const, pairs: entriesToWordPairs(filled) };
        },
      );

  // Mistake phrases: phrase:en-lu keys with incorrect > 0, sorted most mistakes first
  const allSentences = lessons.flatMap((l) =>
    l.sentences
      .filter((s) => s.enVariants.length > 0)
      .map((s) => ({ sentence: s, key: phraseKey("en-lu", s.enVariants[0]) })),
  );
  const mistakePhrases = allSentences
    .filter(({ key }) => (userWords[key]?.incorrect ?? 0) > 0)
    .sort((a, b) => (userWords[b.key]?.incorrect ?? 0) - (userWords[a.key]?.incorrect ?? 0))
    .map(({ sentence }) => sentence);

  const phraseBatches: SentenceBuilderBatch[] = mistakePhrases.map((s) =>
    buildSentenceSlot(s, "en-lu", []),
  );

  // Interleave: alternate word-match and sentence slots
  const queue: ExerciseBatch[] = [...wordBatches, ...phraseBatches].sort((a, b) => {
    // Sentences between word batches: simple interleave by alternating
    if (a.type === b.type) return 0;
    return a.type === "word-match" ? -1 : 1;
  });

  const plannedSlots = queue.length;
  return { queue, plannedSlots, currentLessonId };
};

// ============================================================================
// Legacy export — kept for any remaining call sites during migration
// ============================================================================

export const planBatches = (
  lessons: Lesson[],
  userWords: Record<string, WordStats>,
  targetLessonId: string | undefined,
  _opts: { batchSize: number; batchCount: number },
): { batches: ExerciseBatch[]; currentLessonId: string } => {
  const plan = planSlots(lessons, userWords, targetLessonId);
  return { batches: plan.queue, currentLessonId: plan.currentLessonId };
};
