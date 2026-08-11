import { describe, it, expect } from "vitest";

import { selectLessonImage, toLessonImageView } from "../../../src/exercise/lesson-image.ts";

import type { Lesson, LessonMeta } from "../../../src/exercise/letz-parser.ts";

const meta = (extra: Partial<LessonMeta> = {}): LessonMeta => ({
  id: "picture.01",
  title: "Schueberfouer: General Description",
  level: "P1",
  ...extra,
});

const lesson = (m: LessonMeta): Lesson => ({ meta: m, entries: [], sentences: [], fills: [] });

describe("toLessonImageView", () => {
  it("returns a photo view when @image is present", () => {
    expect(toLessonImageView(meta({ image: "/img/a.jpg", imageAlt: "A fair." }))).toEqual({
      kind: "photo",
      src: "/img/a.jpg",
      alt: "A fair.",
    });
  });

  it("falls back to the title as alt when @image-alt is absent", () => {
    expect(toLessonImageView(meta({ image: "/img/a.jpg" }))).toEqual({
      kind: "photo",
      src: "/img/a.jpg",
      alt: "Schueberfouer: General Description",
    });
  });

  // The shipping state of the picture theme: alt text but no photo yet.
  it("returns a captioned placeholder when only @image-alt is present", () => {
    expect(toLessonImageView(meta({ imageAlt: "A busy funfair." }))).toEqual({
      kind: "placeholder",
      caption: "A busy funfair.",
    });
  });

  it("returns null when neither directive is present", () => {
    expect(toLessonImageView(meta())).toBeNull();
  });
});

describe("selectLessonImage", () => {
  it("resolves the image of the focused lesson, not the first one", () => {
    const lessons = [
      lesson(meta({ id: "picture.01", imageAlt: "First." })),
      lesson(meta({ id: "picture.02", imageAlt: "Second." })),
    ];
    expect(selectLessonImage(lessons, "picture.02")).toEqual({
      kind: "placeholder",
      caption: "Second.",
    });
  });

  // Lesson Mode carries the whole course catalog; none of it declares an image.
  it("returns null when the focused lesson declares no image", () => {
    expect(selectLessonImage([lesson(meta({ id: "A1.01" }))], "A1.01")).toBeNull();
  });

  it("returns null when the id matches no loaded lesson", () => {
    expect(selectLessonImage([lesson(meta({ imageAlt: "A." }))], "nope")).toBeNull();
  });

  it("returns null for an empty lesson list", () => {
    expect(selectLessonImage([], "picture.01")).toBeNull();
  });
});
