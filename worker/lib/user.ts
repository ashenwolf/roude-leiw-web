import { computeStreak } from "../../src/lib/streak.ts";

import type { UserData, WordResult, DailySession } from "../types.ts";

// --- KV operations ---

export const getUser = async (kv: KVNamespace, userId: string) => {
  const raw = await kv.get(`user:${userId}`);
  return raw ? (JSON.parse(raw) as UserData) : null;
};

export const saveUser = async (kv: KVNamespace, userData: UserData) => {
  await kv.put(`user:${userData.profile.id}`, JSON.stringify(userData));
};

export const findUserIdByEmail = async (kv: KVNamespace, email: string) =>
  kv.get(`email:${email}`);

export const linkEmailToUser = async (kv: KVNamespace, email: string, userId: string) => {
  await kv.put(`email:${email}`, userId);
};

// --- Pure data transforms ---

/**
 * Caps prevent unbounded growth of the per-user KV blob (25 MB hard limit).
 * Numbers chosen to comfortably exceed legitimate usage:
 *   - 10k words = ~250x typical A1–C2 vocabulary
 *   - 1825 daily sessions = 5 years of daily play
 */
export const MAX_WORD_KEYS = 10_000;
export const MAX_DAILY_SESSIONS = 365 * 5;

export const createNewUser = (profile: UserData["profile"]): UserData => ({
  profile,
  words: {},
  dailySessions: {},
});

/**
 * Merge batch word results into user's cumulative word stats.
 *
 * If the existing map has reached MAX_WORD_KEYS, results for *new* keys are dropped;
 * results for already-tracked keys still accumulate. This keeps legitimate data
 * stable while preventing an attacker from inflating the blob with garbage keys.
 */
export const mergeWordResults = (
  existingWords: UserData["words"],
  wordResults: WordResult[],
): UserData["words"] =>
  wordResults.reduce((words, result) => {
    const existing = words[result.key];
    if (!existing && Object.keys(words).length >= MAX_WORD_KEYS) return words;
    const base = existing ?? { shown: 0, correct: 0, incorrect: 0 };
    return {
      ...words,
      [result.key]: {
        shown: base.shown + result.shown,
        correct: base.correct + result.correct,
        incorrect: base.incorrect + result.incorrect,
      },
    };
  }, { ...existingWords });

/**
 * Merge batch stats into the daily session for the given date.
 *
 * If the resulting map would exceed MAX_DAILY_SESSIONS, the oldest dates are dropped
 * (date keys sort lexicographically as YYYY-MM-DD, so lexical order == chronological).
 */
export const mergeDailySession = (
  existingSessions: UserData["dailySessions"],
  date: string,
  durationSeconds: number,
  wordResults: WordResult[],
): UserData["dailySessions"] => {
  const existing = existingSessions[date] ?? { totalItems: 0, durationSeconds: 0, correct: 0, incorrect: 0 };
  const totals = wordResults.reduce(
    (acc, r) => ({
      totalItems: acc.totalItems + r.shown,
      correct: acc.correct + r.correct,
      incorrect: acc.incorrect + r.incorrect,
    }),
    { totalItems: 0, correct: 0, incorrect: 0 },
  );

  const merged: UserData["dailySessions"] = {
    ...existingSessions,
    [date]: {
      totalItems: existing.totalItems + totals.totalItems,
      durationSeconds: existing.durationSeconds + durationSeconds,
      correct: existing.correct + totals.correct,
      incorrect: existing.incorrect + totals.incorrect,
    } satisfies DailySession,
  };

  const keys = Object.keys(merged);
  if (keys.length <= MAX_DAILY_SESSIONS) return merged;

  const kept = keys.sort().slice(-MAX_DAILY_SESSIONS);
  return Object.fromEntries(kept.map((k) => [k, merged[k]]));
};

// computeStreak is now imported from src/lib/streak.ts (shared with client).
// Re-export so existing call sites in this module continue to work.
export { computeStreak };
