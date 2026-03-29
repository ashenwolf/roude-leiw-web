import { useCallback } from "react";

import { useAuth } from "../../context/useAuth.ts";

import type { WordResultMap } from "../../exercise/WordMatch/types.ts";

type SyncPayload = {
  wordResults: WordResultMap;
  durationSeconds: number;
};

const toApiFormat = (wordResults: WordResultMap) =>
  Object.entries(wordResults).map(([key, stats]) => ({ key, ...stats }));

export const useProgressSync = () => {
  const { auth } = useAuth();

  const syncProgress = useCallback(
    async ({ wordResults, durationSeconds }: SyncPayload) => {
      if (auth.status !== "authenticated") return;

      const today = new Date().toISOString().slice(0, 10);

      await fetch("/api/progress/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wordResults: toApiFormat(wordResults),
          durationSeconds,
          date: today,
        }),
      });
    },
    [auth.status],
  );

  return { syncProgress };
};
