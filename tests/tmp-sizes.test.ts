import { readFileSync } from "node:fs";
import { describe, it } from "vitest";
import { parseLetz } from "../src/lib/letz-parser/index.ts";

const manifest = JSON.parse(readFileSync("public/assets/exam/manifest.json", "utf-8"));

describe("slot counts", () => {
  it("dump", () => {
    for (const t of manifest.themes) {
      for (const s of t.subLessons) {
        const p = parseLetz(readFileSync(`public/assets/exam/${s.file}`, "utf-8"), s.id);
        const wordSlots = Math.ceil(p.entries.length / 5);
        console.log(`${s.id}: ${p.entries.length}w ${p.sentences.length}s → ~${wordSlots + p.sentences.length} slots`);
      }
    }
  });
});
