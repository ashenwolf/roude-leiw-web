import { describe, it, expect } from "vitest";

import { flattenExamManifest } from "../../../src/exam/exam-catalog.ts";

import type { ExamManifest } from "../../../src/exam/exam-catalog.ts";

const manifest: ExamManifest = {
  themes: [
    {
      id: "vacation",
      title: "Vacation & Travel",
      subLessons: [
        { id: "vacation.01", file: "vacation/01_vocabulary.letz", title: "Vocabulary" },
        { id: "vacation.02", file: "vacation/02_phrases.letz", title: "Key Phrases" },
      ],
    },
    {
      id: "family",
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
