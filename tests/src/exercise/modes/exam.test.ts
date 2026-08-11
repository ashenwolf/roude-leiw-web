import { describe, it, expect } from "vitest";

import { planExamMode } from "../../../../src/exercise/modes/exam.ts";

import type {
  FillEntry,
  Lesson,
  SentenceEntry,
  WordEntry,
} from "../../../../src/exercise/letz-parser.ts";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const fakeRng = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
};

const words = (n: number): WordEntry[] =>
  Array.from({ length: n }, (_, i) => ({ lu: `lu${i}`, en: `en${i}` }));

const sentence = (en: string, lu: string, question?: string): SentenceEntry => ({
  enVariants: [en],
  luVariants: [lu],
  ...(question !== undefined ? { question } : {}),
});

const fill = (en: string, lu: string): FillEntry => ({ en, lu });

const subLesson = (
  entries: WordEntry[],
  sentences: SentenceEntry[] = [],
  fills: FillEntry[] = [],
): Lesson => ({
  meta: { id: "vacation.01", title: "Vocabulary", level: "A1" },
  entries,
  sentences,
  fills,
});

// ─── planExamMode ─────────────────────────────────────────────────────────────

describe("planExamMode", () => {
  it("covers every word exactly once across word-match slots", () => {
    const config = planExamMode(subLesson(words(12)), fakeRng(0.5));
    const pairs = config.queue.flatMap((ex) => (ex.type === "word-match" ? ex.pairs : []));
    expect(pairs).toHaveLength(12);
    expect(new Set(pairs.map(([lu]) => lu)).size).toBe(12);
  });

  it("chunks words into slots of 5", () => {
    const config = planExamMode(subLesson(words(15)), fakeRng(0.5));
    const sizes = config.queue.map((ex) => (ex.type === "word-match" ? ex.pairs.length : 0));
    expect(sizes).toEqual([5, 5, 5]);
  });

  it("merges a trailing chunk smaller than 3 into the previous slot", () => {
    const config = planExamMode(subLesson(words(12)), fakeRng(0.5));
    const sizes = config.queue
      .filter((ex) => ex.type === "word-match")
      .map((ex) => (ex.type === "word-match" ? ex.pairs.length : 0))
      .sort((a, b) => a - b);
    expect(sizes).toEqual([5, 7]);
  });

  it("keeps a trailing chunk of 3+ as its own slot", () => {
    const config = planExamMode(subLesson(words(8)), fakeRng(0.5));
    const sizes = config.queue
      .map((ex) => (ex.type === "word-match" ? ex.pairs.length : 0))
      .sort((a, b) => a - b);
    expect(sizes).toEqual([3, 5]);
  });

  it("keeps a single undersized chunk when it is the only one", () => {
    const config = planExamMode(subLesson(words(2)), fakeRng(0.5));
    expect(config.queue).toHaveLength(1);
    expect(config.queue[0].type).toBe("word-match");
  });

  it("builds one sentence-builder slot per sentence", () => {
    const config = planExamMode(
      subLesson([], [sentence("Hi", "Moien"), sentence("Bye", "Äddi")]),
      fakeRng(0.5),
    );
    expect(config.queue.filter((ex) => ex.type === "sentence-builder")).toHaveLength(2);
  });

  it("forces en→lu direction for @question sentences", () => {
    // rng 0.9 would roll lu-en for a plain sentence — the question must override it
    const config = planExamMode(
      subLesson([], [sentence("We travel", "Mir reesen", "Wéi reest Dir?")]),
      fakeRng(0.9),
    );
    const slot = config.queue[0];
    expect(slot.type).toBe("sentence-builder");
    if (slot.type === "sentence-builder") {
      expect(slot.item.direction).toBe("en-lu");
      expect(slot.item.question).toBe("Wéi reest Dir?");
    }
  });

  it("rolls direction for plain sentences", () => {
    const config = planExamMode(subLesson([], [sentence("Hi", "Moien")]), fakeRng(0.9));
    const slot = config.queue[0];
    if (slot.type === "sentence-builder") expect(slot.item.direction).toBe("lu-en");
  });

  it("skips sentences missing a variant on either side", () => {
    const broken: SentenceEntry = { enVariants: [], luVariants: ["Moien"] };
    const config = planExamMode(subLesson([], [broken]), fakeRng(0.5));
    expect(config.queue).toHaveLength(0);
  });

  it("builds one fill-blank slot per fill — every Element covered exactly once", () => {
    const config = planExamMode(
      subLesson([], [], [fill("I [see] it", "Ech [gesinn] et"), fill("A [dog]", "En [Hond]")]),
      fakeRng(0.5),
    );
    expect(config.queue).toHaveLength(2);
    expect(config.queue.every((ex) => ex.type === "fill-blank")).toBe(true);
  });

  it("rolls direction for fills with the same table as sentences", () => {
    const item = fill("I [see] it", "Ech [gesinn] et");
    const enLu = planExamMode(subLesson([], [], [item]), fakeRng(0.1)).queue[0];
    const luEn = planExamMode(subLesson([], [], [item]), fakeRng(0.9)).queue[0];
    if (enLu.type === "fill-blank") expect(enLu.item.direction).toBe("en-lu");
    if (luEn.type === "fill-blank") expect(luEn.item.direction).toBe("lu-en");
  });

  it("skips fills missing a line on either side", () => {
    const config = planExamMode(subLesson([], [], [fill("", "Ech [gesinn] et")]), fakeRng(0.5));
    expect(config.queue).toHaveLength(0);
  });

  it("mixes fill slots into the same queue as words and sentences", () => {
    const config = planExamMode(
      subLesson(words(5), [sentence("Hi", "Moien")], [fill("I [see] it", "Ech [gesinn] et")]),
      fakeRng(0.5),
    );
    expect(new Set(config.queue.map((ex) => ex.type))).toEqual(
      new Set(["word-match", "sentence-builder", "fill-blank"]),
    );
    expect(config.plannedSlots).toBe(3);
  });

  it("plans a deterministic slot order given the same rng sequence", () => {
    // Token order inside a sentence slot is gameplay-shuffled (Math.random) —
    // compare the plan's shape: slot types, word pairs, and phrase identities.
    const shape = () =>
      planExamMode(subLesson(words(7), [sentence("Hi", "Moien")]), fakeRng(0.3, 0.7, 0.1))
        .queue.map((ex) => (ex.type === "word-match" ? ex.pairs : ex.item.phraseKey));
    expect(shape()).toEqual(shape());
  });

  it("places block boundaries at near-equal thirds ending at the queue length", () => {
    const config = planExamMode(subLesson(words(20), [sentence("Hi", "Moien")]), fakeRng(0.5));
    expect(config.queue).toHaveLength(5); // 4 word slots + 1 sentence slot
    expect(config.blockBoundaries).toEqual([2, 4, 5]);
    expect(config.plannedSlots).toBe(5);
  });

  it("collapses duplicate boundaries for tiny queues", () => {
    const config = planExamMode(subLesson(words(4)), fakeRng(0.5));
    expect(config.queue).toHaveLength(1);
    expect(config.blockBoundaries).toEqual([1]);
  });

  it("emits noop completion effect and the sub-lesson as current", () => {
    const config = planExamMode(subLesson(words(5)), fakeRng(0.5));
    expect(config.completionEffect).toBe("noop");
    expect(config.currentLessonId).toBe("vacation.01");
    expect(config.hasCorrectionBlock).toBe(true);
    expect(config.lessons).toHaveLength(1);
  });
});
