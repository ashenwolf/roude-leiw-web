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

  it("sub-lesson ids are unique across the exam catalog", () => {
    const ids = manifest.themes.flatMap((t) => t.subLessons.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
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
