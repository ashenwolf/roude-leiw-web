import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { audioSlug, questionAudioUrl } from "../../../src/lib/audio-slug";

// The scripts tree is deliberately plain ESM Node (no types) — this parity
// test is the one sanctioned crossing point between the two copies of slugify.
// @ts-expect-error untyped .mjs module
import { extractQuestions, slugify } from "../../../scripts/lib/letz-audio.mjs";

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
  it("agrees with the generator on every @question in the real corpus", async () => {
    const letzFiles = await findLetzFiles(ASSETS_ROOT);
    const questions = (
      await Promise.all(
        letzFiles.map(async (file) => extractQuestions(await readFile(file, "utf-8")) as string[]),
      )
    ).flat();

    // Guard against the corpus silently vanishing and the test passing on nothing.
    expect(questions.length).toBeGreaterThan(100);

    questions.forEach((question) => {
      expect(audioSlug(question)).toBe(slugify(question));
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
