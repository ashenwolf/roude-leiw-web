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

  // ============================================================================
  // parseLetz — @image / @image-alt
  // ============================================================================

  it("parses @image and @image-alt onto meta", () => {
    const content = `
@lesson P1.01 "Fair"

@image "/assets/exam/picture/img/fair.jpg"
@image-alt "A busy funfair on a sunny afternoon."

@word d'Bild = the picture
    `.trim();

    const lesson = parseLetz(content, "picture.01");
    expect(lesson.meta.image).toBe("/assets/exam/picture/img/fair.jpg");
    expect(lesson.meta.imageAlt).toBe("A busy funfair on a sunny afternoon.");
  });

  // @image-alt without @image is the shipping state of the picture theme: it is
  // the caption of the placeholder frame, not merely alt text.
  it("parses @image-alt alone", () => {
    const content = `
@lesson P1.01 "Fair"

@image-alt "A busy funfair."

@word d'Bild = the picture
    `.trim();

    const lesson = parseLetz(content, "picture.01");
    expect(lesson.meta.image).toBeUndefined();
    expect(lesson.meta.imageAlt).toBe("A busy funfair.");
  });

  it("omits image fields entirely when neither directive is present", () => {
    const lesson = parseLetz('@lesson A1.01 "Greetings"\n@word Moien = hi\n', "A1.01");
    expect(lesson.meta).toEqual({ id: "A1.01", title: "Greetings", level: "A1" });
  });

  // Lesson-level and order-independent: they fold onto meta in visitLesson, not
  // in the header rule, so they may sit before @lesson or after the content.
  it("accepts @image before @lesson and after content", () => {
    const content = `
@image "/img/a.jpg"

@lesson A1.01 "Greetings"

@word Moien = hi

@image-alt "Alt text."
    `.trim();

    const lesson = parseLetz(content, "A1.01");
    expect(lesson.meta.id).toBe("A1.01");
    expect(lesson.meta.image).toBe("/img/a.jpg");
    expect(lesson.meta.imageAlt).toBe("Alt text.");
  });

  // A URL with a query string is exactly why the value is QuotedString and not
  // Text: a bare `=` terminates a Text run, so an unquoted path would not parse.
  it("accepts a quoted path containing = and #", () => {
    const content = '@lesson A1.01 "G"\n@image "/img/a.jpg?w=600#x"\n@word Moien = hi\n';
    const lesson = parseLetz(content, "A1.01");
    expect(lesson.meta.image).toBe("/img/a.jpg?w=600#x");
  });

  it("throws when @image value is unquoted", () => {
    const content = '@lesson A1.01 "G"\n@image /img/a.jpg\n';
    expect(() => parseLetz(content, "A1.01")).toThrow(/A1\.01/);
  });

  // AtImageAlt must precede AtImage in the token list, or maximal-munch lexes
  // "@image-alt" as AtImage followed by a stray "-alt" Text run.
  it("does not lex @image-alt as @image", () => {
    const content = '@lesson A1.01 "G"\n@image-alt "Alt."\n@word Moien = hi\n';
    const lesson = parseLetz(content, "A1.01");
    expect(lesson.meta.imageAlt).toBe("Alt.");
    expect(lesson.meta.image).toBeUndefined();
  });
  // ============================================================================
  // parseLetz — @fill
  // ============================================================================

  it("parses a @fill block with bracketed blanks intact", () => {
    const content = `
@lesson P1.01 "Fair"

@fill
  @lu Am Hannergrond [gesinn] ech [d'Rad].
  @en In the background I [see] the [Ferris wheel].
    `.trim();

    const lesson = parseLetz(content, "picture.01");
    expect(lesson.fills).toHaveLength(1);
    expect(lesson.fills[0].lu).toBe("Am Hannergrond [gesinn] ech [d'Rad].");
    expect(lesson.fills[0].en).toBe("In the background I [see] the [Ferris wheel].");
  });

  it("parses @distractor-lu / @distractor-en inside a @fill block", () => {
    const content = `
@lesson P1.01 "Fair"

@fill
  @lu Ech [gesinn] d'Rad.
  @en I [see] the wheel.
  @distractor-lu ginn
  @distractor-lu de Bus
  @distractor-en give
    `.trim();

    const lesson = parseLetz(content, "picture.01");
    expect(lesson.fills[0].distractorsLu).toEqual(["ginn", "de Bus"]);
    expect(lesson.fills[0].distractorsEn).toEqual(["give"]);
  });

  it("omits distractor fields when a @fill has none", () => {
    const content = '@lesson P1.01 "F"\n@fill\n  @lu Ech [sinn] midd.\n  @en I [am] tired.\n';
    expect(parseLetz(content, "picture.01").fills[0]).toEqual({
      lu: "Ech [sinn] midd.",
      en: "I [am] tired.",
    });
  });

  // Exactly one form per side is the mechanic's requirement; the grammar allows
  // extra @lu/@en lines, and the visitor keeps the first rather than throwing.
  it("keeps the first @lu / @en when a @fill block repeats them", () => {
    const content =
      '@lesson P1.01 "F"\n@fill\n  @lu Ech [sinn] midd.\n  @lu Ech [ginn] midd.\n  @en I [am] tired.\n';
    const lesson = parseLetz(content, "picture.01");
    expect(lesson.fills[0].lu).toBe("Ech [sinn] midd.");
  });

  it("drops a @fill block missing one side", () => {
    const content = '@lesson P1.01 "F"\n@fill\n  @lu Ech [sinn] midd.\n';
    expect(parseLetz(content, "picture.01").fills).toHaveLength(0);
  });

  it("keeps @fill and @sentence in separate collections", () => {
    const content = `
@lesson P1.01 "Fair"

@word d'Rad = the wheel

@sentence
  @lu Ech gesinn d'Rad.
  @en I see the wheel.

@fill
  @lu Ech [gesinn] d'Rad.
  @en I [see] the wheel.
    `.trim();

    const lesson = parseLetz(content, "picture.01");
    expect(lesson.entries).toHaveLength(1);
    expect(lesson.sentences).toHaveLength(1);
    expect(lesson.fills).toHaveLength(1);
    // A @sentence keeps no brackets; a @fill keeps them verbatim.
    expect(lesson.sentences[0].luVariants[0]).toBe("Ech gesinn d'Rad.");
    expect(lesson.fills[0].lu).toBe("Ech [gesinn] d'Rad.");
  });

  it("yields an empty fills array for a file with no @fill blocks", () => {
    expect(parseLetz('@lesson A1.01 "G"\n@word Moien = hi\n', "A1.01").fills).toEqual([]);
  });
});
