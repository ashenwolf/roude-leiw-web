import { useCallback } from "react";

import { useAuth } from "../../context/useAuth.ts";

import type { WordResultMap } from "../../exercise/WordMatch/types.ts";

type SyncPayload = {
  wordResults: WordResultMap;
  durationSeconds: number;
  newlyUnlockedLessons?: string[];
  xpEarned?: number;
};

const toApiFormat = (wordResults: WordResultMap) =>
  Object.entries(wordResults).map(([key, stats]) => ({ key, ...stats }));

export const useProgressSync = () => {
  const { auth } = useAuth();

  const syncProgress = useCallback(
    async ({ wordResults, durationSeconds, newlyUnlockedLessons, xpEarned }: SyncPayload) => {
      if (auth.status !== "authenticated") return;

      const today = new Date().toISOString().slice(0, 10);

      await fetch("/api/progress/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wordResults: toApiFormat(wordResults),
          durationSeconds,
          date: today,
          xpEarned: xpEarned ?? 0,
          newlyUnlockedLessons: newlyUnlockedLessons ?? [],
        }),
      });
    },
    [auth.status],
  );

  return { syncProgress };
};
