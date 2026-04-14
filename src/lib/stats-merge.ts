import type { WordStats, DailySession } from "../context/auth";

/**
 * Merge word stats updates into an existing map.
 * Both existing and updates use the same key format (e.g. "{lu}|{en}").
 */
export const mergeWordStats = (
  existing: Record<string, WordStats>,
  updates: Record<string, WordStats>,
): Record<string, WordStats> =>
  Object.entries(updates).reduce(
    (acc, [key, delta]) => ({
      ...acc,
      [key]: {
        shown: (acc[key]?.shown ?? 0) + delta.shown,
        correct: (acc[key]?.correct ?? 0) + delta.correct,
        incorrect: (acc[key]?.incorrect ?? 0) + delta.incorrect,
      },
    }),
    { ...existing },
  );

/**
 * Merge a batch of word stats into the daily session for the given date.
 * stats keys are the same format as word result keys.
 */
export const mergeDailySession = (
  existing: Record<string, DailySession>,
  date: string,
  stats: Record<string, WordStats>,
  durationSeconds: number,
): Record<string, DailySession> => {
  const prev = existing[date] ?? { totalItems: 0, durationSeconds: 0, correct: 0, incorrect: 0 };
  const batchTotals = Object.values(stats).reduce(
    (acc, r) => ({
      totalItems: acc.totalItems + r.shown,
      correct: acc.correct + r.correct,
      incorrect: acc.incorrect + r.incorrect,
    }),
    { totalItems: 0, correct: 0, incorrect: 0 },
  );

  return {
    ...existing,
    [date]: {
      totalItems: prev.totalItems + batchTotals.totalItems,
      durationSeconds: prev.durationSeconds + durationSeconds,
      correct: prev.correct + batchTotals.correct,
      incorrect: prev.incorrect + batchTotals.incorrect,
    },
  };
};
