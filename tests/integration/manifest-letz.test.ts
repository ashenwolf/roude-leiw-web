import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import { parseLetz } from "../../src/lib/letz-parser/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const lessonsDir = join(__dirname, "../../public/assets/lessons");

type Manifest = {
  levels: { id: string; lessons: { id: string; file: string; title: string }[] }[];
};

const manifest = JSON.parse(readFileSync(join(lessonsDir, "manifest.json"), "utf-8")) as Manifest;

describe("manifest .letz files parse cleanly", () => {
  for (const level of manifest.levels) {
    for (const lesson of level.lessons) {
      it(`${lesson.id} (${lesson.file})`, () => {
        const content = readFileSync(join(lessonsDir, level.id, lesson.file), "utf-8");
        const parsed = parseLetz(content, lesson.id);
        expect(parsed.meta.id).toBe(lesson.id);
        expect(parsed.meta.title).toBe(lesson.title);
        // Sanity: must have content
        expect(parsed.entries.length + parsed.sentences.length).toBeGreaterThan(0);
        // Each sentence must have at least one lu and one en variant
        for (const s of parsed.sentences) {
          expect(s.luVariants.length).toBeGreaterThan(0);
          expect(s.enVariants.length).toBeGreaterThan(0);
        }
        // Each word entry must have non-empty lu/en
        for (const e of parsed.entries) {
          expect(e.lu).not.toBe("");
          expect(e.en).not.toBe("");
        }
      });
    }
  }
});
