import type { WordStats } from "../context/auth";
import { classifyWord } from "./progression";

// --- XP Computation ---
// Flat XP per word based on mastery state (not raw counts) to keep totals sane

const XP_PER_MASTERY: Record<string, number> = {
  unseen: 0,
  learning: 10,
  struggling: 5,
  mastered: 100,
};

/**
 * Sum of per-element XP. When `validKeys` is provided, keys outside the set
 * (stats for elements no longer in any lesson) do not earn XP.
 */
export const computeXP = (
  words: Record<string, WordStats>,
  validKeys?: ReadonlySet<string>,
): number =>
  Object.entries(words).reduce(
    (xp, [key, stats]) =>
      validKeys && !validKeys.has(key)
        ? xp
        : xp + (XP_PER_MASTERY[classifyWord(stats)] ?? 0),
    0,
  );

// --- Player Levels ---

export type PlayerLevel = {
  level: number;
  title: string;
  xpRequired: number;
};

const XP_LEVELS: ReadonlyArray<PlayerLevel> = [
  { level: 1, title: "Beginner", xpRequired: 0 },
  { level: 2, title: "Explorer", xpRequired: 200 },
  { level: 3, title: "Learner", xpRequired: 500 },
  { level: 4, title: "Practitioner", xpRequired: 1000 },
  { level: 5, title: "Scholar", xpRequired: 2000 },
  { level: 6, title: "Adept", xpRequired: 4000 },
  { level: 7, title: "Expert", xpRequired: 7000 },
  { level: 8, title: "Master", xpRequired: 12000 },
] as const;

export type PlayerLevelInfo = {
  current: PlayerLevel;
  next: PlayerLevel | null;
  xp: number;
  xpInLevel: number;
  xpToNext: number;
  progressInLevel: number;
};

export const computePlayerLevel = (xp: number): PlayerLevelInfo => {
  const currentIdx = XP_LEVELS.reduce(
    (best, lvl, idx) => (xp >= lvl.xpRequired ? idx : best),
    0,
  );
  const current = XP_LEVELS[currentIdx];
  const next = XP_LEVELS[currentIdx + 1] ?? null;
  const xpInLevel = xp - current.xpRequired;
  const xpToNext = next ? next.xpRequired - current.xpRequired : 0;
  const progressInLevel = xpToNext > 0 ? xpInLevel / xpToNext : 1;

  return { current, next, xp, xpInLevel, xpToNext, progressInLevel };
};
