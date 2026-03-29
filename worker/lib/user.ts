import type { UserData, WordResult, DailySession, StreakInfo } from "../types.ts";

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

export const createNewUser = (profile: UserData["profile"]): UserData => ({
  profile,
  words: {},
  dailySessions: {},
});

/** Merge batch word results into user's cumulative word stats. */
export const mergeWordResults = (
  existingWords: UserData["words"],
  wordResults: WordResult[],
): UserData["words"] =>
  wordResults.reduce((words, result) => {
    const existing = words[result.key] ?? { shown: 0, correct: 0, incorrect: 0 };
    return {
      ...words,
      [result.key]: {
        shown: existing.shown + result.shown,
        correct: existing.correct + result.correct,
        incorrect: existing.incorrect + result.incorrect,
      },
    };
  }, { ...existingWords });

/** Merge batch stats into the daily session for the given date. */
export const mergeDailySession = (
  existingSessions: UserData["dailySessions"],
  date: string,
  durationSeconds: number,
  wordResults: WordResult[],
): UserData["dailySessions"] => {
  const existing = existingSessions[date] ?? { totalPairs: 0, durationSeconds: 0, correctMatches: 0, incorrectMatches: 0 };
  const totals = wordResults.reduce(
    (acc, r) => ({
      totalPairs: acc.totalPairs + r.shown,
      correctMatches: acc.correctMatches + r.correct,
      incorrectMatches: acc.incorrectMatches + r.incorrect,
    }),
    { totalPairs: 0, correctMatches: 0, incorrectMatches: 0 },
  );

  return {
    ...existingSessions,
    [date]: {
      totalPairs: existing.totalPairs + totals.totalPairs,
      durationSeconds: existing.durationSeconds + durationSeconds,
      correctMatches: existing.correctMatches + totals.correctMatches,
      incorrectMatches: existing.incorrectMatches + totals.incorrectMatches,
    } satisfies DailySession,
  };
};

// --- Streak computation (derived from dailySessions keys) ---

const toMs = (dateStr: string) => new Date(dateStr + "T00:00:00Z").getTime();
const DAY_MS = 86_400_000;

const isConsecutive = (a: string, b: string) => toMs(b) - toMs(a) === DAY_MS;

const prevDay = (dateStr: string) =>
  new Date(toMs(dateStr) - DAY_MS).toISOString().slice(0, 10);

/** Compute streak info from dailySessions keys. Pure, no stored state. */
export const computeStreak = (dailySessions: UserData["dailySessions"], today: string): StreakInfo => {
  const dates = Object.keys(dailySessions).sort();
  if (dates.length === 0) return { current: 0, longest: 0 };

  // Longest streak: fold over sorted dates, tracking run length
  const longest = dates.slice(1).reduce(
    (acc, date, i) => {
      const run = isConsecutive(dates[i], date) ? acc.run + 1 : 1;
      return { run, max: Math.max(acc.max, run) };
    },
    { run: 1, max: 1 },
  ).max;

  // Current streak: unfold backwards from today
  const lastDate = dates[dates.length - 1];
  const hasToday = lastDate === today;
  const hasYesterday = !hasToday && isConsecutive(lastDate, today);
  if (!hasToday && !hasYesterday) return { current: 0, longest };

  const sessionSet = new Set(dates);
  const countBack = (date: string, count: number): number =>
    sessionSet.has(date) ? countBack(prevDay(date), count + 1) : count;

  const current = countBack(hasToday ? prevDay(today) : lastDate, hasToday ? 1 : 0);

  return { current, longest: Math.max(longest, current) };
};
