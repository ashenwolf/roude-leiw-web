import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import { buildFillExercise, parseFillLine } from "../../src/exercise/exercise-builders.ts";
import { parseLetz } from "../../src/lib/letz-parser/index.ts";
import { normalizeAnswer } from "../../src/exercise/SentenceBuilder/sentence-logic.ts";

import type { FillEntry } from "../../src/exercise/letz-parser.ts";

/**
 * Content contract for `@fill` blocks across BOTH catalogs.
 *
 * The mechanic's hard requirement is "exactly one correct form" (see
 * .claude/memory/fill-in-words-exercise.md > Ambiguity rules). Some of those
 * rules are authoring judgement (is a distractor semantically wrong in every
 * blank?); the mechanizable ones live here, where a failure can name the file.
 *
 * These assertions are vacuous while no file carries `@fill` — deliberately so.
 * They exist to bite the moment the first fill content lands, which is when the
 * ambiguity traps are cheapest to fix.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(__dirname, "../../public/assets");

const DIRECTIONS = ["en-lu", "lu-en"] as const;
const MIN_BLANKS = 1;
const MAX_BLANKS = 4;
const MIN_DISTRACTORS = 2;

const letzFilesIn = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return letzFilesIn(path);
    return name.endsWith(".letz") ? [path] : [];
  });

type FillSite = {
  /** Repo-relative path, so a failure message points straight at the file. */
  file: string;
  fill: FillEntry;
  /** The raw text of this `@fill` block, for rules the visitor collapses away. */
  raw: string;
};

const files = letzFilesIn(assetsDir).map((path) => ({
  file: relative(assetsDir, path),
  content: readFileSync(path, "utf-8"),
}));

/** Raw `@fill` block bodies, in file order — one per parsed fill. */
const rawFillBlocks = (content: string): string[] =>
  content
    .split(/^@fill[ \t]*$/m)
    .slice(1)
    .map((rest) => rest.split(/^(?=@(?:fill|sentence|word|lesson|image))/m)[0]);

const fillSites: FillSite[] = files.flatMap(({ file, content }) => {
  const fills = parseLetz(content, file).fills;
  const raws = rawFillBlocks(content);
  return fills.map((fill, i) => ({ file, fill, raw: raws[i] ?? "" }));
});

const lineOf = (fill: FillEntry, direction: (typeof DIRECTIONS)[number]): string =>
  direction === "en-lu" ? fill.lu : fill.en;

const distractorsOf = (fill: FillEntry, direction: (typeof DIRECTIONS)[number]): string[] =>
  (direction === "en-lu" ? fill.distractorsLu : fill.distractorsEn) ?? [];

describe("@fill content rules", () => {
  it("scans every .letz file in both catalogs", () => {
    // Guards the scan itself: if the walk silently found nothing, every rule
    // below would pass for the wrong reason.
    expect(files.length).toBeGreaterThan(0);
  });

  // ─── Bracket well-formedness ────────────────────────────────────────────────

  // Unbalanced brackets don't throw — parseFillLine leaves them as literal frame
  // text, so the only symptom is a stray "[" rendered in the UI.
  it("brackets are balanced and non-nested on both lines", () => {
    for (const { file, fill } of fillSites) {
      for (const direction of DIRECTIONS) {
        const line = lineOf(fill, direction);
        const opens = [...line].filter((c) => c === "[").length;
        const closes = [...line].filter((c) => c === "]").length;
        expect(opens, `${file}: unbalanced brackets in "${line}"`).toBe(closes);
        // Every "[" must be consumed by a match — nesting or "[[" would leave one.
        expect(parseFillLine(line).blanks, `${file}: nested brackets in "${line}"`).toHaveLength(
          opens,
        );
      }
    }
  });

  it("has 1–4 blanks per direction", () => {
    for (const { file, fill } of fillSites) {
      for (const direction of DIRECTIONS) {
        const { blanks } = parseFillLine(lineOf(fill, direction));
        expect(blanks.length, `${file} (${direction}): ${blanks.length} blanks`)
          .toBeGreaterThanOrEqual(MIN_BLANKS);
        expect(blanks.length, `${file} (${direction}): ${blanks.length} blanks`)
          .toBeLessThanOrEqual(MAX_BLANKS);
      }
    }
  });

  it("has no empty blanks", () => {
    for (const { file, fill } of fillSites) {
      for (const direction of DIRECTIONS) {
        for (const blank of parseFillLine(lineOf(fill, direction)).blanks) {
          expect(blank, `${file} (${direction}): empty blank`).not.toBe("");
        }
      }
    }
  });

  // ─── R1 — every tile text distinct within one presentation ──────────────────

  it("R1: all tiles in one presentation are distinct under normalizeAnswer", () => {
    for (const { file, fill } of fillSites) {
      for (const direction of DIRECTIONS) {
        const { tokens } = buildFillExercise(fill, direction).item;
        const normalized = tokens.map(normalizeAnswer);
        expect(new Set(normalized).size, `${file} (${direction}): duplicate tile text`).toBe(
          tokens.length,
        );
      }
    }
  });

  it("offers at least two distractors per direction", () => {
    for (const { file, fill } of fillSites) {
      for (const direction of DIRECTIONS) {
        // Counted AFTER the builder drops collisions with a blank answer — an
        // authored distractor that duplicates the answer is not a distractor.
        const { tokens, blanks } = buildFillExercise(fill, direction).item;
        const surviving = tokens.length - blanks.length;
        expect(surviving, `${file} (${direction}): only ${surviving} usable distractors`)
          .toBeGreaterThanOrEqual(MIN_DISTRACTORS);
      }
    }
  });

  // ─── R3 (partial) — a distractor must be wrong in EVERY blank ───────────────

  it("R3: no distractor equals any blank's answer in the same presentation", () => {
    for (const { file, fill } of fillSites) {
      for (const direction of DIRECTIONS) {
        const { blanks } = parseFillLine(lineOf(fill, direction));
        const answers = new Set(blanks.map(normalizeAnswer));
        for (const distractor of distractorsOf(fill, direction)) {
          expect(
            answers.has(normalizeAnswer(distractor)),
            `${file} (${direction}): distractor "${distractor}" is a correct answer`,
          ).toBe(false);
        }
      }
    }
  });

  // Only literal equality is mechanizable; semantic wrongness stays authoring
  // judgement (see R2/R3 in the memo).
  it("no blank's answer appears verbatim in the fixed frame", () => {
    for (const { file, fill } of fillSites) {
      for (const direction of DIRECTIONS) {
        const { frame, blanks } = parseFillLine(lineOf(fill, direction));
        const frameText = normalizeAnswer(frame.join(" "));
        for (const blank of blanks) {
          const needle = normalizeAnswer(blank);
          expect(
            needle.length > 0 && frameText.split(" ").includes(needle),
            `${file} (${direction}): answer "${blank}" is already visible in the frame`,
          ).toBe(false);
        }
      }
    }
  });

  // ─── R5 — Eifeler Regel ─────────────────────────────────────────────────────

  // A blank directly after an `-n`-final word inside a clause has no single
  // correct frame: the n survives before a vowel/d/h/n/t and drops otherwise, so
  // the answer would depend on which tile is placed. A comma ends the clause and
  // stops the rule, which is why two-clause frames are the safer shape.
  it("R5: no LU blank sits directly after an -n-final word inside a clause", () => {
    for (const { file, fill } of fillSites) {
      const { frame, blanks } = parseFillLine(fill.lu);
      frame.slice(0, blanks.length).forEach((segment, i) => {
        const precedingWord = segment.trimEnd().split(/[\s]+/).pop() ?? "";
        const crossesClause = /[,;:]\s*$/.test(segment);
        expect(
          !crossesClause && /n$/i.test(precedingWord),
          `${file}: blank ${i} follows "-n" word "${precedingWord}" in the same clause (Eifeler Regel)`,
        ).toBe(false);
      });
    }
  });

  // ─── Block-level authoring rules ────────────────────────────────────────────

  // The grammar shares `sentenceTag` with @sentence, so extra @lu/@en lines parse
  // fine and the visitor keeps the first. Accepted variants ARE ambiguity for
  // this mechanic, so the rule is enforced here rather than in the parser.
  it("has exactly one @lu and one @en per @fill block", () => {
    for (const { file, raw } of fillSites) {
      expect((raw.match(/^\s*@lu\b/gm) ?? []).length, `${file}: @lu count`).toBe(1);
      expect((raw.match(/^\s*@en\b/gm) ?? []).length, `${file}: @en count`).toBe(1);
    }
  });

  it("never uses @question inside a @fill block — the frame is the prompt", () => {
    for (const { file, raw } of fillSites) {
      expect(/^\s*@question\b/m.test(raw), `${file}: @fill must not carry @question`).toBe(false);
    }
  });

  // A @fill teaches a reusable PATTERN; a @sentence teaches that one sentence.
  // Sharing content re-teaches what the learner already assembles whole, and
  // splits one skill across two Elements.
  it("no @fill shares its sentence with a @sentence in the same file", () => {
    for (const { file, content } of files) {
      const parsed = parseLetz(content, file);
      if (parsed.fills.length === 0) continue;

      const sentenceForms = new Set(
        parsed.sentences.flatMap((s) => [...s.luVariants, ...s.enVariants].map(normalizeAnswer)),
      );
      for (const fill of parsed.fills) {
        for (const direction of DIRECTIONS) {
          // Compare the ungapped sentence — brackets are markup, not content.
          const complete = normalizeAnswer(
            parseFillLine(lineOf(fill, direction)).frame.join(""),
          );
          const gapless = normalizeAnswer(lineOf(fill, direction).replace(/[[\]]/g, ""));
          expect(
            sentenceForms.has(gapless) || sentenceForms.has(complete),
            `${file}: "${gapless}" exists as both a @fill and a @sentence`,
          ).toBe(false);
        }
      }
    }
  });

  it("no two @fill blocks in a file teach the same sentence", () => {
    for (const { file, content } of files) {
      const fills = parseLetz(content, file).fills;
      const identities = fills.map((f) => normalizeAnswer(f.en.replace(/[[\]]/g, "")));
      expect(new Set(identities).size, `${file}: duplicate @fill sentence`).toBe(identities.length);
    }
  });

  // Every fill Element is keyed on its @en line truncated to 64 chars (matching
  // the server validator). Two fills whose English agrees for 64 chars would
  // silently share one stat key.
  it("fill stat keys are unique per file after 64-char truncation", () => {
    for (const { file, content } of files) {
      const fills = parseLetz(content, file).fills;
      const keys = fills.flatMap((f) =>
        DIRECTIONS.map((d) => buildFillExercise(f, d).item.fillKey),
      );
      expect(new Set(keys).size, `${file}: fill stat key collision`).toBe(keys.length);
    }
  });
});
