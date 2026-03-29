import { useEffect, useRef } from "react";

import { useAuth } from "../../context/useAuth";
import { useGuestProgress, readGuestData } from "./use-guest-progress";
import { useProgressSync } from "./use-progress-sync";

import type { WordStats, DailySession, StreakInfo } from "../../context/auth";
import type { WordResultMap } from "../../exercise/WordMatch/types";

export type ProgressState = {
  words: Record<string, WordStats>;
  dailySessions: Record<string, DailySession>;
  streak: StreakInfo | null;
  syncBatch: (wordResults: WordResultMap, durationSeconds: number) => void;
  isAuthenticated: boolean;
};

export const useProgress = (): ProgressState => {
  const { auth } = useAuth();
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
    syncProgress({ wordResults, durationSeconds: totalDuration }).then(() => guest.clear());
  }, [auth.status, syncProgress, guest]);

  // React Compiler handles memoization — no manual useCallback needed
  const syncBatch = (wordResults: WordResultMap, durationSeconds: number) => {
    if (auth.status === "authenticated") {
      syncProgress({ wordResults, durationSeconds });
    } else {
      guest.syncBatch(wordResults, durationSeconds);
    }
  };

  if (auth.status === "authenticated") {
    return {
      words: auth.words,
      dailySessions: auth.dailySessions,
      streak: auth.streak,
      syncBatch,
      isAuthenticated: true,
    };
  }

  return {
    words: guest.words,
    dailySessions: guest.dailySessions,
    streak: null,
    syncBatch,
    isAuthenticated: false,
  };
};
