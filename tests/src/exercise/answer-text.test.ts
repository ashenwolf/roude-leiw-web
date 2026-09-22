import { describe, it, expect } from "vitest";

import { joinAssembled, normalizeAnswer } from "../../../src/exercise/answer-text.ts";

// ============================================================================
// joinAssembled
// ============================================================================

describe("joinAssembled", () => {
  it("joins plain words with spaces", () => {
    expect(joinAssembled(["Hello", "world"])).toBe("Hello world");
  });

  it("EN contraction: no space before suffix chip starting with apostrophe", () => {
    expect(joinAssembled(["I", "'m", "fine"])).toBe("I'm fine");
    expect(joinAssembled(["Who", "'s", "there"])).toBe("Who's there");
    expect(joinAssembled(["don", "'t", "stop"])).toBe("don't stop");
  });

  it("LU contraction: no space after prefix chip ending with apostrophe", () => {
    expect(joinAssembled(["d'", "Mamm"])).toBe("d'Mamm");
    expect(joinAssembled(["D'", "Zopp", "ass", "gutt"])).toBe("D'Zopp ass gutt");
  });

  it("empty array returns empty string", () => {
    expect(joinAssembled([])).toBe("");
  });
});

// ============================================================================
// normalizeAnswer
// ============================================================================

describe("normalizeAnswer", () => {
  it("trims and lowercases", () => {
    expect(normalizeAnswer("  Hello  ")).toBe("hello");
  });

  it("collapses internal whitespace", () => {
    expect(normalizeAnswer("I  am  fine")).toBe("i am fine");
  });

  it("strips trailing punctuation", () => {
    expect(normalizeAnswer("Gudde Moien!")).toBe("gudde moien");
    expect(normalizeAnswer("What is your name?")).toBe("what is your name");
  });

  it("strips apostrophes for comparison", () => {
    expect(normalizeAnswer("What's your name?")).toBe("whats your name");
    expect(normalizeAnswer("I'm fine.")).toBe("im fine");
  });
});
