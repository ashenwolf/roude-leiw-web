/**
 * Sync-capacity contract for authored content.
 *
 * A Session's word results are POSTed as ONE batch, and the server's
 * `wordResults` bound is all-or-nothing: one key over `SYNC_BOUNDS.maxWordResults`
 * makes `validateProgressSync` reject the entire batch, losing every result in
 * that Session rather than degrading.
 *
 * Exam Mode is the exposure: it plans every Element of a sub-lesson exactly once,
 * so its distinct-key count is the sub-lesson's size — a pure content property,
 * with no planner ceiling to absorb growth. This test is therefore a bound on
 * AUTHORING, and it counts keys through the real planner and the real exercises
 * rather than by summing directives, so padding and direction rules are included.
 *
 * Lesson Mode is bounded by `LESSON.totalSlots` and cannot approach the cap; it is
 * checked at its worst case anyway, so a future Session-shape change cannot
 * silently cross the bound.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import { EXAM, LESSON } from "../../src/exercise/constants.ts";
import { chunkIntoWordMatchExercises } from "../../src/exercise/exercise-builders.ts";
import { planExamMode } from "../../src/exercise/modes/exam.ts";
import { planLessonMode } from "../../src/exercise/modes/lesson.ts";
import { SYNC_BOUNDS } from "../../src/persistence/sync-bounds.ts";
import { parseLetz } from "../../src/lib/letz-parser/index.ts";

import type { ExamManifest } from "../../src/exam/exam-catalog.ts";
import type { Lesson } from "../../src/exercise/letz-parser.ts";
import type { Exercise } from "../../src/exercise/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const examDir = join(__dirname, "../../public/assets/exam");
const lessonsDir = join(__dirname, "../../public/assets/lessons");

type CourseManifest = {
  levels: { id: string; sections: { lessons: { id: string; file: string }[] }[] }[];
};

const examManifest = JSON.parse(
  readFileSync(join(examDir, "manifest.json"), "utf-8"),
) as ExamManifest;

const courseManifest = JSON.parse(
  readFileSync(join(lessonsDir, "manifest.json"), "utf-8"),
) as CourseManifest;

/** The stat keys one Slot contributes — one per word pair, or the item's own. */
const keysOf = (slot: Exercise): string[] =>
  slot.type === "word-match"
    ? slot.pairs.map(([lu, en]) => `${lu}|${en}`)
    : [slot.item.elementKey];

const distinctKeys = (queue: ReadonlyArray<Exercise>): number =>
  new Set(queue.flatMap(keysOf)).size;

/** Deterministic rng, so a failure names a reproducible plan. */
const rngFrom = (seed: number): (() => number) => {
  const state = { a: seed >>> 0 };
  return () => {
    state.a = (state.a + 0x6d2b79f5) >>> 0;
    const t0 = state.a;
    const t1 = Math.imul(t0 ^ (t0 >>> 15), 1 | t0);
    const t2 = (t1 + Math.imul(t1 ^ (t1 >>> 7), 61 | t1)) ^ t1;
    return ((t2 ^ (t2 >>> 14)) >>> 0) / 4294967296;
  };
};

describe("one Session's stat keys stay inside the server's batch bound", () => {
  for (const theme of examManifest.themes) {
    for (const sub of theme.subLessons) {
      it(`exam ${sub.id} plans at most ${SYNC_BOUNDS.maxWordResults} distinct keys`, () => {
        const lesson = parseLetz(readFileSync(join(examDir, sub.file), "utf-8"), sub.id);
        const keys = distinctKeys(planExamMode(lesson, rngFrom(17)).queue);

        // Exam covers everything once, so the count is the Element count and does
        // not vary with the roll — asserted so a future planner change that makes
        // it roll-dependent is caught here rather than in production.
        expect(distinctKeys(planExamMode(lesson, rngFrom(918_273)).queue)).toBe(keys);

        expect(
          keys,
          `${sub.id} plans ${keys} distinct stat keys; the server rejects a batch above ` +
            `${SYNC_BOUNDS.maxWordResults} IN FULL, so this sub-lesson would lose all of a ` +
            `Session's progress. Split it into more sub-lessons.`,
        ).toBeLessThanOrEqual(SYNC_BOUNDS.maxWordResults);
      });
    }
  }

  it("Lesson Mode cannot exceed the bound on any shipped lesson", () => {
    const lessons = courseManifest.levels.flatMap((level) =>
      level.sections.flatMap((section) =>
        section.lessons.map((l) =>
          parseLetz(readFileSync(join(lessonsDir, level.id, l.file), "utf-8"), l.id),
        ),
      ),
    );

    // A Lesson Session is LESSON.totalSlots Slots of at most wordMatchPairs keys
    // each, so this is a structural ceiling, not a content one.
    const ceiling = LESSON.totalSlots * LESSON.wordMatchPairs;
    expect(ceiling).toBeLessThanOrEqual(SYNC_BOUNDS.maxWordResults);

    const worst = lessons.reduce((max, lesson) => {
      const keys = Array.from({ length: 5 }, (_, i) =>
        distinctKeys(planLessonMode(lessons, lesson.meta.id, {}, rngFrom(101 + i)).queue),
      ).reduce((a, b) => Math.max(a, b), 0);
      return Math.max(max, keys);
    }, 0);

    expect(worst).toBeLessThanOrEqual(SYNC_BOUNDS.maxWordResults);
  });

  it("the headroom a new exam sub-lesson has is visible, not incidental", () => {
    // Guards against the bound being crossed by ONE authoring step: exam word
    // Slots are padded to EXAM.wordMatch.pairCount, so a sub-lesson's key count is
    // its Element count, and the largest shipped one states how much room is left.
    const sizes = examManifest.themes.flatMap((theme) =>
      theme.subLessons.map((sub) => {
        const lesson: Lesson = parseLetz(readFileSync(join(examDir, sub.file), "utf-8"), sub.id);
        return {
          id: sub.id,
          keys: distinctKeys(planExamMode(lesson, rngFrom(3)).queue),
        };
      }),
    );

    const largest = sizes.reduce((max, s) => (s.keys > max.keys ? s : max));
    const headroom = SYNC_BOUNDS.maxWordResults - largest.keys;

    // Padding never introduces a key outside the source, so chunking cannot push a
    // sub-lesson over the bound on its own: an uneven list is padded with repeats
    // drawn from the same entries, and a list below pairCount yields one short Slot.
    const entries = Array.from({ length: EXAM.wordMatch.pairCount + 2 }, (_, i) => ({
      lu: `lu${i}`,
      en: `en${i}`,
    }));
    const sourceKeys = new Set(entries.map((e) => `${e.lu}|${e.en}`));
    const chunkedKeys = new Set(
      chunkIntoWordMatchExercises(entries, EXAM.wordMatch).flatMap(keysOf),
    );
    expect([...chunkedKeys].every((k) => sourceKeys.has(k))).toBe(true);
    expect(chunkedKeys.size).toBe(sourceKeys.size);

    expect(
      headroom,
      `largest exam sub-lesson (${largest.id}) plans ${largest.keys} keys, leaving ${headroom} ` +
        `before the ${SYNC_BOUNDS.maxWordResults}-key batch bound rejects a whole Session`,
    ).toBeGreaterThan(0);
  });
});
