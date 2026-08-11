// Layer 0 — pure projection of a lesson's `@image` / `@image-alt` directives into
// what the UI renders. One function feeds both render sites (the exam theme path
// node and the exercise page), so the placeholder rule can never diverge between
// them.
//
// Why a placeholder rather than nothing: a picture-description sub-lesson asks the
// learner to describe a photo, so it is unusable if the photo is silently absent.
// `@image-alt` therefore carries double duty — alt text when the photo is there,
// caption of the placeholder frame when it is not.
// See .claude/memory/picture-description-theme.md.

import type { Lesson, LessonMeta } from "./letz-parser";

export type LessonImageView =
  | { kind: "photo"; src: string; alt: string }
  | { kind: "placeholder"; caption: string };

/**
 * `null` for a lesson that declares neither directive — the overwhelming majority
 * (every course lesson and every topic-theme sub-lesson), which render no frame
 * at all rather than an empty one.
 */
export const toLessonImageView = (meta: LessonMeta): LessonImageView | null => {
  if (meta.image) return { kind: "photo", src: meta.image, alt: meta.imageAlt ?? meta.title };
  return meta.imageAlt ? { kind: "placeholder", caption: meta.imageAlt } : null;
};

/**
 * The image for the lesson a Session is focused on. Exam Sessions load exactly one
 * sub-lesson, so this resolves to it; Lesson Mode carries the whole course catalog
 * and resolves to the current lesson, which today declares no image.
 */
export const selectLessonImage = (
  lessons: ReadonlyArray<Lesson>,
  currentLessonId: string,
): LessonImageView | null => {
  const lesson = lessons.find((l) => l.meta.id === currentLessonId);
  return lesson ? toLessonImageView(lesson.meta) : null;
};
