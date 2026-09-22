/**
 * Sync bounds — the client-side mirror of `worker/lib/validators.ts`, and the
 * live-Session duration clamp.
 *
 * Why this is tested as its own unit: `validateProgressSync` rejects the WHOLE
 * batch when any field is out of bounds, so an unclamped `durationSeconds` does
 * not degrade the duration — it silently loses every word result in that
 * Session. `useActivityTimer` has no ceiling (up to 30s of credited think time
 * per interaction, summed over every slot including re-queued corrections), so a
 * long or low-accuracy Session can genuinely exceed an hour.
 */
import { describe, it, expect } from "vitest";

import { SYNC_BOUNDS, clampSyncDuration } from "../../../src/persistence/sync-bounds.ts";
import { validateProgressSync } from "../../../worker/lib/validators.ts";

describe("SYNC_BOUNDS mirrors the server validator", () => {
  // A payload is accepted at the bound and rejected one past it — which pins the
  // mirrored constants to the real validator rather than to a second copy of the
  // numbers. If the worker's bound changes, one of these fails.
  const body = (overrides: Record<string, unknown>) => ({
    date: "2026-09-22",
    durationSeconds: 1,
    wordResults: [],
    ...overrides,
  });

  const result = (i: number) => ({ key: `lu${i}|en${i}`, shown: 1, correct: 1, incorrect: 0 });

  it("maxDurationSeconds is the largest accepted duration", () => {
    expect(validateProgressSync(body({ durationSeconds: SYNC_BOUNDS.maxDurationSeconds }), "2026-09-22").ok).toBe(true);
    expect(validateProgressSync(body({ durationSeconds: SYNC_BOUNDS.maxDurationSeconds + 1 }), "2026-09-22").ok).toBe(false);
  });

  it("maxWordResults is the largest accepted batch size", () => {
    const atBound = Array.from({ length: SYNC_BOUNDS.maxWordResults }, (_, i) => result(i));
    expect(validateProgressSync(body({ wordResults: atBound }), "2026-09-22").ok).toBe(true);
    expect(validateProgressSync(body({ wordResults: [...atBound, result(999)] }), "2026-09-22").ok).toBe(false);
  });

  it("maxCountPerResult is the largest accepted per-key counter", () => {
    const max = SYNC_BOUNDS.maxCountPerResult;
    expect(validateProgressSync(body({ wordResults: [{ key: "a|b", shown: max, correct: max, incorrect: max }] }), "2026-09-22").ok).toBe(true);
    expect(validateProgressSync(body({ wordResults: [{ key: "a|b", shown: max + 1, correct: 0, incorrect: 0 }] }), "2026-09-22").ok).toBe(false);
  });

  it("maxXP is the largest accepted xpEarned", () => {
    expect(validateProgressSync(body({ xpEarned: SYNC_BOUNDS.maxXP }), "2026-09-22").ok).toBe(true);
    expect(validateProgressSync(body({ xpEarned: SYNC_BOUNDS.maxXP + 1 }), "2026-09-22").ok).toBe(false);
  });
});

describe("clampSyncDuration", () => {
  it("passes an in-bounds duration through, rounded to an integer", () => {
    expect(clampSyncDuration(0)).toBe(0);
    expect(clampSyncDuration(42.4)).toBe(42);
    expect(clampSyncDuration(42.6)).toBe(43);
    expect(clampSyncDuration(SYNC_BOUNDS.maxDurationSeconds)).toBe(SYNC_BOUNDS.maxDurationSeconds);
  });

  it("clamps an over-long Session to the server's bound instead of failing the batch", () => {
    // ~2.5h of credited think time: reachable in a low-accuracy Session whose
    // failed slots re-queue into the correction Block.
    expect(clampSyncDuration(9_000)).toBe(SYNC_BOUNDS.maxDurationSeconds);
  });

  it("never emits a negative duration", () => {
    expect(clampSyncDuration(-1)).toBe(0);
  });

  it("produces a value the server accepts, for any input", () => {
    [-5, 0, 0.4, 3_599.6, 3_600, 3_601, 86_400, 1e9].forEach((input) => {
      const value = validateProgressSync(
        { date: "2026-09-22", durationSeconds: clampSyncDuration(input), wordResults: [] },
        "2026-09-22",
      );
      expect(value.ok, `durationSeconds from ${input}`).toBe(true);
    });
  });
});
