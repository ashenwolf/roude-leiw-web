import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { audioSlug, questionAudioUrl, sentenceAudioUrl } from "../../../src/lib/audio-slug";

// The scripts tree is deliberately plain ESM Node (no types) — this parity
// test is the one sanctioned crossing point between the two copies of slugify.
// @ts-expect-error untyped .mjs module
import { extractLuPhrases, extractQuestions, slugify } from "../../../scripts/lib/letz-audio.mjs";

const ASSETS_ROOT = join(__dirname, "../../../public/assets");

const findLetzFiles = async (root: string): Promise<string[]> => {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? findLetzFiles(join(root, entry.name))
        : Promise.resolve(entry.name.endsWith(".letz") ? [join(root, entry.name)] : []),
    ),
  );
  return nested.flat();
};

describe("audioSlug — parity with scripts/lib/letz-audio.mjs slugify", () => {
  it("agrees with the generator on every @question and @lu phrase in the real corpus", async () => {
    const letzFiles = await findLetzFiles(ASSETS_ROOT);
    const phrases = (
      await Promise.all(
        letzFiles.map(async (file) => {
          const content = await readFile(file, "utf-8");
          return [
            ...(extractQuestions(content) as string[]),
            ...(extractLuPhrases(content) as string[]),
          ];
        }),
      )
    ).flat();

    // Guard against the corpus silently vanishing and the test passing on nothing.
    expect(phrases.length).toBeGreaterThan(1000);

    phrases.forEach((phrase) => {
      expect(audioSlug(phrase)).toBe(slugify(phrase));
    });
  });

  it("handles the documented examples", () => {
    expect(audioSlug("Wéi geet et?")).toBe("wei-geet-et");
    expect(audioSlug("d'Schockela")).toBe("d-schockela");
    expect(audioSlug("Ech sinn d'Christine.")).toBe("ech-sinn-d-christine");
  });
});

describe("questionAudioUrl", () => {
  it("builds the audio/questions/ URL from the letz dir", () => {
    expect(questionAudioUrl("/assets/exam/topic/tourism", "Vu wou kommt Dir?")).toBe(
      "/assets/exam/topic/tourism/audio/questions/vu-wou-kommt-dir.mp3",
    );
  });

  it("returns undefined when the question slugifies to nothing", () => {
    expect(questionAudioUrl("/assets/exam/topic/tourism", "???")).toBeUndefined();
  });
});

describe("sentenceAudioUrl", () => {
  it("builds the flat audio/ URL from the letz dir", () => {
    expect(sentenceAudioUrl("/assets/lessons/A1/A1.1", "Wéi geet et?")).toBe(
      "/assets/lessons/A1/A1.1/audio/wei-geet-et.mp3",
    );
  });

  it("returns undefined when the phrase slugifies to nothing", () => {
    expect(sentenceAudioUrl("/assets/lessons/A1/A1.1", "???")).toBeUndefined();
  });
});
