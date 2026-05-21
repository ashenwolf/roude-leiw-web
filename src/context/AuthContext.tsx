import { useState, useEffect, useCallback } from "react";
import { usePostHog } from "@posthog/react";

import { AuthContext } from "./auth.ts";
import { computeStreak } from "../lib/streak.ts";
import { mergeWordStats, mergeDailySession } from "../lib/stats-merge.ts";

import type { ReactNode } from "react";
import type { AuthState, WordStats } from "./auth.ts";

const fetchMe = async (): Promise<AuthState> => {
  const response = await fetch("/api/auth/me");
  if (!response.ok) return { status: "unauthenticated" };

  const data = await response.json();
  return data.user
    ? {
        status: "authenticated",
        user: data.user,
        words: data.words,
        dailySessions: data.dailySessions,
        streak: data.streak,
        unlockedLessons: Array.isArray(data.unlockedLessons) ? data.unlockedLessons : [],
        totalXP: typeof data.totalXP === "number" ? data.totalXP : 0,
      }
    : { status: "unauthenticated" };
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });
  const posthog = usePostHog();

  useEffect(() => {
    fetchMe().then(setAuth);
  }, []);

  // Sync identity with PostHog whenever auth state resolves
  useEffect(() => {
    if (auth.status === "authenticated") {
      posthog?.identify(auth.user.id, {
        email: auth.user.email,
        name: auth.user.name,
      });
    }
  }, [posthog, auth]);

  const login = useCallback(() => {
    window.location.href = "/api/auth/google";
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    posthog?.reset();
    setAuth({ status: "unauthenticated" });
  }, [posthog]);

  const applyStatsDelta = useCallback(
    (
      wordResults: Record<string, WordStats>,
      durationSeconds: number,
      date: string,
      newlyUnlockedLessons: string[] = [],
    ) => {
      setAuth((prev) => {
        if (prev.status !== "authenticated") return prev;
        const newWords = mergeWordStats(prev.words, wordResults);
        const newDailySessions = mergeDailySession(prev.dailySessions, date, wordResults, durationSeconds);
        const newStreak = computeStreak(newDailySessions, date);
        const unlockedLessons = newlyUnlockedLessons.length === 0
          ? prev.unlockedLessons
          : [...new Set([...prev.unlockedLessons, ...newlyUnlockedLessons])];
        return { ...prev, words: newWords, dailySessions: newDailySessions, streak: newStreak, unlockedLessons };
      });
    },
    [],
  );

  const applyXPDelta = useCallback(
    (xpEarned: number, date: string) => {
      setAuth((prev) => {
        if (prev.status !== "authenticated") return prev;
        const prevDay = prev.dailySessions[date] ?? { totalItems: 0, durationSeconds: 0, correct: 0, incorrect: 0, xp: 0 };
        const newDailySessions = {
          ...prev.dailySessions,
          [date]: { ...prevDay, xp: (prevDay.xp ?? 0) + xpEarned },
        };
        return { ...prev, totalXP: prev.totalXP + xpEarned, dailySessions: newDailySessions };
      });
    },
    [],
  );

  return (
    <AuthContext.Provider value={{ auth, login, logout, applyStatsDelta, applyXPDelta }}>
      {children}
    </AuthContext.Provider>
  );
};
