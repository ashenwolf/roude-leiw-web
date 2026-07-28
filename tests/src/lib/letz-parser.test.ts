import { describe, it, expect } from "vitest";

import { parseLetz } from "../../../src/lib/letz-parser/index.ts";

// ============================================================================
// parseLetz — word entries
// ============================================================================

describe("parseLetz", () => {
  it("parses header and @word entries correctly", () => {
    const content = `
@lesson A1.01 "Basic Greetings"

@word Moien = good morning
@word Äddi = bye
@word Merci = thanks
    `.trim();

    const lesson = parseLetz(content, "A1.01");

    expect(lesson.meta).toEqual({ id: "A1.01", title: "Basic Greetings", level: "A1" });
    expect(lesson.entries).toEqual([
      { lu: "Moien", en: "good morning" },
      { lu: "Äddi", en: "bye" },
      { lu: "Merci", en: "thanks" },
    ]);
    expect(lesson.sentences).toEqual([]);
  });

  it("ignores comment lines", () => {
    const content = `
@lesson A1.02 "Numbers"

# This is a comment
@word eng = one
# Another comment
@word zwee = two
    `.trim();

    const lesson = parseLetz(content);

    expect(lesson.entries).toEqual([
      { lu: "eng", en: "one" },
      { lu: "zwee", en: "two" },
    ]);
  });

  it("uses fallbackId and default title when header is missing", () => {
    const content = "@word Moien = hi\n";
    const lesson = parseLetz(content, "A1.99");

    expect(lesson.meta.id).toBe("A1.99");
    expect(lesson.meta.title).toBe("Untitled Lesson");
  });

  it.each([
    ["A1.01 → A1", "A1.01", "A1"],
    ["B2.05 → B2", "B2.05", "B2"],
    ["C1.10 → C1", "C1.10", "C1"],
    ["no-level fallback → A1", "xyz", "A1"],
  ] as const)("extractLevel: %s", (_, fallbackId, expectedLevel) => {
    const content = "@word Moien = hi\n";
    const lesson = parseLetz(content, fallbackId);
    expect(lesson.meta.level).toBe(expectedLevel);
  });

  it("returns empty entries for a header-only file", () => {
    const content = '@lesson A1.01 "Empty Lesson"\n';
    const lesson = parseLetz(content);
    expect(lesson.entries).toHaveLength(0);
    expect(lesson.sentences).toHaveLength(0);
  });

  it("throws on malformed content (missing = separator)", () => {
    const content = "@lesson A1.01 \"Bad\"\n@word Moien hi\n";
    expect(() => parseLetz(content, "A1.01")).toThrow(/A1\.01/);
  });

  // ============================================================================
  // parseLetz — @sentence blocks
  // ============================================================================

  it("parses a @sentence block with single @lu and @en", () => {
    const content = `
@lesson A1.01 "Greetings"

@sentence
@lu Gudde Moien!
@en Good morning!
    `.trim();

    const lesson = parseLetz(content, "A1.01");
    expect(lesson.sentences).toHaveLength(1);
    expect(lesson.sentences[0].luVariants).toEqual(["Gudde Moien!"]);
    expect(lesson.sentences[0].enVariants).toEqual(["Good morning!"]);
    expect(lesson.sentences[0].distractorsEn).toBeUndefined();
    expect(lesson.sentences[0].distractorsLu).toBeUndefined();
  });

  it("parses multiple @lu and @en variants", () => {
    const content = `
@lesson A1.01 "Greetings"

@sentence
@lu Wéi heeschs du?
@lu Wéi heesche Sie?
@en What is your name?
@en What's your name?
    `.trim();

    const lesson = parseLetz(content, "A1.01");
    expect(lesson.sentences[0].luVariants).toEqual(["Wéi heeschs du?", "Wéi heesche Sie?"]);
    expect(lesson.sentences[0].enVariants).toEqual(["What is your name?", "What's your name?"]);
  });

  it("parses @distractor-en and @distractor-lu lines", () => {
    const content = `
@lesson A1.01 "Greetings"

@sentence
@lu Gudde Moien!
@en Good morning!
@distractor-en Good evening
@distractor-en Good afternoon
@distractor-lu Gudden Owend
    `.trim();

    const lesson = parseLetz(content, "A1.01");
    expect(lesson.sentences[0].distractorsEn).toEqual(["Good evening", "Good afternoon"]);
    expect(lesson.sentences[0].distractorsLu).toEqual(["Gudden Owend"]);
  });

  it("parses multiple @sentence blocks", () => {
    const content = `
@lesson A1.01 "Greetings"

@sentence
@lu Moien!
@en Hi!

@sentence
@lu Äddi!
@en Bye!
    `.trim();

    const lesson = parseLetz(content, "A1.01");
    expect(lesson.sentences).toHaveLength(2);
    expect(lesson.sentences[0].luVariants[0]).toBe("Moien!");
    expect(lesson.sentences[1].luVariants[0]).toBe("Äddi!");
  });

  it("excludes empty @sentence blocks (no @lu or @en)", () => {
    const content = `
@lesson A1.01 "Greetings"

@sentence

@sentence
@lu Moien!
@en Hi!
    `.trim();

    const lesson = parseLetz(content, "A1.01");
    expect(lesson.sentences).toHaveLength(1);
  });

  it("parses @question inside a @sentence block", () => {
    const content = `
@lesson V1.03 "Talking About Vacation"

@sentence
@question Wou fuert Dir an d'Vakanz?
@lu Mir fueren a Frankräich.
@en We are going to France.
    `.trim();

    const lesson = parseLetz(content, "V1.03");
    expect(lesson.sentences[0].question).toBe("Wou fuert Dir an d'Vakanz?");
    expect(lesson.sentences[0].luVariants).toEqual(["Mir fueren a Frankräich."]);
    expect(lesson.sentences[0].enVariants).toEqual(["We are going to France."]);
  });

  it("leaves question undefined when @question is absent", () => {
    const content = `
@lesson A1.01 "Greetings"

@sentence
@lu Moien!
@en Hi!
    `.trim();

    const lesson = parseLetz(content, "A1.01");
    expect(lesson.sentences[0].question).toBeUndefined();
  });

  it("scopes @question to its own @sentence block", () => {
    const content = `
@lesson V1.03 "Q&A"

@sentence
@question Wéi geet et?
@lu Et geet gutt.
@en I am fine.

@sentence
@lu Moien!
@en Hi!
    `.trim();

    const lesson = parseLetz(content, "V1.03");
    expect(lesson.sentences[0].question).toBe("Wéi geet et?");
    expect(lesson.sentences[1].question).toBeUndefined();
  });

  it("parses mixed @word and @sentence content correctly", () => {
    const content = `
@lesson A1.01 "Greetings"

@word Moien = hi
@word Äddi = bye

@sentence
@lu Gudde Moien!
@en Good morning!
    `.trim();

    const lesson = parseLetz(content, "A1.01");
    expect(lesson.entries).toHaveLength(2);
    expect(lesson.sentences).toHaveLength(1);
  });
});
