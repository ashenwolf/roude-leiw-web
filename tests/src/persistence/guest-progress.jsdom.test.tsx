/**
 * Reproduces: after exercise ends and user returns to home, guest progress is not updated.
 *
 * The bug: AppExercise calls syncBatch (writes to localStorage + cache, no listeners notified).
 * AppHome mounts fresh — its useSyncExternalStore should pick up the updated snapshot.
 */

import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useGuestProgress, refreshGuestProgress } from "../../../src/persistence/hooks/use-guest-progress";

const WORD_KEY = "Moien|hello";
const WORD_RESULTS = { [WORD_KEY]: { shown: 5, correct: 4, incorrect: 1 } };
const STORAGE_KEY = "roude-leiw-guest";

// Node.js 22 adds an experimental globalThis.localStorage that lacks clear/removeItem.
// Replace it with a compliant in-memory implementation for these tests.
const store: Record<string, string> = {};
const lsImpl: Storage = {
  getItem: (key) => store[key] ?? null,
  setItem: (key, value) => { store[key] = String(value); },
  removeItem: (key) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach((k) => { delete store[k]; }); },
  key: (index) => Object.keys(store)[index] ?? null,
  get length() { return Object.keys(store).length; },
};
Object.defineProperty(globalThis, "localStorage", { get: () => lsImpl, configurable: true });

describe("guest progress: home sees updated words after exercise", () => {
  beforeEach(() => localStorage.removeItem(STORAGE_KEY));

  it("fresh hook mount reads words synced by a previous hook instance", () => {
    // --- AppExercise phase ---
    const exercise = renderHook(() => useGuestProgress());

    act(() => {
      exercise.result.current.syncBatch(WORD_RESULTS, 0);
    });

    exercise.unmount(); // simulate navigating away from exercise

    // simulate goHome() calling refreshGuestProgress before navigation
    refreshGuestProgress();

    // --- AppHome phase ---
    const home = renderHook(() => useGuestProgress());

    expect(home.result.current.words[WORD_KEY]).toEqual(WORD_RESULTS[WORD_KEY]);
  });

  it("existing subscriber sees updated words after syncBatch (no notification)", () => {
    // This simulates AppHome being rendered while AppExercise runs in background —
    // or more precisely: AppHome subscribes, then AppExercise syncs without notifying.
    // The subscriber should NOT see the update until refreshGuestProgress is called.
    const home = renderHook(() => useGuestProgress());

    // Initially empty
    expect(home.result.current.words[WORD_KEY]).toBeUndefined();

    // Simulate exercise syncing (no notification fired)
    const exercise = renderHook(() => useGuestProgress());
    act(() => {
      exercise.result.current.syncBatch(WORD_RESULTS, 0);
    });
    exercise.unmount();

    // home has NOT been notified — should still be empty
    expect(home.result.current.words[WORD_KEY]).toBeUndefined();

    // After refreshGuestProgress, home should update
    act(() => refreshGuestProgress());
    expect(home.result.current.words[WORD_KEY]).toEqual(WORD_RESULTS[WORD_KEY]);
  });
});
