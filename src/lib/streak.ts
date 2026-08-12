/**
 * Shared streak computation — imported by both the worker and the client.
 * Must produce byte-identical results on both sides; do NOT duplicate this logic.
 * See .claude/reference/mode-specs.md > Post-Session refresh invariant.
 */

import type { DailySession, StreakInfo } from "../context/auth";

const toMs = (dateStr: string) => new Date(dateStr + "T00:00:00Z").getTime();
const DAY_MS = 86_400_000;
const isConsecutive = (a: string, b: string) => toMs(b) - toMs(a) === DAY_MS;
const prevDay = (dateStr: string) =>
  new Date(toMs(dateStr) - DAY_MS).toISOString().slice(0, 10);

/** Compute streak info from dailySessions keys. Pure, no stored state. */
export const computeStreak = (
  dailySessions: Record<string, DailySession>,
  today: string,
): StreakInfo => {
  const dates = Object.keys(dailySessions).sort();
  if (dates.length === 0) return { current: 0, longest: 0 };

  const longest = dates.slice(1).reduce(
    (acc, date, i) => {
      const run = isConsecutive(dates[i], date) ? acc.run + 1 : 1;
      return { run, max: Math.max(acc.max, run) };
    },
    { run: 1, max: 1 },
  ).max;

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
