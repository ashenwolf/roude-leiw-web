import { useCallback, useSyncExternalStore } from "react";

import type { WordStats, DailySession } from "../../context/auth";
import type { WordResultMap } from "../../exercise/WordMatch/types";

const STORAGE_KEY = "roude-leiw-guest";

type GuestData = {
  words: Record<string, WordStats>;
  dailySessions: Record<string, DailySession>;
};

const EMPTY: GuestData = { words: {}, dailySessions: {} };

// ── Pure merge functions ────────────────────────────────────────────────

const mergeWords = (
  existing: Record<string, WordStats>,
  results: WordResultMap,
): Record<string, WordStats> =>
  Object.entries(results).reduce(
    (acc, [key, delta]) => ({
      ...acc,
      [key]: {
        shown: (acc[key]?.shown ?? 0) + delta.shown,
        correct: (acc[key]?.correct ?? 0) + delta.correct,
        incorrect: (acc[key]?.incorrect ?? 0) + delta.incorrect,
      },
    }),
    { ...existing },
  );

const mergeDailySession = (
  existing: Record<string, DailySession>,
  date: string,
  results: WordResultMap,
  durationSeconds: number,
): Record<string, DailySession> => {
  const prev = existing[date] ?? { totalPairs: 0, durationSeconds: 0, correctMatches: 0, incorrectMatches: 0 };
  const batchStats = Object.values(results).reduce(
    (acc, r) => ({
      totalPairs: acc.totalPairs + r.shown,
      correctMatches: acc.correctMatches + r.correct,
      incorrectMatches: acc.incorrectMatches + r.incorrect,
    }),
    { totalPairs: 0, correctMatches: 0, incorrectMatches: 0 },
  );

  return {
    ...existing,
    [date]: {
      totalPairs: prev.totalPairs + batchStats.totalPairs,
      durationSeconds: prev.durationSeconds + durationSeconds,
      correctMatches: prev.correctMatches + batchStats.correctMatches,
      incorrectMatches: prev.incorrectMatches + batchStats.incorrectMatches,
    },
  };
};

// ── External store backed by localStorage ───────────────────────────────
// Writes go directly to localStorage without triggering React re-renders.
// React reads via useSyncExternalStore — re-renders only on subscribe notification.

const listeners = new Set<() => void>();

const notifyListeners = () => listeners.forEach((fn) => fn());

const readStorage = (): GuestData => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as GuestData) : EMPTY;
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
        state.data = raw ? (JSON.parse(raw) as GuestData) : EMPTY;
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
const syncBatchToStorage = (wordResults: WordResultMap, durationSeconds: number): void => {
  const today = new Date().toISOString().slice(0, 10);
  const prev = readStorage();
  const updated: GuestData = {
    words: mergeWords(prev.words, wordResults),
    dailySessions: mergeDailySession(prev.dailySessions, today, wordResults, durationSeconds),
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

  const syncBatch = useCallback((wordResults: WordResultMap, durationSeconds: number) => {
    syncBatchToStorage(wordResults, durationSeconds);
  }, []);

  const clear = useCallback(() => {
    clearStorage();
  }, []);

  return { words: data.words, dailySessions: data.dailySessions, syncBatch, clear };
};

export const readGuestData = readStorage;
