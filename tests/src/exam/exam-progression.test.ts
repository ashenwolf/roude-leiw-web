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
  fills: [],
});

/** Stats that pass the mastery gate for every word of the given sub-lessons. */
const masteredWords = (...lessons: Lesson[]): Record<string, WordStats> =>
  Object.fromEntries(
    lessons.flatMap((l) => l.entries.map((e) => [`${e.lu}|${e.en}`, s(5, 5, 0)] as const)),
  );

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

  it("playing a sub-lesson does NOT unlock the next one (pass-gate, not play-gate)", () => {
    const content = { "vacation.01": lesson("V1.01", [["Moien", "hi"], ["Äddi", "bye"]]) };
    const partial = { "Moien|hi": s(5, 5, 0) }; // 1 of 2 elements mastered
    const view = computeExamView(CATALOG, content, partial, ["vacation.01"]);
    expect(view.themes[0].subLessons.map((v) => v.played)).toEqual([true, false, false]);
    expect(view.themes[0].subLessons.map((v) => v.passed)).toEqual([false, false, false]);
    expect(view.themes[0].subLessons.map((v) => v.unlocked)).toEqual([true, false, false]);
  });

  it("unlocks the next sub-lesson once the previous one is fully passed", () => {
    const first = lesson("V1.01", [["Moien", "hi"], ["Äddi", "bye"]]);
    const view = computeExamView(
      CATALOG,
      { "vacation.01": first },
      masteredWords(first),
      ["vacation.01"],
    );
    expect(view.themes[0].subLessons.map((v) => v.passed)).toEqual([true, false, false]);
    expect(view.themes[0].subLessons.map((v) => v.unlocked)).toEqual([true, true, false]);
  });

  it("opens one step at a time — passing 01 never reaches 03", () => {
    const first = lesson("V1.01", [["Moien", "hi"]]);
    const second = lesson("V1.02", [["Merci", "thanks"]]);
    const view = computeExamView(
      CATALOG,
      { "vacation.01": first, "vacation.02": second },
      masteredWords(first),
      ["vacation.01"],
    );
    expect(view.themes[0].subLessons.map((v) => v.unlocked)).toEqual([true, true, false]);
  });

  it("keeps an already-played sub-lesson unlocked even if the previous is not passed", () => {
    // Sticky access: the stricter gate must not take back a step the user already opened.
    const view = computeExamView(CATALOG, {}, {}, ["vacation.01", "vacation.02"]);
    expect(view.themes[0].subLessons.map((v) => v.unlocked)).toEqual([true, true, false]);
  });

  it("keeps themes independent: passing vacation does not unlock family", () => {
    const first = lesson("V1.01", [["Moien", "hi"]]);
    const view = computeExamView(
      CATALOG,
      { "vacation.01": first },
      masteredWords(first),
      ["vacation.01"],
    );
    expect(view.themes[1].subLessons.map((v) => v.unlocked)).toEqual([true, false]);
  });

  it("ignores course lesson ids in the persisted set", () => {
    const view = computeExamView(CATALOG, {}, {}, ["A1.02", "A1.03"]);
    expect(view.themes[0].subLessons.map((v) => v.unlocked)).toEqual([true, false, false]);
  });

  it("cannot pass a sub-lesson whose content is not loaded", () => {
    const first = lesson("V1.01", [["Moien", "hi"]]);
    const view = computeExamView(CATALOG, {}, masteredWords(first), []);
    expect(view.themes[0].subLessons[0].passed).toBe(false);
    expect(view.themes[0].subLessons[1].unlocked).toBe(false);
  });

  it("a locked sub-lesson never counts as passed, so it cannot open the one after it", () => {
    // Content for a locked step can be loaded (it is the next node after a played
    // one); shared stat keys must still not let the chain skip a step.
    const second = lesson("V1.02", [["Merci", "thanks"]]);
    const view = computeExamView(CATALOG, { "vacation.02": second }, masteredWords(second), []);
    expect(view.themes[0].subLessons[1].passed).toBe(false);
    expect(view.themes[0].subLessons[2].unlocked).toBe(false);
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
