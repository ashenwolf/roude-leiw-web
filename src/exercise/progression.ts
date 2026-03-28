import type { Lesson } from "./letz-parser";
import type { WordStats } from "../context/auth";

// --- Mastery Thresholds ---

export const MASTERY = {
  minShown: 5,
  minAccuracy: 0.8,
  strugglingMaxAccuracy: 0.6,
  strugglingMinShown: 3,
} as const;

// --- Word Classification ---

export type WordMastery = "unseen" | "learning" | "struggling" | "mastered";

const accuracy = (s: WordStats): number =>
  s.correct + s.incorrect > 0 ? s.correct / (s.correct + s.incorrect) : 0;

export const classifyWord = (stats: WordStats | undefined): WordMastery => {
  if (!stats || stats.shown === 0) return "unseen";
  if (stats.shown >= MASTERY.minShown && accuracy(stats) >= MASTERY.minAccuracy) return "mastered";
  if (stats.shown >= MASTERY.strugglingMinShown && accuracy(stats) < MASTERY.strugglingMaxAccuracy) return "struggling";
  return "learning";
};

export const wordKey = (lu: string, en: string): string => `${lu}|${en}`;

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
  const total = lesson.entries.length;
  const mastered = lesson.entries.filter(
    (e) => classifyWord(userWords[wordKey(e.lu, e.en)]) === "mastered",
  ).length;
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
      const prevComplete = computeLessonProgress(lessons[idx - 1], userWords).isComplete;
      return prevComplete ? [...unlocked, lesson.meta.id] : unlocked;
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
};

export const computeOverallStats = (
  userWords: Record<string, WordStats>,
): OverallStats => {
  const entries = Object.values(userWords);
  const classified = entries.map((s) => classifyWord(s));
  const totalShown = entries.reduce((sum, s) => sum + s.correct + s.incorrect, 0);
  const totalCorrect = entries.reduce((sum, s) => sum + s.correct, 0);

  return {
    totalWords: entries.length,
    masteredWords: classified.filter((c) => c === "mastered").length,
    learningWords: classified.filter((c) => c === "learning").length,
    strugglingWords: classified.filter((c) => c === "struggling").length,
    overallAccuracy: totalShown > 0 ? totalCorrect / totalShown : 0,
  };
};
