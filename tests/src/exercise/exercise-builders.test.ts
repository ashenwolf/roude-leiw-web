import { describe, it, expect } from "vitest";

import {
  tokenizeSentence,
  buildWordMatchExercise,
  buildSentenceExercise,
  chunkIntoWordMatchExercises,
  parseFillLine,
  stripBlankMarkers,
  buildFillExercise,
} from "../../../src/exercise/exercise-builders.ts";

import type { FillEntry, SentenceEntry, WordEntry } from "../../../src/exercise/letz-parser.ts";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const word = (lu: string, en: string): WordEntry => ({ lu, en });

const sentence = (
  enVariants: string[],
  luVariants: string[],
  distractorsEn: string[] = [],
  distractorsLu: string[] = [],
): SentenceEntry => ({ enVariants, luVariants, distractorsEn, distractorsLu });

const fill = (
  en: string,
  lu: string,
  distractorsLu: string[] = [],
  distractorsEn: string[] = [],
): FillEntry => ({ en, lu, distractorsEn, distractorsLu });

// ─── tokenizeSentence ─────────────────────────────────────────────────────────

describe("tokenizeSentence", () => {
  it("splits a plain sentence into word tokens", () => {
    expect(tokenizeSentence("Gudde Moien", "lu")).toEqual(["Gudde", "Moien"]);
    expect(tokenizeSentence("Good morning", "en")).toEqual(["Good", "morning"]);
  });

  it("strips trailing punctuation", () => {
    expect(tokenizeSentence("Moien!", "lu")).toEqual(["Moien"]);
    expect(tokenizeSentence("Hello, world.", "en")).toEqual(["Hello", "world"]);
  });

  it("splits LU contractions after the apostrophe", () => {
    // "d'Mamm" → ["d'", "Mamm"]
    expect(tokenizeSentence("d'Mamm", "lu")).toEqual(["d'", "Mamm"]);
  });

  it("splits EN contractions before the apostrophe", () => {
    // "Who's" → ["Who", "'s"]
    expect(tokenizeSentence("Who's", "en")).toEqual(["Who", "'s"]);
  });

  it("handles sentences with multiple contractions", () => {
    expect(tokenizeSentence("d'Mamm an d'Papp", "lu")).toEqual(["d'", "Mamm", "an", "d'", "Papp"]);
  });

  it("filters out empty tokens from multiple spaces", () => {
    expect(tokenizeSentence("Gudde  Moien", "lu")).toEqual(["Gudde", "Moien"]);
  });
});

// ─── buildWordMatchExercise ───────────────────────────────────────────────────

describe("buildWordMatchExercise", () => {
  it("returns a word-match exercise with pairs derived from entries", () => {
    const pairs = [word("Moien", "hi"), word("Äddi", "bye")];
    const exercise = buildWordMatchExercise(pairs);

    expect(exercise.type).toBe("word-match");
    expect(exercise.pairs).toHaveLength(2);
    expect(exercise.pairs[0]).toEqual(["Moien", "hi"]);
    expect(exercise.pairs[1]).toEqual(["Äddi", "bye"]);
  });

  it("returns empty pairs array for empty input", () => {
    expect(buildWordMatchExercise([]).pairs).toHaveLength(0);
  });
});

// ─── buildSentenceExercise ────────────────────────────────────────────────────

describe("buildSentenceExercise — en→lu direction", () => {
  it("sets promptText to the first EN variant", () => {
    const entry = sentence(["Good morning"], ["Gudde Moien"]);
    const ex = buildSentenceExercise(entry, "en-lu", []);
    expect(ex.item.promptText).toBe("Good morning");
  });

  it("passes question through when assembling the LU answer", () => {
    const entry = { ...sentence(["We are going to France."], ["Mir fueren a Frankräich."]), question: "Wou fuert Dir?" };
    const ex = buildSentenceExercise(entry, "en-lu", []);
    expect(ex.item.question).toBe("Wou fuert Dir?");
  });

  // The question→direction rule is intrinsic to the content, so a caller that
  // rolls lu→en for a question sentence is overridden rather than obeyed —
  // every Mode gets the behaviour without repeating the rule.
  it("overrides a rolled lu→en direction to en→lu for question sentences", () => {
    const entry = { ...sentence(["We are going to France."], ["Mir fueren a Frankräich."]), question: "Wou fuert Dir?" };
    const ex = buildSentenceExercise(entry, "lu-en", []);
    expect(ex.item.direction).toBe("en-lu");
    expect(ex.item.question).toBe("Wou fuert Dir?");
    expect(ex.item.phraseKey).toBe("phrase:en-lu:We are going to France.");
  });

  it("leaves direction alone for sentences without a question", () => {
    const ex = buildSentenceExercise(sentence(["Good morning"], ["Gudde Moien"]), "lu-en", []);
    expect(ex.item.direction).toBe("lu-en");
  });

  it("leaves question undefined when the entry has none", () => {
    const entry = sentence(["Good morning"], ["Gudde Moien"]);
    const ex = buildSentenceExercise(entry, "en-lu", []);
    expect(ex.item.question).toBeUndefined();
  });

  // Prompt-audio rule: audio voices the prompt as presented. A Q&A sentence
  // plays its question; a lu→en sentence plays the Luxembourgish prompt; a
  // plain en→lu sentence gets NO audio — the Luxembourgish is the answer, and
  // hearing it would leak the tiles to assemble.
  it("uses the question audio for Q&A sentences", () => {
    const entry = {
      ...sentence(["We are going to France."], ["Mir fueren a Frankräich."]),
      question: "Wou fuert Dir?",
      questionAudioUrl: "/x/audio/questions/wou-fuert-dir.mp3",
      luAudioUrl: "/x/audio/mir-fueren-a-frankraich.mp3",
    };
    const ex = buildSentenceExercise(entry, "en-lu", []);
    expect(ex.item.audioUrl).toBe("/x/audio/questions/wou-fuert-dir.mp3");
  });

  it("withholds audio for plain en→lu — the LU phrase is the answer", () => {
    const entry = {
      ...sentence(["Good morning"], ["Gudde Moien"]),
      luAudioUrl: "/x/audio/gudde-moien.mp3",
    };
    const ex = buildSentenceExercise(entry, "en-lu", []);
    expect(ex.item.audioUrl).toBeUndefined();
  });

  it("sets acceptedAnswers to LU variants", () => {
    const entry = sentence(["Good morning"], ["Gudde Moien", "Moien"]);
    const ex = buildSentenceExercise(entry, "en-lu", []);
    expect(ex.item.acceptedAnswers).toEqual(["Gudde Moien", "Moien"]);
  });

  it("produces tokens covering all accepted variants (multiset union)", () => {
    // "Gudde Moien" needs tokens ["Gudde", "Moien"]
    // A second variant "Moien" only needs ["Moien"]
    // Union: max(1,0) "Gudde" + max(1,1) "Moien" = ["Gudde", "Moien"]
    const entry = sentence(["Good morning"], ["Gudde Moien", "Moien"]);
    const ex = buildSentenceExercise(entry, "en-lu", []);
    const tokenSet = new Set(ex.item.tokens);
    expect(tokenSet.has("Gudde")).toBe(true);
    expect(tokenSet.has("Moien")).toBe(true);
  });

  it("preserves duplicate tokens needed by any single variant", () => {
    // "d'Mamm an d'Papp" tokenises to ["d'", "Mamm", "an", "d'", "Papp"]
    // Two "d'" chips are required.
    const entry = sentence(["Mom and dad"], ["d'Mamm an d'Papp"]);
    const ex = buildSentenceExercise(entry, "en-lu", []);
    const dApostrophe = ex.item.tokens.filter((t) => t === "d'");
    expect(dApostrophe.length).toBeGreaterThanOrEqual(2);
  });

  it("uses authored LU distractors when provided", () => {
    const entry = sentence(["Good morning"], ["Gudde Moien"], [], ["Äddi", "Owend"]);
    const ex = buildSentenceExercise(entry, "en-lu", []);
    expect(ex.item.tokens).toContain("Äddi");
    expect(ex.item.tokens).toContain("Owend");
  });

  it("falls back to lessonVocab for distractors when none authored", () => {
    const entry = sentence(["Good morning"], ["Gudde Moien"]);
    const ex = buildSentenceExercise(entry, "en-lu", ["Äddi", "Merci", "Jo"]);
    // lessonVocab items not in the target tokens should appear as distractors
    expect(ex.item.tokens).toContain("Äddi");
  });

  it("drops authored distractor tokens that collide with an accepted-answer token", () => {
    // "name" is part of the answer, so the "first name"/"surname" distractors
    // must not contribute a "name" tile. Only the genuinely-wrong tokens survive.
    const entry = sentence(
      ["What is your name?"],
      ["Wéi ass Ären Numm?"],
      [],
      ["Virnumm", "Numm"], // "Numm" collides with the answer
    );
    const ex = buildSentenceExercise(entry, "en-lu", []);
    const nummChips = ex.item.tokens.filter((t) => t === "Numm");
    // exactly one "Numm" — from the answer, none from the distractor
    expect(nummChips).toHaveLength(1);
    expect(ex.item.tokens).toContain("Virnumm");
  });

  it("falls back to lessonVocab when every authored distractor collides", () => {
    const entry = sentence(
      ["I do sports from eight to nine."],
      ["Ech maache vun aacht bis néng."],
      [],
      ["vun", "bis"], // both are in the answer → filtered out entirely
    );
    const ex = buildSentenceExercise(entry, "en-lu", ["Owend", "Merci"]);
    // authored list emptied → lessonVocab distractors used
    expect(ex.item.tokens).toContain("Owend");
  });

  it("records the phraseKey under the actual presented direction", () => {
    const entry = sentence(["Good morning"], ["Gudde Moien"]);
    // Each presentation direction is tracked separately so the error pool can
    // repeat the exact direction the user failed.
    expect(buildSentenceExercise(entry, "en-lu", []).item.phraseKey).toBe("phrase:en-lu:Good morning");
    expect(buildSentenceExercise(entry, "lu-en", []).item.phraseKey).toBe("phrase:lu-en:Good morning");
  });

  it("sets direction field", () => {
    const entry = sentence(["Good morning"], ["Gudde Moien"]);
    expect(buildSentenceExercise(entry, "en-lu", []).item.direction).toBe("en-lu");
  });
});

describe("buildSentenceExercise — lu→en direction", () => {
  it("plays the Luxembourgish prompt's audio when it IS the prompt", () => {
    const entry = {
      ...sentence(["Good morning"], ["Gudde Moien"]),
      luAudioUrl: "/x/audio/gudde-moien.mp3",
    };
    const ex = buildSentenceExercise(entry, "lu-en", []);
    expect(ex.item.audioUrl).toBe("/x/audio/gudde-moien.mp3");
  });

  it("sets promptText to the first LU variant", () => {
    const entry = sentence(["Good morning"], ["Gudde Moien"]);
    const ex = buildSentenceExercise(entry, "lu-en", []);
    expect(ex.item.promptText).toBe("Gudde Moien");
  });

  it("sets acceptedAnswers to EN variants", () => {
    const entry = sentence(["Good morning", "Morning"], ["Gudde Moien"]);
    const ex = buildSentenceExercise(entry, "lu-en", []);
    expect(ex.item.acceptedAnswers).toEqual(["Good morning", "Morning"]);
  });

  it("uses authored EN distractors when provided", () => {
    const entry = sentence(["Good morning"], ["Gudde Moien"], ["Goodbye", "Evening"]);
    const ex = buildSentenceExercise(entry, "lu-en", []);
    expect(ex.item.tokens).toContain("Goodbye");
  });

  it("direction field is lu-en", () => {
    const entry = sentence(["Good morning"], ["Gudde Moien"]);
    expect(buildSentenceExercise(entry, "lu-en", []).item.direction).toBe("lu-en");
  });
});

// ─── chunkIntoWordMatchExercises ──────────────────────────────────────────────

describe("chunkIntoWordMatchExercises", () => {
  const words = (n: number): WordEntry[] =>
    Array.from({ length: n }, (_, i) => word(`lu${i}`, `en${i}`));
  const sizing = { pairCount: 5 };
  const sizes = (n: number) =>
    chunkIntoWordMatchExercises(words(n), sizing).map((e) => e.pairs.length);

  it("splits into exact chunks when evenly divisible", () => {
    expect(sizes(15)).toEqual([5, 5, 5]);
  });

  it("pads an uneven list up to full slots instead of merging", () => {
    expect(sizes(12)).toEqual([5, 5, 5]);
    expect(sizes(8)).toEqual([5, 5]);
    expect(sizes(21)).toEqual([5, 5, 5, 5, 5]);
  });

  it("keeps a lone short slot when there is nothing to pad from", () => {
    expect(sizes(2)).toEqual([2]);
    expect(sizes(5)).toEqual([5]);
  });

  it("returns nothing for an empty list", () => {
    expect(chunkIntoWordMatchExercises([], sizing)).toEqual([]);
  });

  it("covers every entry at least once", () => {
    const pairs = chunkIntoWordMatchExercises(words(23), sizing).flatMap((e) => e.pairs);
    expect(new Set(pairs.map(([lu]) => lu)).size).toBe(23);
  });

  // WordMatch matches by VALUE, so two identical tiles make every pairing between
  // them correct — two unmissable taps rather than two decisions.
  it("never repeats a word within one slot", () => {
    for (const n of [6, 7, 11, 12, 17, 19, 23, 28, 41, 65]) {
      for (const exercise of chunkIntoWordMatchExercises(words(n), sizing)) {
        const lus = exercise.pairs.map(([lu]) => lu);
        expect(new Set(lus).size, `n=${n}`).toBe(lus.length);
      }
    }
  });
});

// ─── parseFillLine ────────────────────────────────────────────────────────────

describe("parseFillLine", () => {
  it("splits a line into frame segments and blanks", () => {
    const { frame, blanks } = parseFillLine("Am Hannergrond [gesinn] ech [d'Rad].");
    expect(frame).toEqual(["Am Hannergrond ", " ech ", "."]);
    expect(blanks).toEqual(["gesinn", "d'Rad"]);
  });

  it("always returns exactly one more frame segment than blanks", () => {
    const lines = [
      "no blanks at all",
      "[one]",
      "[a] b [c]",
      "a [b] c [d] e [f] g [h] i",
      "[a][b]",
    ];
    for (const line of lines) {
      const { frame, blanks } = parseFillLine(line);
      expect(frame).toHaveLength(blanks.length + 1);
    }
  });

  it("returns the whole line as one frame segment when there are no blanks", () => {
    expect(parseFillLine("Ech sinn midd.")).toEqual({ frame: ["Ech sinn midd."], blanks: [] });
  });

  it("keeps a multi-word blank whole — one blank is one tile", () => {
    expect(parseFillLine("I see the [Ferris wheel].").blanks).toEqual(["Ferris wheel"]);
  });

  it("trims each blank but preserves frame spacing", () => {
    const { frame, blanks } = parseFillLine("a [  b  ] c");
    expect(blanks).toEqual(["b"]);
    expect(frame).toEqual(["a ", " c"]);
  });

  it("handles a blank at the start and at the end", () => {
    expect(parseFillLine("[Moien] ech")).toEqual({ frame: ["", " ech"], blanks: ["Moien"] });
    expect(parseFillLine("ech [sinn]")).toEqual({ frame: ["ech ", ""], blanks: ["sinn"] });
  });

  it("handles adjacent blanks with an empty frame segment between them", () => {
    expect(parseFillLine("[a][b]")).toEqual({ frame: ["", "", ""], blanks: ["a", "b"] });
  });

  it("leaves an unbalanced bracket as literal frame text (loud, visible failure)", () => {
    expect(parseFillLine("Ech [gesinn ech")).toEqual({
      frame: ["Ech [gesinn ech"],
      blanks: [],
    });
  });

  it("treats an empty blank as an empty-string answer rather than throwing", () => {
    expect(parseFillLine("a [] b")).toEqual({ frame: ["a ", " b"], blanks: [""] });
  });
});

// ─── stripBlankMarkers ────────────────────────────────────────────────────────

describe("stripBlankMarkers", () => {
  it("removes brackets but keeps the words", () => {
    expect(stripBlankMarkers("Am Hannergrond [gesinn] ech [d'Rad].")).toBe(
      "Am Hannergrond gesinn ech d'Rad.",
    );
  });

  it("is a no-op on a line without blanks", () => {
    expect(stripBlankMarkers("Ech sinn midd.")).toBe("Ech sinn midd.");
  });

  it("reproduces the original sentence for any parseFillLine input", () => {
    const line = "In the background I [see] the [Ferris wheel].";
    const { frame, blanks } = parseFillLine(line);
    const rebuilt = frame.reduce((acc, seg, i) => acc + seg + (blanks[i] ?? ""), "");
    expect(rebuilt).toBe(stripBlankMarkers(line));
  });
});

// ─── buildFillExercise ────────────────────────────────────────────────────────

describe("buildFillExercise", () => {
  const entry = fill(
    "In the background I [see] the [Ferris wheel].",
    "Am Hannergrond [gesinn] ech [d'Rad].",
    ["ginn", "de Bus"],
    ["give", "the bus"],
  );

  it("en→lu: gaps the LU line and prompts with the complete EN sentence", () => {
    const { item } = buildFillExercise(entry, "en-lu");
    expect(item.blanks).toEqual(["gesinn", "d'Rad"]);
    expect(item.frame).toEqual(["Am Hannergrond ", " ech ", "."]);
    expect(item.promptText).toBe("In the background I see the Ferris wheel.");
    expect(item.direction).toBe("en-lu");
  });

  it("lu→en: gaps the EN line and prompts with the complete LU sentence", () => {
    const { item } = buildFillExercise(entry, "lu-en");
    expect(item.blanks).toEqual(["see", "Ferris wheel"]);
    expect(item.promptText).toBe("Am Hannergrond gesinn ech d'Rad.");
    expect(item.direction).toBe("lu-en");
  });

  it("keys on the @en line and the presented direction", () => {
    expect(buildFillExercise(entry, "en-lu").item.fillKey).toBe(`fill:en-lu:${entry.en}`);
    expect(buildFillExercise(entry, "lu-en").item.fillKey).toBe(`fill:lu-en:${entry.en}`);
  });

  it("truncates the key identity to 64 chars to match the server validator", () => {
    const long = fill(`${"x".repeat(80)} [a]`, "[b]");
    const { item } = buildFillExercise(long, "en-lu");
    expect(item.fillKey).toBe(`fill:en-lu:${long.en.slice(0, 64)}`);
    expect(item.fillKey.length).toBe("fill:en-lu:".length + 64);
  });

  it("keeps a multi-word blank as a single tile — no tokenization", () => {
    const { item } = buildFillExercise(entry, "lu-en");
    expect(item.tokens).toContain("Ferris wheel");
    expect(item.tokens).not.toContain("Ferris");
  });

  it("keeps a multi-word distractor as a single tile", () => {
    const { item } = buildFillExercise(entry, "lu-en");
    expect(item.tokens).toContain("the bus");
    expect(item.tokens).not.toContain("bus");
  });

  it("offers exactly the blanks plus the direction's distractors as tiles", () => {
    const { item } = buildFillExercise(entry, "en-lu");
    expect([...item.tokens].sort()).toEqual(["d'Rad", "de Bus", "gesinn", "ginn"].sort());
  });

  it("drops a distractor that collides with a blank answer", () => {
    // "Gesinn!" normalizes to the blank "gesinn" — it would be a free correct tile.
    const colliding = fill("I [see].", "Ech [gesinn].", ["Gesinn!", "ginn"]);
    const { item } = buildFillExercise(colliding, "en-lu");
    expect(item.tokens).toEqual(expect.arrayContaining(["gesinn", "ginn"]));
    expect(item.tokens).toHaveLength(2);
  });

  it("drops blank and empty distractors", () => {
    const padded = fill("I [see].", "Ech [gesinn].", ["  ", "", " ginn "]);
    const { item } = buildFillExercise(padded, "en-lu");
    expect([...item.tokens].sort()).toEqual(["gesinn", "ginn"]);
  });

  it("works with no authored distractors — tiles are just the blanks", () => {
    const bare = fill("I [see].", "Ech [gesinn].");
    expect(buildFillExercise(bare, "en-lu").item.tokens).toEqual(["gesinn"]);
  });

  it("uses only the target language's distractors", () => {
    const { item } = buildFillExercise(entry, "en-lu");
    expect(item.tokens).not.toContain("the bus");
    expect(item.tokens).not.toContain("give");
  });

  it("allows blank counts to differ between the two directions", () => {
    // Word order differs per language, so no cross-language correspondence holds.
    const uneven = fill("I [see] it", "Ech [gesinn] [et]");
    expect(buildFillExercise(uneven, "en-lu").item.blanks).toHaveLength(2);
    expect(buildFillExercise(uneven, "lu-en").item.blanks).toHaveLength(1);
  });

  it("holds frame.length === blanks.length + 1 in both directions", () => {
    for (const direction of ["en-lu", "lu-en"] as const) {
      const { item } = buildFillExercise(entry, direction);
      expect(item.frame).toHaveLength(item.blanks.length + 1);
    }
  });
});
