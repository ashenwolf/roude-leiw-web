import { describe, it, expect } from "vitest";

import { lessonSlotTypeDistribution, planLessonMode } from "../../../../src/exercise/modes/lesson.ts";
import { LESSON, MASTERY_CORRECT_COUNT } from "../../../../src/exercise/constants.ts";
import { computeLessonProgress, phraseKey, wordKey } from "../../../../src/exercise/progression.ts";

import type { Lesson, SentenceEntry } from "../../../../src/exercise/letz-parser.ts";
import type { WordStats } from "../../../../src/context/auth.ts";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const sentence = (firstEn: string, lu: string): SentenceEntry => ({
  enVariants: [firstEn],
  luVariants: [lu],
  distractorsEn: [],
  distractorsLu: [],
});

const lesson = (id: string, words: [string, string][], sentences: SentenceEntry[] = []): Lesson => ({
  meta: { id, title: id, level: "A1" },
  entries: words.map(([lu, en]) => ({ lu, en })),
  sentences,
});

// RNG that always rolls below the word-match threshold (0.2) → always picks word-match
const wordMatchRng = () => 0.1;
// RNG that always rolls above word-match threshold → always picks sentence-builder
const sentenceRng = () => 0.5;

// Always rolls into the not-yet-mastered bucket (0.0 < 0.3) and picks index 0.
// Used to force selection of the not-yet-mastered sub-pool inside word-match slots.
const notYetMasteredRng = () => 0.0;

const stats = (shown: number, correct = 0, incorrect = 0): WordStats =>
  ({ shown, correct, incorrect });

// ─── Basic shape ──────────────────────────────────────────────────────────────

describe("planLessonMode — shape", () => {
  const lessons = [
    lesson("A1_01", [["Moien", "hi"], ["Äddi", "bye"]], [sentence("Good morning", "Gudde Moien")]),
    lesson("A1_02", [["Merci", "thanks"]], [sentence("Goodbye", "Äddi")]),
  ];

  it("returns LESSON.totalSlots planned slots", () => {
    const config = planLessonMode(lessons, "A1_02", {}, wordMatchRng);
    expect(config.plannedSlots).toBe(LESSON.totalSlots);
  });

  it("queue length matches planned slots when enough words available", () => {
    const config = planLessonMode(lessons, "A1_02", {}, wordMatchRng);
    expect(config.queue.length).toBe(LESSON.totalSlots);
  });

  it("blockBoundaries are [5, 10, 15]", () => {
    const config = planLessonMode(lessons, "A1_02");
    expect(config.blockBoundaries).toEqual([
      LESSON.slotsPerBlock,
      2 * LESSON.slotsPerBlock,
      3 * LESSON.slotsPerBlock,
    ]);
  });

  it("hasCorrectionBlock is true", () => {
    expect(planLessonMode(lessons, "A1_02").hasCorrectionBlock).toBe(true);
  });

  it("completionEffect is unlock-check", () => {
    expect(planLessonMode(lessons, "A1_02").completionEffect).toBe("unlock-check");
  });

  it("currentLessonId matches upperBoundId", () => {
    const config = planLessonMode(lessons, "A1_01");
    expect(config.currentLessonId).toBe("A1_01");
  });

  it("produces word-match slots when rng always picks word-match bucket", () => {
    const config = planLessonMode(lessons, "A1_02", {}, wordMatchRng);
    expect(config.queue.every((s) => s.type === "word-match")).toBe(true);
  });
});

// ─── Upper-bound clamp ────────────────────────────────────────────────────────

describe("planLessonMode — upper-bound clamp", () => {
  const l01 = lesson("A1_01", [["Moien", "hi"], ["Äddi", "bye"]]);
  const l02 = lesson("A1_02", [["Merci", "thanks"]]);
  const l03 = lesson("A1_03", [["Jo", "yes"]]);

  it("clamps pool to lessons <= upperBoundId (lexicographic)", () => {
    // upperBound = A1_01 → only A1_01 is in pool → currentLessonId = A1_01
    const config = planLessonMode([l01, l02, l03], "A1_01", {}, wordMatchRng);
    expect(config.currentLessonId).toBe("A1_01");
  });

  it("includes lessons up to but NOT beyond the upper bound", () => {
    // upperBound = A1_02 → pool = [A1_01, A1_02], A1_03 excluded
    const config = planLessonMode([l01, l02, l03], "A1_02");
    expect(config.currentLessonId).toBe("A1_02");
    // All pairs come from A1_01 or A1_02 — verify by checking no A1_03 word appears
    const allWords = config.queue
      .flatMap((b) => b.type === "word-match" ? b.pairs : [])
      .map(([lu]) => lu);
    expect(allWords.some((lu) => lu === "Jo")).toBe(false);
  });
});

// ─── Empty / edge cases ───────────────────────────────────────────────────────

describe("planLessonMode — edge cases", () => {
  it("returns empty queue when no lessons match upperBoundId", () => {
    const config = planLessonMode([], "A1_01");
    expect(config.queue).toHaveLength(0);
    expect(config.completionEffect).toBe("unlock-check");
  });

  it("handles lesson with only words (no sentences) — falls back to word-match", () => {
    const noSentences = lesson("A1_01", [["Moien", "hi"], ["Äddi", "bye"]]);
    // Force sentence-builder roll — should fall back to word-match since no sentences
    const config = planLessonMode([noSentences], "A1_01", {}, sentenceRng);
    expect(config.queue.length).toBeGreaterThan(0);
    expect(config.queue.every((s) => s.type === "word-match")).toBe(true);
  });

  it("planner is callable with no stats (defaults to empty record)", () => {
    const l = lesson("A1_01", [["Moien", "hi"]]);
    // No third arg → all entries treated as not-yet-mastered, but planner still runs.
    const config = planLessonMode([l], "A1_01");
    expect(config.queue.length).toBe(LESSON.totalSlots);
  });
});

// ─── Not-yet-mastered bucket ──────────────────────────────────────────────────

describe("planLessonMode — not-yet-mastered bucket", () => {
  it("biases word-match draws toward current-lesson entries with correct < MASTERY_CORRECT_COUNT", () => {
    const l = lesson("A1_01", [
      ["Moien", "hi"],
      ["Äddi", "bye"],
      ["Merci", "thanks"],
    ]);
    // "Moien" is not yet mastered; the others have cleared the gate (correct >= 3).
    const userWords: Record<string, WordStats> = {
      [wordKey("Äddi", "bye")]: stats(MASTERY_CORRECT_COUNT, MASTERY_CORRECT_COUNT),
      [wordKey("Merci", "thanks")]: stats(MASTERY_CORRECT_COUNT, MASTERY_CORRECT_COUNT),
    };
    const config = planLessonMode([l], "A1_01", userWords, notYetMasteredRng);

    const pickedLu = config.queue
      .flatMap((b) => (b.type === "word-match" ? b.pairs : []))
      .map(([lu]) => lu);

    expect(pickedLu.length).toBeGreaterThan(0);
    // Every pick is the unmastered entry — bucket forced it.
    expect(pickedLu.every((lu) => lu === "Moien")).toBe(true);
  });

  it("keeps a well-shown-but-unmastered straggler in the bias pool", () => {
    // The regression this fix targets: shown many times, correct still < 3.
    // Under the old `shown < MIN_ANSWERS` rule this word dropped out of the
    // priority bucket and got abandoned; now it stays until correct >= 3.
    const l = lesson("A1_01", [["Moien", "hi"], ["Äddi", "bye"]]);
    const userWords: Record<string, WordStats> = {
      // "Moien": shown 10×, only 2 correct → past MIN_ANSWERS but not mastered.
      [wordKey("Moien", "hi")]: stats(10, 2, 8),
      // "Äddi": mastered.
      [wordKey("Äddi", "bye")]: stats(MASTERY_CORRECT_COUNT, MASTERY_CORRECT_COUNT),
    };
    const config = planLessonMode([l], "A1_01", userWords, notYetMasteredRng);
    const pickedLu = config.queue
      .flatMap((b) => (b.type === "word-match" ? b.pairs : []))
      .map(([lu]) => lu);
    expect(pickedLu.length).toBeGreaterThan(0);
    expect(pickedLu.every((lu) => lu === "Moien")).toBe(true);
  });

  it("re-rolls into another bucket when everything is mastered", () => {
    const l = lesson("A1_01", [["Moien", "hi"], ["Äddi", "bye"]]);
    // All entries have cleared the gate → not-yet-mastered pool is empty.
    const userWords: Record<string, WordStats> = {
      [wordKey("Moien", "hi")]: stats(MASTERY_CORRECT_COUNT, MASTERY_CORRECT_COUNT),
      [wordKey("Äddi", "bye")]: stats(MASTERY_CORRECT_COUNT, MASTERY_CORRECT_COUNT),
    };
    // RNG always rolls into the not-yet-mastered bucket (0.0). Re-roll fallback
    // must keep producing word-match slots from the current-lesson pool.
    const config = planLessonMode([l], "A1_01", userWords, notYetMasteredRng);
    expect(config.queue.length).toBe(LESSON.totalSlots);
    expect(config.queue.every((s) => s.type === "word-match")).toBe(true);
  });

  it("includes current-lesson sentences in the not-yet-mastered pool when any sentence has correct < MASTERY_CORRECT_COUNT", () => {
    const onlySentence = sentence("Good morning", "Gudde Moien");
    const l = lesson("A1_01", [["Moien", "hi"]], [onlySentence]);
    // Sentence not yet mastered → eligible for not-yet-mastered bucket.
    // Slot type 0.5 → sentence-builder; bucket roll 0.0 → not-yet-mastered; lesson 0;
    // sentence 0; direction 0.5 → en-lu.
    let i = 0;
    const seq = [0.5, 0.0, 0.0, 0.0, 0.5];
    const seqRng = () => seq[i++ % seq.length];
    const config = planLessonMode([l], "A1_01", {}, seqRng);
    const firstSlot = config.queue[0];
    expect(firstSlot.type).toBe("sentence-builder");
    if (firstSlot.type === "sentence-builder") {
      expect(firstSlot.item.phraseKey).toBe(phraseKey("en-lu", "Good morning"));
    }
  });

  it("not-yet-mastered sentence bucket targets only unmastered sentences, not the whole lesson", () => {
    // 3 sentences: only s1 is unmastered; s2 and s3 have cleared the gate.
    const s1 = sentence("Hello", "Moien");
    const s2 = sentence("Goodbye", "Äddi");
    const s3 = sentence("Thanks", "Merci");
    const l = lesson("A1_01", [["Foo", "bar"]], [s1, s2, s3]);
    const userWords: Record<string, WordStats> = {
      [phraseKey("en-lu", "Goodbye")]: stats(MASTERY_CORRECT_COUNT, MASTERY_CORRECT_COUNT),
      [phraseKey("en-lu", "Thanks")]: stats(MASTERY_CORRECT_COUNT, MASTERY_CORRECT_COUNT),
    };
    // Force not-yet-mastered bucket (roll 0.0) for all sentence picks.
    // With old code the whole lesson was in the pool, so s2/s3 could appear.
    // With new code only s1 (correct < gate) is in the not-yet-mastered pool.
    let i = 0;
    const seq = [0.5, 0.0, 0.0, 0.0, 0.5]; // sentence-builder; not-yet-mastered; idx 0; sent 0; en-lu
    const seqRng = () => seq[i++ % seq.length];
    const config = planLessonMode([l], "A1_01", userWords, seqRng);
    const firstSlot = config.queue[0];
    expect(firstSlot.type).toBe("sentence-builder");
    if (firstSlot.type === "sentence-builder") {
      // Must be s1 — the only unmastered sentence
      expect(firstSlot.item.phraseKey).toBe(phraseKey("en-lu", "Hello"));
    }
  });
});

// ─── Adaptive slot-type split ─────────────────────────────────────────────────

describe("lessonSlotTypeDistribution", () => {
  const share = (buckets: ReadonlyArray<{ name: string; upTo: number }>) =>
    buckets.find((b) => b.name === "word-match")!.upTo;

  it("falls back to MIN when there is no backlog", () => {
    expect(share(lessonSlotTypeDistribution(0, 0))).toBe(LESSON.wordMatchShare.min);
  });

  it("clamps to MAX when backlog is all words", () => {
    expect(share(lessonSlotTypeDistribution(100, 0))).toBe(LESSON.wordMatchShare.max);
  });

  it("clamps to MIN when backlog is all sentences", () => {
    expect(share(lessonSlotTypeDistribution(0, 100))).toBe(LESSON.wordMatchShare.min);
  });

  it("scales with the word ratio inside the clamp band", () => {
    // 40 words / 60 sentences → raw ratio 0.4, within [0.2, 0.6] → passes through.
    expect(share(lessonSlotTypeDistribution(40, 60))).toBeCloseTo(0.4);
  });

  it("last bucket always closes at 1.0", () => {
    const buckets = lessonSlotTypeDistribution(50, 50);
    expect(buckets[buckets.length - 1].upTo).toBe(1.0);
  });
});

describe("planLessonMode — adaptive split integration", () => {
  // A lesson with many unmastered words and few sentences should schedule more
  // word-match slots than the historical fixed 20%. We drive with a ramped RNG
  // so the slot-type roll lands just under the share threshold proportionally.
  it("schedules more word-match slots when the backlog is word-heavy", () => {
    // 20 words (all unmastered), 1 sentence (mastered) → share clamps toward MAX.
    const words: [string, string][] = Array.from({ length: 20 }, (_, i) => [`lu${i}`, `en${i}`]);
    const l = lesson("A1_01", words, [sentence("Hi", "Moien")]);
    const userWords: Record<string, WordStats> = {
      [phraseKey("en-lu", "Hi")]: stats(MASTERY_CORRECT_COUNT, MASTERY_CORRECT_COUNT),
    };
    // Roll 0.5 for slot-type: under 0.6 (MAX) → word-match, but over 0.2 (old MIN).
    // Under the old fixed 0.2 split this same roll would have been sentence-builder.
    const wordCount = planLessonMode([l], "A1_01", userWords, () => 0.5).queue
      .filter((s) => s.type === "word-match").length;
    expect(wordCount).toBe(LESSON.totalSlots);
  });
});

// ─── Deduplication ────────────────────────────────────────────────────────────

describe("planLessonMode — deduplication", () => {
  it("word-match slots do not contain duplicate pairs", () => {
    // 10 words — enough that with-replacement draws could otherwise repeat.
    const words: [string, string][] = Array.from(
      { length: 10 },
      (_, i) => [`lu${i}`, `en${i}`],
    );
    const l = lesson("A1_01", words);
    const config = planLessonMode([l], "A1_01", {}, wordMatchRng);
    for (const slot of config.queue) {
      if (slot.type !== "word-match") continue;
      const keys = slot.pairs.map(([lu, en]) => `${lu}|${en}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("sentence phraseKeys do not repeat across slots when pool is large enough", () => {
    // 20 sentences — more than the 15 slots in a session.
    const sentences = Array.from({ length: 20 }, (_, i) =>
      sentence(`en${i}`, `lu${i}`),
    );
    const l = lesson("A1_01", [["Foo", "bar"]], sentences);
    // Each 5-call group: [slot-type=sentence-builder, bucket=current, lesson-idx=0,
    //                     sentence-idx=i/20, direction=en-lu]
    // sentence-idx i/20 ensures each of the 15 slots selects a distinct sentence
    // (sentences 0..14) so the deduplication check always finds a fresh key.
    const seq = Array.from({ length: LESSON.totalSlots }, (_, i) =>
      [0.5, 0.5, 0.0, i / 20, 0.5],
    ).flat();
    let idx = 0;
    const seqRng = () => seq[idx++ % seq.length];
    const config = planLessonMode([l], "A1_01", {}, seqRng);
    const keys = config.queue
      .filter((s) => s.type === "sentence-builder")
      .map((s) => (s.type === "sentence-builder" ? s.item.phraseKey : ""));
    expect(keys.length).toBe(LESSON.totalSlots);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keeps strict sentence dedup while the backlog can still fill a session", () => {
    // 20 unmastered sentences ≥ LESSON.totalSlots → variety guarantee still holds.
    const sentences = Array.from({ length: 20 }, (_, i) => sentence(`en${i}`, `lu${i}`));
    const l = lesson("A1_01", [["Foo", "bar"]], sentences);
    const seq = Array.from({ length: LESSON.totalSlots }, (_, i) =>
      [0.5, 0.0, 0.0, i / 20, 0.5],
    ).flat();
    let idx = 0;
    const seqRng = () => seq[idx++ % seq.length];
    const config = planLessonMode([l], "A1_01", {}, seqRng);
    const keys = config.queue
      .filter((s) => s.type === "sentence-builder")
      .map((s) => (s.type === "sentence-builder" ? s.item.phraseKey : ""));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("never repeats an already-mastered sentence, even in the endgame", () => {
    // One straggler + one mastered sentence: the mastered one keeps its cap of 1.
    const straggler = sentence("stuck", "gepléckt");
    const done = sentence("done", "fäerdeg");
    const userWords: Record<string, WordStats> = {
      [phraseKey("en-lu", "done")]: stats(5, MASTERY_CORRECT_COUNT),
    };
    const l = lesson("A1_01", [["Foo", "bar"]], [straggler, done]);
    // Sentence-builder always; bucket roll 0.5 → `current` pool (both sentences).
    const seq = [0.5, 0.5, 0.0, 0.99, 0.5]; // sentence-idx 0.99 → the mastered one
    let idx = 0;
    const config = planLessonMode([l], "A1_01", userWords, () => seq[idx++ % seq.length]);
    const doneCount = config.queue.filter(
      (s) => s.type === "sentence-builder" && s.item.promptText === "done",
    ).length;
    expect(doneCount).toBeLessThanOrEqual(1);
  });

  it("allows sentence repeats when pool is smaller than available sentence slots", () => {
    // 2 sentences but sentence-builder always rolls → exhausts unique pool quickly.
    const s1 = sentence("Hello", "Moien");
    const s2 = sentence("Bye", "Äddi");
    const l = lesson("A1_01", [["Foo", "bar"]], [s1, s2]);
    const config = planLessonMode([l], "A1_01", {}, sentenceRng);
    // Should still produce LESSON.totalSlots slots (not silently drop them).
    expect(config.queue.length).toBe(LESSON.totalSlots);
    expect(config.queue.every((s) => s.type === "sentence-builder")).toBe(true);
  });
});

// ─── Endgame convergence ──────────────────────────────────────────────────────

// A sentence earns at most +1 `correct` per appearance. While each was capped at
// one appearance per Session, a lesson whose remaining backlog was sentences
// could not move its percentage for three Sessions — the "stuck at 98%" report.
// These tests pin the fix: a not-yet-mastered sentence may be scheduled
// MASTERY_CORRECT_COUNT times, so the tail clears like a word tail does.
describe("planLessonMode — endgame convergence", () => {
  // Deterministic PRNG: fixed seeds keep these tests reproducible while staying
  // robust to how many rng calls the planner's internals happen to make.
  const seeded = (seed: number) => {
    let s = seed >>> 0;
    return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  };

  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

  // 20 sentences + 10 words; everything mastered except one sentence.
  const sentences = Array.from({ length: 20 }, (_, i) => sentence(`en${i}`, `lu${i}`));
  const words: [string, string][] = Array.from({ length: 10 }, (_, i) => [`w${i}`, `word${i}`]);
  const straggler = sentences[19];
  const endgameLesson = lesson("A1_01", words, sentences);
  const endgameStats: Record<string, WordStats> = {
    ...Object.fromEntries(words.map(([lu, en]) => [wordKey(lu, en), stats(5, MASTERY_CORRECT_COUNT)])),
    ...Object.fromEntries(
      sentences
        .slice(0, 19)
        .map((s) => [phraseKey("en-lu", s.enVariants[0]), stats(5, MASTERY_CORRECT_COUNT)]),
    ),
  };

  const stragglerSlots = (seed: number) =>
    planLessonMode([endgameLesson], "A1_01", endgameStats, seeded(seed)).queue.filter(
      (s) => s.type === "sentence-builder" && s.item.promptText === straggler.enVariants[0],
    ).length;

  it("can schedule the last unmastered sentence enough times to clear the gate in one session", () => {
    const counts = SEEDS.map(stragglerSlots);
    expect(Math.max(...counts)).toBe(MASTERY_CORRECT_COUNT);
  });

  it("schedules it more than once per session — the old cap was 1", () => {
    const counts = SEEDS.map(stragglerSlots);
    expect(counts.filter((c) => c > 1).length).toBeGreaterThan(0);
  });

  it("clears a sentence-only tail within three perfect sessions", () => {
    // Plays each planned slot correctly and folds the results back into stats,
    // exactly as a completed Session does via useProgressSync.
    const playSession = (
      userWords: Record<string, WordStats>,
      rng: () => number,
    ): Record<string, WordStats> =>
      planLessonMode([endgameLesson], "A1_01", userWords, rng).queue.reduce((acc, ex) => {
        const keys =
          ex.type === "word-match"
            ? ex.pairs.map(([lu, en]) => wordKey(lu, en))
            : [ex.item.phraseKey];
        return keys.reduce((inner, key) => {
          const c = inner[key] ?? { shown: 0, correct: 0, incorrect: 0 };
          return { ...inner, [key]: { ...c, shown: c.shown + 1, correct: c.correct + 1 } };
        }, acc);
      }, userWords);

    SEEDS.forEach((seed) => {
      const rng = seeded(seed);
      const after = [1, 2, 3].reduce((s) => playSession(s, rng), endgameStats);
      expect(computeLessonProgress(endgameLesson, after).isComplete).toBe(true);
    });
  });
});

// ─── @question support (shared with the exam track) ───────────────────────────

describe("planLessonMode — question sentences", () => {
  // Course lessons are not a special case: a `.letz` sentence carrying
  // @question behaves in Lesson Mode exactly as it does in Exam Mode, because
  // the rule lives in buildSentenceExercise (Layer 1), not in either planner.
  const questionSentence: SentenceEntry = {
    enVariants: ["My name is Luca."],
    luVariants: ["Ech heesche Luca."],
    question: "Wéi heescht Dir?",
    distractorsEn: [],
    distractorsLu: [],
  };

  it("carries the question into the exercise and forces en→lu", () => {
    // 0.9 would roll lu-en for a plain sentence; the question must win.
    const seq = [0.5, 0.9];
    let idx = 0;
    const rng = () => seq[idx++ % seq.length];
    const l = lesson("A1_01", [["Moien", "hi"]], [questionSentence]);
    const config = planLessonMode([l], "A1_01", {}, rng);
    const slots = config.queue.filter((s) => s.type === "sentence-builder");
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      if (slot.type === "sentence-builder") {
        expect(slot.item.question).toBe("Wéi heescht Dir?");
        expect(slot.item.direction).toBe("en-lu");
      }
    }
  });
});
