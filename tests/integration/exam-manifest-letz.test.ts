import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import { parseLetz } from "../../src/lib/letz-parser/index.ts";

import type { ExamManifest } from "../../src/exam/exam-catalog.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const examDir = join(__dirname, "../../public/assets/exam");

const manifest = JSON.parse(readFileSync(join(examDir, "manifest.json"), "utf-8")) as ExamManifest;

// Must mirror LESSON_ID_RX in worker/lib/validators.ts — sub-lesson ids travel
// through newlyUnlockedLessons as the play-gate and must pass server validation.
const LESSON_ID_RX = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * Pixel width from a WebP byte buffer. Only the three chunk types `cwebp`
 * emits are handled; anything else throws rather than guessing, so an
 * unexpected encoding fails the test loudly.
 */
const webpWidth = (bytes: Buffer): number => {
  const chunk = bytes.subarray(12, 16).toString("ascii");
  // VP8X (extended): 24-bit little-endian canvas width minus one, at byte 24.
  if (chunk === "VP8X") return bytes.readUIntLE(24, 3) + 1;
  // VP8L (lossless): 14-bit width minus one, in the first bits after the signature.
  if (chunk === "VP8L") return (bytes.readUInt32LE(21) & 0x3fff) + 1;
  // VP8  (lossy): 14-bit width in the frame header, after the 3-byte start code.
  if (chunk === "VP8 ") return bytes.readUInt16LE(26) & 0x3fff;
  throw new Error(`Unsupported WebP chunk type: ${chunk}`);
};

describe("exam manifest .letz files parse cleanly", () => {
  for (const theme of manifest.themes) {
    for (const sub of theme.subLessons) {
      it(`${sub.id} (${theme.id} → ${sub.file})`, () => {
        // Unlike the course catalog, the manifest id is the authoritative
        // identity — the in-file @lesson id is only a lexer-legal label,
        // so no id equality is asserted here.
        expect(sub.id).toMatch(LESSON_ID_RX);
        expect(sub.id.startsWith(theme.id + ".")).toBe(true);

        const content = readFileSync(join(examDir, sub.file), "utf-8");
        const parsed = parseLetz(content, sub.id);
        expect(parsed.entries.length + parsed.sentences.length).toBeGreaterThan(0);

        for (const s of parsed.sentences) {
          expect(s.luVariants.length).toBeGreaterThan(0);
          expect(s.enVariants.length).toBeGreaterThan(0);
        }
        for (const e of parsed.entries) {
          expect(e.lu).not.toBe("");
          expect(e.en).not.toBe("");
        }
      });
    }
  }

  // Every sub-lesson mixes both Element kinds so each Session alternates
  // word-match and sentence-builder slots rather than being all of one type.
  it("every sub-lesson mixes vocabulary with sentences", () => {
    for (const theme of manifest.themes) {
      for (const sub of theme.subLessons) {
        const parsed = parseLetz(readFileSync(join(examDir, sub.file), "utf-8"), sub.id);
        expect(parsed.entries.length, `${sub.id}: needs vocabulary`).toBeGreaterThanOrEqual(10);
        expect(parsed.sentences.length, `${sub.id}: needs sentences`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("sub-lesson ids are unique across the exam catalog", () => {
    const ids = manifest.themes.flatMap((t) => t.subLessons.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Every theme declares which content contract it is held to. Without this,
  // a new theme missing `kind` would silently escape both rules below.
  it("every theme declares a known kind", () => {
    for (const theme of manifest.themes) {
      expect(["topic", "picture"], `${theme.id}: bad kind`).toContain(theme.kind);
    }
  });

  // Titles are bare — the section heading prefix ("Theme: " / "Describing a
  // Picture: ") is derived from `kind` by themeHeading(), so baking it into the
  // manifest would double it.
  it("theme titles carry no heading prefix", () => {
    for (const theme of manifest.themes) {
      expect(theme.title, `${theme.id}: prefix belongs in themeHeading()`).not.toMatch(
        /^(Theme|Describing a Picture):/,
      );
    }
  });

  // Converse of the rule below, for picture themes: describing a photo is a
  // different exam skill from conversing about a topic, so those files are pure
  // description — an examiner prompt sneaking in is a content bug, and without
  // this assertion it would be silent.
  it("picture themes never use @question", () => {
    const pictureThemes = manifest.themes.filter((t) => t.kind === "picture");
    expect(pictureThemes.length).toBeGreaterThan(0);
    for (const theme of pictureThemes) {
      for (const sub of theme.subLessons) {
        const parsed = parseLetz(readFileSync(join(examDir, sub.file), "utf-8"), sub.id);
        for (const s of parsed.sentences) {
          expect(
            s.question,
            `${sub.id}: sentence "${s.enVariants[0]}" must not carry @question`,
          ).toBeUndefined();
        }
      }
    }
  });

  // A picture-description sub-lesson is unusable if the learner cannot see what
  // they are describing. @image-alt is the minimum: it captions the placeholder
  // frame shown if the photo is missing, so it is required regardless of @image.
  // Keyed on `kind`, same as the @question rule above.
  it("every picture sub-lesson declares @image-alt", () => {
    const pictureThemes = manifest.themes.filter((t) => t.kind === "picture");
    expect(pictureThemes.length).toBeGreaterThan(0);
    for (const theme of pictureThemes) {
      for (const sub of theme.subLessons) {
        const parsed = parseLetz(readFileSync(join(examDir, sub.file), "utf-8"), sub.id);
        expect(parsed.meta.imageAlt, `${sub.id}: needs @image-alt`).toBeTruthy();
        // If a photo IS declared it must be a root-relative path under public/,
        // since img-src is 'self' — an external host would be CSP-blocked.
        if (parsed.meta.image !== undefined) {
          expect(parsed.meta.image, `${sub.id}: @image must be root-relative`).toMatch(
            /^\/assets\/exam\//,
          );
        }
      }
    }
  });

  // Every referenced asset must exist on disk and be an optimized WebP at or
  // under 2x the largest iPhone logical width (440pt → 880px). A stale path or
  // a dropped-in multi-MB PNG both fail here rather than in production.
  const MAX_IMAGE_WIDTH = 880;
  it("declared @image files exist as optimized WebP within the width budget", () => {
    for (const theme of manifest.themes) {
      for (const sub of theme.subLessons) {
        const parsed = parseLetz(readFileSync(join(examDir, sub.file), "utf-8"), sub.id);
        if (parsed.meta.image === undefined) continue;
        expect(parsed.meta.image, `${sub.id}: @image must be .webp`).toMatch(/\.webp$/);

        // @image is root-relative to public/, which is examDir's grandparent.
        const onDisk = join(examDir, "../..", parsed.meta.image);
        const bytes = readFileSync(onDisk);

        // WebP container: "RIFF" .... "WEBP"; VP8X/VP8L/VP8 carry the dimensions.
        expect(bytes.subarray(0, 4).toString("ascii"), `${sub.id}: not RIFF`).toBe("RIFF");
        expect(bytes.subarray(8, 12).toString("ascii"), `${sub.id}: not WEBP`).toBe("WEBP");
        const width = webpWidth(bytes);
        expect(width, `${sub.id}: ${width}px exceeds the ${MAX_IMAGE_WIDTH}px budget`)
          .toBeLessThanOrEqual(MAX_IMAGE_WIDTH);
      }
    }
  });

  // Two `@word` entries in one theme must not share an English gloss: word-match
  // shows several pairs at once, so a shared gloss makes one of them
  // unmatchable-by-reasoning and the learner has to guess. Nor may they share an
  // LU side — the sequential pass-gate makes an earlier sub-lesson a
  // prerequisite, so re-teaching a word is duplicated work against one stat key.
  // Scope is the theme, because that is the scope of the pass-gate chain.
  // (The n-drop audit is a heuristic and lives in scripts/check-content.mjs; these
  // two are exact, so they gate the build.)
  it("no theme teaches a duplicate @word gloss or LU side", () => {
    for (const theme of manifest.themes) {
      const entries = theme.subLessons.flatMap((sub) =>
        parseLetz(readFileSync(join(examDir, sub.file), "utf-8"), sub.id).entries.map((e) => ({
          ...e,
          from: sub.id,
        })),
      );

      // Reported as flat strings so the assertion message names the offenders
      // rather than truncating a nested structure to "[ …(2) ]".
      const duplicates = (key: (e: (typeof entries)[number]) => string) =>
        Object.entries(
          entries.reduce<Record<string, string[]>>(
            (acc, e) => ({
              ...acc,
              [key(e)]: [...(acc[key(e)] ?? []), `${e.from} "${e.lu} = ${e.en}"`],
            }),
            {},
          ),
        )
          .filter(([, group]) => group.length > 1)
          .map(([shared, group]) => `${shared} ← ${group.join(" + ")}`);

      expect(duplicates((e) => e.en), `${theme.id}: duplicate EN gloss`).toEqual([]);
      expect(duplicates((e) => e.lu), `${theme.id}: duplicate LU side`).toEqual([]);
    }
  });

  // Keyed on the filename, so a rename would silently escape the @question rule
  // below — this asserts the file each topic theme is required to have still
  // exists under the expected name, closing that gap.
  it("every topic theme has a 03_questions sub-lesson", () => {
    const topicThemes = manifest.themes.filter((t) => t.kind === "topic");
    expect(topicThemes.length).toBeGreaterThan(0);
    for (const theme of topicThemes) {
      expect(
        theme.subLessons.some((s) => s.file.includes("03_questions")),
        `${theme.id}: topic themes need a 03_questions file (the @question rule keys off it)`,
      ).toBe(true);
    }
  });

  it("every 'Talking About It' sub-lesson uses @question throughout", () => {
    const qaFiles = manifest.themes.flatMap((t) =>
      t.subLessons.filter((s) => s.file.includes("03_questions")),
    );
    expect(qaFiles.length).toBeGreaterThan(0);
    for (const sub of qaFiles) {
      const parsed = parseLetz(readFileSync(join(examDir, sub.file), "utf-8"), sub.id);
      expect(parsed.sentences.length).toBeGreaterThan(0);
      for (const s of parsed.sentences) {
        expect(s.question, `${sub.id}: sentence "${s.enVariants[0]}" missing @question`).toBeDefined();
      }
    }
  });
});
