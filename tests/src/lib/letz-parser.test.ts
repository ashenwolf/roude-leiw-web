import { describe, it, expect } from "vitest";

import { parseLetz } from "../../../src/lib/letz-parser/index.ts";

// ============================================================================
// parseLetz
// ============================================================================

describe("parseLetz", () => {
  it("parses header and entries correctly", () => {
    const content = `
@lesson A1.01 "Basic Greetings"

Moien = good morning
Äddi = bye
Merci = thanks
    `.trim();

    const lesson = parseLetz(content, "A1.01");

    expect(lesson.meta).toEqual({ id: "A1.01", title: "Basic Greetings", level: "A1" });
    expect(lesson.entries).toEqual([
      { lu: "Moien", en: "good morning" },
      { lu: "Äddi", en: "bye" },
      { lu: "Merci", en: "thanks" },
    ]);
  });

  it("ignores comment lines", () => {
    const content = `
@lesson A1.02 "Numbers"

# This is a comment
eng = one
# Another comment
zwee = two
    `.trim();

    const lesson = parseLetz(content);

    expect(lesson.entries).toEqual([
      { lu: "eng", en: "one" },
      { lu: "zwee", en: "two" },
    ]);
  });

  it("uses fallbackId and default title when header is missing", () => {
    const content = "Moien = hi\n";
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
    const content = "Moien = hi\n";
    const lesson = parseLetz(content, fallbackId);
    expect(lesson.meta.level).toBe(expectedLevel);
  });

  it("returns empty entries for a header-only file", () => {
    const content = '@lesson A1.01 "Empty Lesson"\n';
    const lesson = parseLetz(content);
    expect(lesson.entries).toHaveLength(0);
  });

  it("throws on malformed content (missing = separator)", () => {
    const content = "@lesson A1.01 \"Bad\"\nMoien hi\n";
    expect(() => parseLetz(content, "A1.01")).toThrow(/A1\.01/);
  });
});
