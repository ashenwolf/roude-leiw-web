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
  /**
   * Lesson ids the user has ever unlocked. Sticky — see Architecture Reference
   * > Unlock rule in CLAUDE.md.
   */
  unlockedLessons: string[];
  syncBatch: (
    wordResults: WordResultMap,
    durationSeconds: number,
    newlyUnlockedLessons?: string[],
  ) => void;
  isAuthenticated: boolean;
};

export const useProgress = (): ProgressState => {
  const { auth, applyStatsDelta } = useAuth();
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
      durationSeconds: totalDuration,
      newlyUnlockedLessons: guestData.unlockedLessons ?? [],
    }).then(() => guest.clear());
  }, [auth.status, syncProgress, guest]);

  // React Compiler handles memoization — no manual useCallback needed
  const syncBatch = (
    wordResults: WordResultMap,
    durationSeconds: number,
    newlyUnlockedLessons: string[] = [],
  ) => {
    if (auth.status === "authenticated") {
      const today = new Date().toISOString().slice(0, 10);
      // Apply locally first so Home re-renders immediately without a page reload.
      // The POST is fire-and-forget; the local merge is byte-identical to the server merge.
      applyStatsDelta(wordResults, durationSeconds, today, newlyUnlockedLessons);
      syncProgress({ wordResults, durationSeconds, newlyUnlockedLessons });
    } else {
      guest.syncBatch(wordResults, durationSeconds, newlyUnlockedLessons);
    }
  };

  const guestStreak = useMemo(
    () => computeStreak(guest.dailySessions, new Date().toISOString().slice(0, 10)),
    [guest.dailySessions],
  );

  if (auth.status === "authenticated") {
    return {
      words: auth.words,
      dailySessions: auth.dailySessions,
      streak: auth.streak,
      unlockedLessons: auth.unlockedLessons,
      syncBatch,
      isAuthenticated: true,
    };
  }

  return {
    words: guest.words,
    dailySessions: guest.dailySessions,
    streak: guestStreak,
    unlockedLessons: guest.unlockedLessons,
    syncBatch,
    isAuthenticated: false,
  };
};
