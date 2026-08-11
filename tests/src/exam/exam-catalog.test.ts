import { describe, it, expect } from "vitest";

import { flattenExamManifest, themeHeading } from "../../../src/exam/exam-catalog.ts";

import type { ExamManifest } from "../../../src/exam/exam-catalog.ts";

const manifest: ExamManifest = {
  themes: [
    {
      id: "vacation",
      kind: "topic",
      title: "Vacation & Travel",
      subLessons: [
        { id: "vacation.01", file: "vacation/01_vocabulary.letz", title: "Vocabulary" },
        { id: "vacation.02", file: "vacation/02_phrases.letz", title: "Key Phrases" },
      ],
    },
    {
      id: "family",
      kind: "topic",
      title: "Family & Myself",
      subLessons: [
        { id: "family.01", file: "family/01_vocabulary.letz", title: "Vocabulary" },
      ],
    },
  ],
};

describe("flattenExamManifest", () => {
  it("flattens themes into SubLessonMeta rows in manifest order", () => {
    const metas = flattenExamManifest(manifest);
    expect(metas.map((m) => m.id)).toEqual(["vacation.01", "vacation.02", "family.01"]);
  });

  it("carries theme id and title onto every row", () => {
    const metas = flattenExamManifest(manifest);
    expect(metas[0]).toEqual({
      id: "vacation.01",
      themeId: "vacation",
      themeKind: "topic",
      themeTitle: "Vacation & Travel",
      title: "Vocabulary",
      file: "vacation/01_vocabulary.letz",
    });
    expect(metas[2].themeId).toBe("family");
  });

  it("returns an empty list for an empty manifest", () => {
    expect(flattenExamManifest({ themes: [] })).toEqual([]);
  });
});

describe("themeHeading", () => {
  it("prefixes a topic theme", () => {
    expect(themeHeading("topic", "Vacation & Travel")).toBe("Theme: Vacation & Travel");
  });

  it("prefixes a picture theme with the task name, not 'Theme'", () => {
    expect(themeHeading("picture", "Schueberfouer")).toBe(
      "Describing a Picture: Schueberfouer",
    );
    expect(themeHeading("picture", "Christmas Market")).toBe(
      "Describing a Picture: Christmas Market",
    );
  });
});
