import { describe, it, expect } from "vitest";

import { validateProgressSync } from "../../../worker/lib/validators.ts";

const TODAY = "2026-05-11";

const valid = () => ({
  date: TODAY,
  durationSeconds: 30,
  wordResults: [
    { key: "Moien|hi", shown: 2, correct: 1, incorrect: 1 },
    { key: "phrase:en-lu:hello", shown: 1, correct: 1, incorrect: 0 },
  ],
});

describe("validateProgressSync", () => {
  it("accepts a well-formed body", () => {
    const r = validateProgressSync(valid(), TODAY);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.wordResults).toHaveLength(2);
  });

  it("rejects non-object body", () => {
    const r = validateProgressSync(null, TODAY);
    expect(r).toEqual({ ok: false, reason: "body: not an object" });
  });

  it("rejects missing/malformed date", () => {
    expect(validateProgressSync({ ...valid(), date: "" }, TODAY).ok).toBe(false);
    expect(validateProgressSync({ ...valid(), date: "2026-13-01" }, TODAY).ok).toBe(false);
    expect(validateProgressSync({ ...valid(), date: "not-a-date" }, TODAY).ok).toBe(false);
    expect(validateProgressSync({ ...valid(), date: 20260511 }, TODAY).ok).toBe(false);
  });

  it("rejects date outside [today-2, today+1] window", () => {
    expect(validateProgressSync({ ...valid(), date: "2026-05-08" }, TODAY).ok).toBe(false);
    expect(validateProgressSync({ ...valid(), date: "2026-05-13" }, TODAY).ok).toBe(false);
  });

  it("accepts date at window edges", () => {
    expect(validateProgressSync({ ...valid(), date: "2026-05-09" }, TODAY).ok).toBe(true);
    expect(validateProgressSync({ ...valid(), date: "2026-05-12" }, TODAY).ok).toBe(true);
  });

  it("rejects invalid durationSeconds", () => {
    expect(validateProgressSync({ ...valid(), durationSeconds: -1 }, TODAY).ok).toBe(false);
    expect(validateProgressSync({ ...valid(), durationSeconds: 3601 }, TODAY).ok).toBe(false);
    expect(validateProgressSync({ ...valid(), durationSeconds: 1.5 }, TODAY).ok).toBe(false);
    expect(validateProgressSync({ ...valid(), durationSeconds: "30" }, TODAY).ok).toBe(false);
  });

  it("rejects non-array wordResults", () => {
    expect(validateProgressSync({ ...valid(), wordResults: {} }, TODAY).ok).toBe(false);
  });

  it("rejects too-long wordResults array", () => {
    const wordResults = Array.from({ length: 201 }, (_, i) => ({
      key: `Word${i}|word${i}`,
      shown: 1,
      correct: 1,
      incorrect: 0,
    }));
    expect(validateProgressSync({ ...valid(), wordResults }, TODAY).ok).toBe(false);
  });

  it("rejects invalid word key shapes", () => {
    const bad = (key: string) =>
      validateProgressSync({ ...valid(), wordResults: [{ key, shown: 1, correct: 1, incorrect: 0 }] }, TODAY);
    expect(bad("no-pipe").ok).toBe(false);
    expect(bad("a||b").ok).toBe(false);
    expect(bad("a|b|c").ok).toBe(false);
    expect(bad("phrase:xx:foo").ok).toBe(false);          // unknown direction
    expect(bad("phrase:en-lu:" + "x".repeat(65)).ok).toBe(false);
    expect(bad("fill:xx:foo").ok).toBe(false);            // unknown direction
    expect(bad("fill:en-lu:" + "x".repeat(65)).ok).toBe(false);
    expect(bad("fills:en-lu:foo").ok).toBe(false);        // near-miss prefix
    expect(bad("x".repeat(65) + "|y").ok).toBe(false);
  });

  it("accepts keys at the per-part length boundary, rejects one past it", () => {
    const check = (key: string) =>
      validateProgressSync({ ...valid(), wordResults: [{ key, shown: 1, correct: 1, incorrect: 0 }] }, TODAY).ok;
    // word key: each part may be up to 64 chars (129 chars total incl. the pipe)
    expect(check("l".repeat(64) + "|" + "e".repeat(64))).toBe(true);
    expect(check("l".repeat(65) + "|" + "e".repeat(64))).toBe(false);
    expect(check("l".repeat(64) + "|" + "e".repeat(65))).toBe(false);
    // phrase key: tail may be up to 64 chars (77 chars total)
    expect(check("phrase:en-lu:" + "x".repeat(64))).toBe(true);
    expect(check("phrase:lu-en:" + "x".repeat(64))).toBe(true);
    expect(check("phrase:lu-en:" + "x".repeat(65))).toBe(false);
    // fill key: same tail bound as a phrase key (75 chars total)
    expect(check("fill:en-lu:" + "x".repeat(64))).toBe(true);
    expect(check("fill:lu-en:" + "x".repeat(64))).toBe(true);
    expect(check("fill:lu-en:" + "x".repeat(65))).toBe(false);
  });

  it("accepts phrase keys in both directions", () => {
    expect(
      validateProgressSync(
        { ...valid(), wordResults: [{ key: "phrase:lu-en:Moien", shown: 1, correct: 1, incorrect: 0 }] },
        TODAY,
      ).ok,
    ).toBe(true);
  });

  /**
   * Guards the documented failure mode: an unrecognized prefix rejects the ENTIRE
   * batch, so a single fill result would wipe a whole Session's progress.
   */
  it("accepts fill keys in both directions, including bracketed identities", () => {
    const accepts = (key: string) =>
      validateProgressSync(
        { ...valid(), wordResults: [{ key, shown: 1, correct: 1, incorrect: 0 }] },
        TODAY,
      ).ok;
    expect(accepts("fill:en-lu:In the background I [see] the [Ferris wheel].")).toBe(true);
    expect(accepts("fill:lu-en:In the background I [see] the [Ferris wheel].")).toBe(true);
  });

  it("does not reject a mixed batch of word, phrase and fill keys", () => {
    expect(
      validateProgressSync(
        {
          ...valid(),
          wordResults: [
            { key: "Moien|hi", shown: 1, correct: 1, incorrect: 0 },
            { key: "phrase:en-lu:I am Luca.", shown: 1, correct: 1, incorrect: 0 },
            { key: "fill:en-lu:I [see] a tree.", shown: 1, correct: 0, incorrect: 1 },
          ],
        },
        TODAY,
      ).ok,
    ).toBe(true);
  });

  it("rejects negative or non-int counts", () => {
    const bad = (overrides: Record<string, unknown>) =>
      validateProgressSync(
        { ...valid(), wordResults: [{ key: "Moien|hi", shown: 1, correct: 1, incorrect: 0, ...overrides }] },
        TODAY,
      );
    expect(bad({ shown: -1 }).ok).toBe(false);
    expect(bad({ shown: 1.5 }).ok).toBe(false);
    expect(bad({ correct: 101 }).ok).toBe(false);
    expect(bad({ incorrect: "0" }).ok).toBe(false);
  });

  it("returns reason string for the first failure", () => {
    const r = validateProgressSync({ ...valid(), durationSeconds: -1 }, TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("durationSeconds");
  });

  // Exam-track sub-lesson ids (e.g. "vacation.01") ride the newlyUnlockedLessons
  // channel as the play-gate — this pins the dependency on LESSON_ID_RX.
  it("accepts exam-track sub-lesson ids in newlyUnlockedLessons", () => {
    const r = validateProgressSync(
      { ...valid(), newlyUnlockedLessons: ["vacation.01", "family.03", "A1.05"] },
      TODAY,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.newlyUnlockedLessons).toEqual(["vacation.01", "family.03", "A1.05"]);
  });
});
