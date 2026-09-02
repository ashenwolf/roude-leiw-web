import { describe, expect, it } from "vitest";

// The scripts tree is deliberately plain ESM Node (no types); the app-side
// parity of `slugify` is covered in audio-slug.test.ts. This file pins the
// extraction boundaries the generators depend on.
// @ts-expect-error untyped .mjs module
import { extractLuPhrases, extractQuestions } from "../../scripts/lib/letz-audio.mjs";

const LESSON = `@lesson A1.01 "Greetings"

@word Moien = hello

@sentence
@lu Gudde Moien!
@en Good morning!

@fill
@lu Hie wunnt niewent enger [franséischer] Famill.
@en He lives next to a [French] family.

@sentence
@lu Ech wunnen zu Lëtzebuerg.
@lu Ech wunnen an Lëtzebuerg.
@en I live in Luxembourg.
`;

describe("extractLuPhrases", () => {
  // A fill's @lu carries [bracketed] blanks: voicing it would read the answer
  // aloud and key the mp3 to a slug no sentence lookup can request. This
  // leaked once and produced ~767 dead files.
  it("treats @fill as a block boundary, not a continuing sentence", () => {
    const phrases = extractLuPhrases(LESSON) as string[];
    expect(phrases).toEqual([
      "Gudde Moien!",
      "Ech wunnen zu Lëtzebuerg.",
      "Ech wunnen an Lëtzebuerg.",
    ]);
    expect(phrases.some((p) => p.includes("["))).toBe(false);
  });

  it("returns every @lu variant of a sentence separately", () => {
    const phrases = extractLuPhrases(`@sentence\n@lu A\n@lu B\n@en x\n`) as string[];
    expect(phrases).toEqual(["A", "B"]);
  });

  it("ignores commented-out directives", () => {
    expect(extractLuPhrases(`# @sentence\n# @lu Nope\n`)).toEqual([]);
  });

  it("ignores @lu outside any sentence block", () => {
    expect(extractLuPhrases(`@word a = b\n@lu Stray\n`)).toEqual([]);
  });
});

describe("extractQuestions", () => {
  it("extracts @question lines and skips commented ones", () => {
    const content = `@sentence\n@question Wou fuert Dir?\n@lu Mir fueren.\n# @question Not this one\n`;
    expect(extractQuestions(content)).toEqual(["Wou fuert Dir?"]);
  });
});
