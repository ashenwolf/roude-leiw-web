import { useCallback, useSyncExternalStore } from "react";

import { mergeWordStats, mergeDailySession } from "../../lib/stats-merge";

import type { WordStats, DailySession } from "../../context/auth";
import type { WordResultMap } from "../../exercise/WordMatch/types";

const STORAGE_KEY = "roude-leiw-guest";

type GuestData = {
  words: Record<string, WordStats>;
  dailySessions: Record<string, DailySession>;
  unlockedLessons?: string[];
};

const EMPTY: GuestData = { words: {}, dailySessions: {}, unlockedLessons: [] };

/** Normalize older blobs that predate the unlockedLessons field. */
const normalize = (data: GuestData): GuestData =>
  data.unlockedLessons === undefined ? { ...data, unlockedLessons: [] } : data;

// ── External store backed by localStorage ───────────────────────────────
// Writes go directly to localStorage without triggering React re-renders.
// React reads via useSyncExternalStore — re-renders only on subscribe notification.

const listeners = new Set<() => void>();

const notifyListeners = () => listeners.forEach((fn) => fn());

const readStorage = (): GuestData => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalize(JSON.parse(raw) as GuestData) : EMPTY;
  } catch {
    return EMPTY;
  }
};

// Snapshot cache — encapsulated mutable state for useSyncExternalStore
const cache = (() => {
  const state = { raw: null as string | null, data: EMPTY as GuestData };
  return {
    get: (): GuestData => {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw !== state.raw) {
        state.raw = raw;
        state.data = raw ? normalize(JSON.parse(raw) as GuestData) : EMPTY;
      }
      return state.data;
    },
    set: (raw: string | null, data: GuestData) => {
      state.raw = raw;
      state.data = data;
    },
    clear: () => {
      state.raw = null;
      state.data = EMPTY;
    },
  };
})();

const getSnapshot = (): GuestData => cache.get();

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// ── Public API ──────────────────────────────────────────────────────────

/** Fire-and-forget: writes to localStorage, does NOT trigger React re-render */
const syncBatchToStorage = (
  wordResults: WordResultMap,
  durationSeconds: number,
  newlyUnlockedLessons: string[] = [],
  xpEarned = 0,
): void => {
  const today = new Date().toISOString().slice(0, 10);
  const prev = readStorage();
  const updated: GuestData = {
    words: mergeWordStats(prev.words, wordResults),
    dailySessions: mergeDailySession(prev.dailySessions, today, wordResults, durationSeconds, xpEarned),
    unlockedLessons:
      newlyUnlockedLessons.length === 0
        ? prev.unlockedLessons ?? []
        : [...new Set([...(prev.unlockedLessons ?? []), ...newlyUnlockedLessons])],
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  cache.set(localStorage.getItem(STORAGE_KEY), updated);
};

/** Award session XP — updates the daily xp counter for today. */
const awardXPToStorage = (xpEarned: number): void => {
  const today = new Date().toISOString().slice(0, 10);
  const prev = readStorage();
  const prevDay = prev.dailySessions[today] ?? { totalItems: 0, durationSeconds: 0, correct: 0, incorrect: 0, xp: 0 };
  const updated: GuestData = {
    ...prev,
    dailySessions: {
      ...prev.dailySessions,
      [today]: { ...prevDay, xp: (prevDay.xp ?? 0) + xpEarned },
    },
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  cache.set(localStorage.getItem(STORAGE_KEY), updated);
};

const clearStorage = (): void => {
  localStorage.removeItem(STORAGE_KEY);
  cache.clear();
  notifyListeners();
};

/** Notify React to re-read localStorage (call on navigation, session end) */
export const refreshGuestProgress = notifyListeners;

export const useGuestProgress = () => {
  const data = useSyncExternalStore(subscribe, getSnapshot);

  const syncBatch = useCallback(
    (wordResults: WordResultMap, durationSeconds: number, newlyUnlockedLessons: string[] = [], xpEarned = 0) => {
      syncBatchToStorage(wordResults, durationSeconds, newlyUnlockedLessons, xpEarned);
    },
    [],
  );

  const awardXP = useCallback((xpEarned: number) => {
    awardXPToStorage(xpEarned);
  }, []);

  const clear = useCallback(() => {
    clearStorage();
  }, []);

  // totalXP derived from daily sessions (guests have no server-side totalXP field).
  const totalXP = Object.values(data.dailySessions).reduce(
    (sum, s) => sum + (s.xp ?? 0),
    0,
  );

  return {
    words: data.words,
    dailySessions: data.dailySessions,
    unlockedLessons: data.unlockedLessons ?? [],
    totalXP,
    syncBatch,
    awardXP,
    clear,
  };
};

export const readGuestData = readStorage;
