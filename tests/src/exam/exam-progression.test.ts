import { describe, it, expect } from "vitest";

import { computeExamView, selectSubLessonsToLoad } from "../../../src/exam/exam-progression.ts";

import type { SubLessonMeta } from "../../../src/exam/exam-catalog.ts";
import type { Lesson, WordEntry } from "../../../src/exercise/letz-parser.ts";
import type { WordStats } from "../../../src/context/auth.ts";

// ─── Fixtures (shared conventions: s() for stats, lesson() for content) ───────

const s = (shown: number, correct: number, incorrect: number): WordStats =>
  ({ shown, correct, incorrect });

const lesson = (id: string, words: [string, string][]): Lesson => ({
  meta: { id, title: id, level: "A1" },
  entries: words.map(([lu, en]): WordEntry => ({ lu, en })),
  sentences: [],
});

const meta = (id: string, themeId: string): SubLessonMeta => ({
  id,
  themeId,
  themeTitle: `Theme ${themeId}`,
  title: id,
  file: `${themeId}/${id}.letz`,
});

const CATALOG = [
  meta("vacation.01", "vacation"),
  meta("vacation.02", "vacation"),
  meta("vacation.03", "vacation"),
  meta("family.01", "family"),
  meta("family.02", "family"),
];

// ─── computeExamView ──────────────────────────────────────────────────────────

describe("computeExamView", () => {
  it("groups sub-lessons under their themes in manifest order", () => {
    const view = computeExamView(CATALOG, {}, {}, []);
    expect(view.themes.map((t) => t.id)).toEqual(["vacation", "family"]);
    expect(view.themes[0].subLessons.map((v) => v.meta.id)).toEqual([
      "vacation.01", "vacation.02", "vacation.03",
    ]);
  });

  it("unlocks only the first sub-lesson of each theme when nothing is played", () => {
    const view = computeExamView(CATALOG, {}, {}, []);
    expect(view.themes[0].subLessons.map((v) => v.unlocked)).toEqual([true, false, false]);
    expect(view.themes[1].subLessons.map((v) => v.unlocked)).toEqual([true, false]);
  });

  it("unlocks the next sub-lesson once the previous one is played", () => {
    const view = computeExamView(CATALOG, {}, {}, ["vacation.01"]);
    expect(view.themes[0].subLessons.map((v) => v.unlocked)).toEqual([true, true, false]);
    expect(view.themes[0].subLessons.map((v) => v.played)).toEqual([true, false, false]);
  });

  it("keeps themes independent: playing vacation does not unlock family", () => {
    const view = computeExamView(CATALOG, {}, {}, ["vacation.01", "vacation.02"]);
    expect(view.themes[1].subLessons.map((v) => v.unlocked)).toEqual([true, false]);
  });

  it("ignores course lesson ids in the persisted set", () => {
    const view = computeExamView(CATALOG, {}, {}, ["A1.02", "A1.03"]);
    expect(view.themes[0].subLessons.map((v) => v.unlocked)).toEqual([true, false, false]);
  });

  it("mastery does NOT unlock the next sub-lesson (play-gate, not mastery-gate)", () => {
    const content = { "vacation.01": lesson("V1.01", [["Moien", "hi"]]) };
    const mastered = { "Moien|hi": s(5, 5, 0) };
    const view = computeExamView(CATALOG, content, mastered, []);
    expect(view.themes[0].subLessons[0].progress?.isComplete).toBe(true);
    expect(view.themes[0].subLessons[1].unlocked).toBe(false);
  });

  it("computes progress for loaded sub-lessons and null for unloaded ones", () => {
    const content = { "vacation.01": lesson("V1.01", [["Moien", "hi"], ["Äddi", "bye"]]) };
    const words = { "Moien|hi": s(4, 3, 1) };
    const view = computeExamView(CATALOG, content, words, []);
    expect(view.themes[0].subLessons[0].progress).toEqual(
      expect.objectContaining({ total: 2, mastered: 1 }),
    );
    expect(view.themes[0].subLessons[1].progress).toBeNull();
  });

  it("returns no themes for an empty catalog", () => {
    expect(computeExamView([], {}, {}, []).themes).toEqual([]);
  });
});

// ─── selectSubLessonsToLoad ───────────────────────────────────────────────────

describe("selectSubLessonsToLoad", () => {
  it("selects only theme-first sub-lessons when nothing is played", () => {
    expect(selectSubLessonsToLoad(CATALOG, []).map((m) => m.id)).toEqual([
      "vacation.01", "family.01",
    ]);
  });

  it("selects played and newly-unlocked sub-lessons", () => {
    expect(selectSubLessonsToLoad(CATALOG, ["vacation.01"]).map((m) => m.id)).toEqual([
      "vacation.01", "vacation.02", "family.01",
    ]);
  });

  it("never selects locked sub-lessons deeper in a theme", () => {
    const ids = selectSubLessonsToLoad(CATALOG, ["vacation.01", "family.01"]).map((m) => m.id);
    expect(ids).not.toContain("vacation.03");
    expect(ids).toContain("family.02");
  });
});
