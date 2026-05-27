import { useEffect, useMemo, useRef } from "react";

import { useAuth } from "../../context/useAuth";
import { computeStreak } from "../../lib/streak";
import { useGuestProgress, readGuestData } from "./use-guest-progress";
import { useProgressSync } from "./use-progress-sync";

import type { WordStats, DailySession, StreakInfo } from "../../context/auth";
import type { WordResultMap } from "../../exercise/WordMatch/types";

export type ProgressState = {
  words: Record<string, WordStats>;
  dailySessions: Record<string, DailySession>;
  streak: StreakInfo | null;
  unlockedLessons: string[];
  /** Cumulative XP. For auth users this is the server-stored value (immune to
   *  session pruning). For guests it is derived from dailySessions.xp sums. */
  totalXP: number;
  /** XP earned today (for the "today" stat display). */
  todayXP: number;
  syncBatch: (
    wordResults: WordResultMap,
    durationSeconds: number,
    newlyUnlockedLessons?: string[],
    xpEarned?: number,
  ) => void;
  isAuthenticated: boolean;
};

export const useProgress = (): ProgressState => {
  const { auth, applyStatsDelta, applyXPDelta } = useAuth();
  const guest = useGuestProgress();
  const { syncProgress } = useProgressSync();
  const migrationDone = useRef(false);

  // Guest-to-auth migration: one-time on login
  useEffect(() => {
    if (auth.status !== "authenticated" || migrationDone.current) return;
    migrationDone.current = true;

    const guestData = readGuestData();
    if (Object.keys(guestData.words).length === 0) return;

    const wordResults: WordResultMap = Object.fromEntries(
      Object.entries(guestData.words).map(([key, stats]) => [key, stats]),
    );
    const totalDuration = Object.values(guestData.dailySessions).reduce(
      (sum, s) => sum + s.durationSeconds,
      0,
    );
    syncProgress({
      wordResults,
      durationSeconds: Math.round(totalDuration),
      newlyUnlockedLessons: guestData.unlockedLessons ?? [],
    }).then(() => guest.clear());
  }, [auth.status, syncProgress, guest]);

  // React Compiler handles memoization — no manual useCallback needed
  const syncBatch = (
    wordResults: WordResultMap,
    durationSeconds: number,
    newlyUnlockedLessons: string[] = [],
    xpEarned = 0,
  ) => {
    if (auth.status === "authenticated") {
      const today = new Date().toISOString().slice(0, 10);
      applyStatsDelta(wordResults, durationSeconds, today, newlyUnlockedLessons);
      if (xpEarned > 0) applyXPDelta(xpEarned, today);
      syncProgress({ wordResults, durationSeconds, newlyUnlockedLessons, xpEarned });
    } else {
      guest.syncBatch(wordResults, durationSeconds, newlyUnlockedLessons, xpEarned);
    }
  };

  const guestStreak = useMemo(
    () => computeStreak(guest.dailySessions, new Date().toISOString().slice(0, 10)),
    [guest.dailySessions],
  );

  const today = new Date().toISOString().slice(0, 10);

  if (auth.status === "authenticated") {
    return {
      words: auth.words,
      dailySessions: auth.dailySessions,
      streak: auth.streak,
      unlockedLessons: auth.unlockedLessons,
      totalXP: auth.totalXP,
      todayXP: auth.dailySessions[today]?.xp ?? 0,
      syncBatch,
      isAuthenticated: true,
    };
  }

  return {
    words: guest.words,
    dailySessions: guest.dailySessions,
    streak: guestStreak,
    unlockedLessons: guest.unlockedLessons,
    totalXP: guest.totalXP,
    todayXP: guest.dailySessions[today]?.xp ?? 0,
    syncBatch,
    isAuthenticated: false,
  };
};
