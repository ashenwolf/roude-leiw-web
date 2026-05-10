import type { Lesson } from "./letz-parser";
import type { WordStats } from "../context/auth";

// --- Mastery Thresholds ---

export const MASTERY = {
  correctToMaster: 3,
  strugglingMaxAccuracy: 0.6,
  strugglingMinShown: 3,
  unlockThreshold: 0.8,
} as const;

// --- Word Classification ---

export type WordMastery = "unseen" | "learning" | "struggling" | "mastered";

const accuracy = (s: WordStats): number =>
  s.correct + s.incorrect > 0 ? s.correct / (s.correct + s.incorrect) : 0;

export const classifyWord = (stats: WordStats | undefined): WordMastery => {
  if (!stats || stats.shown === 0) return "unseen";
  if (stats.correct >= MASTERY.correctToMaster) return "mastered";
  if (stats.shown >= MASTERY.strugglingMinShown && accuracy(stats) < MASTERY.strugglingMaxAccuracy) return "struggling";
  return "learning";
};

export const wordKey = (lu: string, en: string): string => `${lu}|${en}`;

export const phraseKey = (direction: "en-lu" | "lu-en", firstEn: string): string =>
  `phrase:${direction}:${firstEn}`;

export const isPhraseKey = (key: string): boolean => key.startsWith("phrase:");
export const isWordKey = (key: string): boolean => !isPhraseKey(key);

// --- Lesson Progress ---

export type LessonProgress = {
  total: number;
  mastered: number;
  percentage: number;
  isComplete: boolean;
};

export const computeLessonProgress = (
  lesson: Lesson,
  userWords: Record<string, WordStats>,
): LessonProgress => {
  const wordTotal = lesson.entries.length;
  const wordMastered = lesson.entries.filter(
    (e) => classifyWord(userWords[wordKey(e.lu, e.en)]) === "mastered",
  ).length;

  // Only EN→LU direction gates lesson progression for sentences
  const sentenceTotal = lesson.sentences.length;
  const sentenceMastered = lesson.sentences.filter(
    (s) => s.enVariants.length > 0 && classifyWord(userWords[phraseKey("en-lu", s.enVariants[0])]) === "mastered",
  ).length;

  const total = wordTotal + sentenceTotal;
  const mastered = wordMastered + sentenceMastered;
  const percentage = total > 0 ? mastered / total : 0;
  return { total, mastered, percentage, isComplete: mastered === total && total > 0 };
};

// --- Lesson Unlock ---

export const computeUnlockedLessonIds = (
  lessons: Lesson[],
  userWords: Record<string, WordStats>,
): ReadonlyArray<string> =>
  lessons.reduce<string[]>(
    (unlocked, lesson, idx) => {
      if (idx === 0) return [lesson.meta.id];
      const prevProgress = computeLessonProgress(lessons[idx - 1], userWords);
      return prevProgress.percentage >= MASTERY.unlockThreshold ? [...unlocked, lesson.meta.id] : unlocked;
    },
    [],
  );

export const findCurrentLessonId = (
  lessons: Lesson[],
  userWords: Record<string, WordStats>,
): string => {
  const firstIncomplete = lessons.find(
    (lesson) => !computeLessonProgress(lesson, userWords).isComplete,
  );
  return firstIncomplete?.meta.id ?? lessons[lessons.length - 1]?.meta.id ?? "";
};

// --- Overall Stats ---

export type OverallStats = {
  totalWords: number;
  masteredWords: number;
  learningWords: number;
  strugglingWords: number;
  overallAccuracy: number;
  totalPhrases: number;
  masteredPhrases: number;
};

export const computeOverallStats = (
  userWords: Record<string, WordStats>,
): OverallStats => {
  const wordEntries = Object.entries(userWords).filter(([k]) => isWordKey(k)).map(([, v]) => v);
  const phraseEntries = Object.entries(userWords).filter(([k]) => isPhraseKey(k)).map(([, v]) => v);

  const wordClassified = wordEntries.map((s) => classifyWord(s));
  const totalShown = wordEntries.reduce((sum, s) => sum + s.correct + s.incorrect, 0);
  const totalCorrect = wordEntries.reduce((sum, s) => sum + s.correct, 0);

  return {
    totalWords: wordEntries.length,
    masteredWords: wordClassified.filter((c) => c === "mastered").length,
    learningWords: wordClassified.filter((c) => c === "learning").length,
    strugglingWords: wordClassified.filter((c) => c === "struggling").length,
    overallAccuracy: totalShown > 0 ? totalCorrect / totalShown : 0,
    totalPhrases: phraseEntries.length,
    masteredPhrases: phraseEntries.filter((s) => classifyWord(s) === "mastered").length,
  };
};
