import { describe, it, expect } from "vitest";

import { selectErrorPool } from "../../../src/exercise/error-pool.ts";
import { MIN_ANSWERS } from "../../../src/exercise/constants.ts";

import type { WordStats } from "../../../src/context/auth.ts";
import type { FillEntry, Lesson, SentenceEntry } from "../../../src/exercise/letz-parser.ts";

// ============================================================================
// Helpers
// ============================================================================

const s = (shown: number, correct: number, incorrect: number): WordStats =>
  ({ shown, correct, incorrect });

const lesson = (id: string, ...pairs: [string, string][]): Lesson => ({
  meta: { id, title: id, level: "A1" },
  entries: pairs.map(([lu, en]) => ({ lu, en })),
  sentences: [],
  fills: [],
});

const lessonWithSentences = (
  id: string,
  pairs: [string, string][],
  sentences: SentenceEntry[],
): Lesson => ({
  meta: { id, title: id, level: "A1" },
  entries: pairs.map(([lu, en]) => ({ lu, en })),
  sentences,
  fills: [],
});

const lessonWithFills = (id: string, fills: FillEntry[]): Lesson => ({
  meta: { id, title: id, level: "A1" },
  entries: [],
  sentences: [],
  fills,
});

const sentence = (firstEn: string, ...luVariants: string[]): SentenceEntry => ({
  luVariants,
  enVariants: [firstEn],
  distractorsEn: [],
  distractorsLu: [],
});

const fill = (en: string, lu: string): FillEntry => ({ lu, en });

const wordKey = (lu: string, en: string) => `${lu}|${en}`;
const phraseKey = (direction: "en-lu" | "lu-en", firstEn: string) => `phrase:${direction}:${firstEn}`;
const fillKey = (direction: "en-lu" | "lu-en", en: string) => `fill:${direction}:${en}`;

// ============================================================================
// Primary pool — shown >= MIN_ANSWERS AND accuracy < ERROR_THRESHOLD (0.8)
// accuracy = correct / (correct + incorrect)
// ============================================================================

describe("selectErrorPool — primary pool", () => {
  it("returns words meeting primary criteria", () => {
    // shown = MIN_ANSWERS, correct = 0, incorrect = MIN_ANSWERS → accuracy 0% < 80% ✓
    const stats = { [wordKey("Moien", "hi")]: s(MIN_ANSWERS, 0, MIN_ANSWERS) };
    const lessons = [lesson("L1", ["Moien", "hi"])];

    const pool = selectErrorPool(stats, lessons);

    expect(pool.words).toHaveLength(1);
    expect(pool.words[0]).toMatchObject({ lu: "Moien", en: "hi" });
    expect(pool.phrases).toHaveLength(0);
  });

  it("excludes from primary when shown < MIN_ANSWERS (falls to fallback if incorrect > 0)", () => {
    // shown < MIN_ANSWERS AND incorrect > 0 → not primary, but IS in fallback
    const stats = { [wordKey("Moien", "hi")]: s(MIN_ANSWERS - 1, 0, MIN_ANSWERS - 1) };
    const lessons = [lesson("L1", ["Moien", "hi"])];

    const pool = selectErrorPool(stats, lessons);

    // Fallback applies; word appears there (not gated by MIN_ANSWERS)
    expect(pool.words).toHaveLength(1);
  });

  it("excludes words with perfect accuracy (100%)", () => {
    // accuracy = 1.0 ≥ 0.8 AND incorrect = 0 → neither primary nor fallback
    const stats = { [wordKey("Moien", "hi")]: s(MIN_ANSWERS, MIN_ANSWERS, 0) };
    const lessons = [lesson("L1", ["Moien", "hi"])];

    const pool = selectErrorPool(stats, lessons);

    expect(pool.words).toHaveLength(0);
  });

  it("boundary: accuracy exactly at ERROR_THRESHOLD (0.8) is excluded from primary", () => {
    // correct=4, incorrect=1 → accuracy=4/5=0.8 = threshold → NOT < threshold → not primary
    // incorrect=1 → primary empty → fallback kicks in
    const stats = { [wordKey("Moien", "hi")]: s(MIN_ANSWERS, 4, 1) };
    const lessons = [lesson("L1", ["Moien", "hi"])];

    const pool = selectErrorPool(stats, lessons);

    // Not primary (0.8 is not < 0.8), but fallback fires because incorrect > 0
    expect(pool.words).toHaveLength(1);
  });

  it("boundary: accuracy just below ERROR_THRESHOLD enters primary", () => {
    // correct=3, incorrect=2 → accuracy=3/5=0.6 < 0.8 AND shown>=MIN_ANSWERS → primary
    const stats = { [wordKey("Moien", "hi")]: s(MIN_ANSWERS, 3, 2) };
    const lessons = [lesson("L1", ["Moien", "hi"])];

    const pool = selectErrorPool(stats, lessons);

    expect(pool.words).toHaveLength(1);
  });

  it("includes historically-mastered words that have since accumulated wrong answers", () => {
    // correct=4 ≥ MASTERY_CORRECT_COUNT → isElementMastered=true, but accuracy=4/104≈4% → primary
    const stats = { [wordKey("Moien", "hi")]: s(MIN_ANSWERS, 4, 100) };
    const lessons = [lesson("L1", ["Moien", "hi"])];

    const pool = selectErrorPool(stats, lessons);

    expect(pool.words).toHaveLength(1);
  });

  it("deduplicates words appearing in multiple lessons", () => {
    const stats = { [wordKey("Moien", "hi")]: s(MIN_ANSWERS, 0, MIN_ANSWERS) };
    const lessons = [
      lesson("L1", ["Moien", "hi"]),
      lesson("L2", ["Moien", "hi"]), // same pair
    ];

    const pool = selectErrorPool(stats, lessons);

    expect(pool.words).toHaveLength(1);
  });

  it("returns phrases meeting primary criteria, tagged with the failed direction", () => {
    const key = phraseKey("lu-en", "Good morning");
    const stats = { [key]: s(MIN_ANSWERS, 0, MIN_ANSWERS) };
    const lessons = [
      lessonWithSentences("L1", [], [sentence("Good morning", "Gudde Moien")]),
    ];

    const pool = selectErrorPool(stats, lessons);

    expect(pool.phrases).toHaveLength(1);
    expect(pool.phrases[0].sentence.enVariants[0]).toBe("Good morning");
    expect(pool.phrases[0].direction).toBe("lu-en");
  });

  it("tracks each direction of the same phrase as a separate error entry", () => {
    const firstEn = "Good morning";
    const stats = {
      [phraseKey("en-lu", firstEn)]: s(MIN_ANSWERS, 0, MIN_ANSWERS),
      [phraseKey("lu-en", firstEn)]: s(MIN_ANSWERS, 0, MIN_ANSWERS),
    };
    const lessons = [
      lessonWithSentences("L1", [], [sentence(firstEn, "Gudde Moien")]),
    ];

    const pool = selectErrorPool(stats, lessons);

    expect(pool.phrases).toHaveLength(2);
    expect(new Set(pool.phrases.map((p) => p.direction))).toEqual(new Set(["en-lu", "lu-en"]));
  });

  it("excludes sentences with no enVariants", () => {
    const lessons = [
      lessonWithSentences("L1", [], [{ luVariants: ["Gudde Moien"], enVariants: [], distractorsEn: [], distractorsLu: [] }]),
    ];

    const pool = selectErrorPool({}, lessons);

    expect(pool.phrases).toHaveLength(0);
  });
});

// ============================================================================
// Fallback pool — all with incorrect > 0, sorted ascending by success rate
// ============================================================================

describe("selectErrorPool — fallback pool", () => {
  it("uses fallback when primary is empty", () => {
    // shown < MIN_ANSWERS but has incorrect — goes to fallback
    const stats = { [wordKey("Moien", "hi")]: s(1, 0, 1) };
    const lessons = [lesson("L1", ["Moien", "hi"])];

    const pool = selectErrorPool(stats, lessons);

    expect(pool.words).toHaveLength(1);
    expect(pool.words[0]).toMatchObject({ lu: "Moien", en: "hi" });
  });

  it("fallback excludes words with incorrect = 0", () => {
    const stats = { [wordKey("Moien", "hi")]: s(3, 3, 0) }; // no errors
    const lessons = [lesson("L1", ["Moien", "hi"])];

    const pool = selectErrorPool(stats, lessons);

    expect(pool.words).toHaveLength(0);
    expect(pool.phrases).toHaveLength(0);
  });

  it("fallback sorts ascending by accuracy (worst first)", () => {
    const stats = {
      [wordKey("A", "a")]: s(2, 2, 0), // no errors → excluded from fallback
      [wordKey("B", "b")]: s(3, 1, 2), // accuracy=1/3≈33% — worst
      [wordKey("C", "c")]: s(4, 3, 1), // accuracy=3/4=75% — middle
    };
    const lessons = [lesson("L1", ["A", "a"], ["B", "b"], ["C", "c"])];

    const pool = selectErrorPool(stats, lessons);

    expect(pool.words.map((e) => e.lu)).toEqual(["B", "C"]);
  });

  it("empty pool when no errors at all", () => {
    const lessons = [lesson("L1", ["Moien", "hi"])];

    const pool = selectErrorPool({}, lessons);

    expect(pool.words).toHaveLength(0);
    expect(pool.phrases).toHaveLength(0);
    expect(pool.fills).toHaveLength(0);
  });
});

// ============================================================================
// Fills — same rule, own pool (Fix Errors must rebuild a fill AS a fill)
// ============================================================================

describe("selectErrorPool — fills", () => {
  const item = fill("I [see] the wheel", "Ech [gesinn] d'Rad");

  it("returns fills meeting primary criteria, tagged with the failed direction", () => {
    const stats = { [fillKey("lu-en", item.en)]: s(MIN_ANSWERS, 0, MIN_ANSWERS) };

    const pool = selectErrorPool(stats, [lessonWithFills("L1", [item])]);

    expect(pool.fills).toHaveLength(1);
    expect(pool.fills[0].fill).toEqual(item);
    expect(pool.fills[0].direction).toBe("lu-en");
    expect(pool.phrases).toHaveLength(0);
  });

  it("tracks each direction of the same fill as a separate error entry", () => {
    const stats = {
      [fillKey("en-lu", item.en)]: s(MIN_ANSWERS, 0, MIN_ANSWERS),
      [fillKey("lu-en", item.en)]: s(MIN_ANSWERS, 0, MIN_ANSWERS),
    };

    const pool = selectErrorPool(stats, [lessonWithFills("L1", [item])]);

    expect(pool.fills).toHaveLength(2);
    expect(new Set(pool.fills.map((f) => f.direction))).toEqual(new Set(["en-lu", "lu-en"]));
  });

  it("uses the fallback pool when no fill meets primary criteria", () => {
    const stats = { [fillKey("en-lu", item.en)]: s(1, 0, 1) };

    const pool = selectErrorPool(stats, [lessonWithFills("L1", [item])]);

    expect(pool.fills).toHaveLength(1);
    expect(pool.fills[0].direction).toBe("en-lu");
  });

  it("fallback sorts fills ascending by accuracy (worst first)", () => {
    const bad = fill("bad [one]", "schlecht [eent]");
    const worse = fill("worse [one]", "méi schlecht [eent]");
    const stats = {
      [fillKey("en-lu", bad.en)]: s(3, 3, 1), // 75%
      [fillKey("en-lu", worse.en)]: s(3, 1, 3), // 25% — worst
    };

    const pool = selectErrorPool(stats, [lessonWithFills("L1", [bad, worse])]);

    expect(pool.fills.map((f) => f.fill.en)).toEqual([worse.en, bad.en]);
  });

  it("does not confuse a fill with a phrase carrying the same English text", () => {
    // Identical English, distinct key prefixes → distinct Elements.
    const text = "Good morning";
    const stats = { [fillKey("en-lu", text)]: s(MIN_ANSWERS, 0, MIN_ANSWERS) };
    const lessons = [
      { ...lessonWithFills("L1", [fill(text, "Gudde [Moien]")]), sentences: [sentence(text, "Gudde Moien")] },
    ];

    const pool = selectErrorPool(stats, lessons);

    expect(pool.fills).toHaveLength(1);
    expect(pool.phrases).toHaveLength(0);
  });
});

// ============================================================================
// Each element kind is computed independently
// ============================================================================

describe("selectErrorPool — independence of element kinds", () => {
  it("phrase fallback fires independently when word primary is non-empty", () => {
    // Word: primary (shown >= MIN_ANSWERS, low rate)
    const wKey = wordKey("Moien", "hi");
    // Phrase: fallback (shown < MIN_ANSWERS but incorrect > 0)
    const pKey = phraseKey("en-lu", "Good morning");

    const stats = {
      [wKey]: s(MIN_ANSWERS, 0, MIN_ANSWERS),
      [pKey]: s(1, 0, 1),
    };
    const lessons = [
      lessonWithSentences("L1", [["Moien", "hi"]], [sentence("Good morning", "Gudde Moien")]),
    ];

    const pool = selectErrorPool(stats, lessons);

    // Words uses primary; phrases uses fallback (independently)
    expect(pool.words).toHaveLength(1);
    expect(pool.phrases).toHaveLength(1);
  });

  it("fill fallback fires independently when word primary is non-empty", () => {
    const item = fill("I [see] it", "Ech [gesinn] et");
    const stats = {
      [wordKey("Moien", "hi")]: s(MIN_ANSWERS, 0, MIN_ANSWERS), // primary
      [fillKey("lu-en", item.en)]: s(1, 0, 1), // fallback only
    };
    const lessons = [
      { ...lessonWithFills("L1", [item]), entries: [{ lu: "Moien", en: "hi" }] },
    ];

    const pool = selectErrorPool(stats, lessons);

    expect(pool.words).toHaveLength(1);
    expect(pool.fills).toHaveLength(1);
  });
});
