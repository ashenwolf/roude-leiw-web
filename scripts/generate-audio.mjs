#!/usr/bin/env node
/**
 * Generate Sproochmaschinn audio for every Luxembourgish phrase (`@lu`) inside
 * the `@sentence` blocks of a `.letz` lesson file.
 *
 * Usage
 * -----
 *   node scripts/generate-audio.mjs <letzFileOrDir>
 *   npm run generate-audio -- public/assets/lessons/A1
 *   npm run generate-audio -- <path/to/lesson.letz>
 *
 * Environment variables
 * ---------------------
 *   SPROOCHMASCHINN_MODEL  (optional: "claude" | "max" | "maxine";
 *                           default "claude" — VITS2 engine. "max" and
 *                           "maxine" are Coqui-engine male/female voices)
 *
 * Requires `ffmpeg` on PATH. See scripts/lib/sproochmaschinn.mjs for the API
 * contract (keyless sessions, rate limits, WAV → mp3).
 *
 * Output
 * ------
 *   <lesson-dir>/audio/<slug>.mp3
 *
 * Where <slug> is the slugified phrase (lowercase ASCII letters, digits, and
 * single hyphens). Existing files are skipped — re-running the script only
 * fetches phrases that don't already have audio.
 */
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import process from "node:process";

import { extractLuPhrases, findLetzFiles, shortLabel, slugify } from "./lib/letz-audio.mjs";
import { assertFfmpeg, generateAll, DEFAULT_MODEL, VOICE_MODELS } from "./lib/sproochmaschinn.mjs";

const main = async () => {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: node scripts/generate-audio.mjs <letzFileOrDir>");
    process.exit(1);
  }

  const model = process.env.SPROOCHMASCHINN_MODEL ?? DEFAULT_MODEL;
  if (!VOICE_MODELS.includes(model)) {
    console.error(`Unknown SPROOCHMASCHINN_MODEL "${model}". Options: ${VOICE_MODELS.join(", ")}.`);
    process.exit(1);
  }

  assertFfmpeg();

  const target = resolve(inputPath);
  const letzFiles = target.endsWith(".letz") ? [target] : await findLetzFiles(target);
  if (letzFiles.length === 0) {
    console.error(`No .letz files found under ${target}`);
    process.exit(1);
  }

  const withPhrases = await Promise.all(
    letzFiles.map(async (letzPath) => ({
      letzPath,
      phrases: extractLuPhrases(await readFile(letzPath, "utf-8")),
    })),
  );

  // One task per unique (audio dir, slug): lessons sharing a directory (one
  // level section) collapse repeated phrasings to a single mp3, same as the
  // question generator.
  const seen = new Set();
  const tasks = withPhrases.flatMap(({ letzPath, phrases }) => {
    const audioDir = join(dirname(letzPath), "audio");
    return phrases.flatMap((phrase) => {
      const slug = slugify(phrase);
      if (slug.length === 0) {
        console.log(`skip (empty slug): "${phrase}"`);
        return [];
      }
      const outputPath = join(audioDir, `${slug}.mp3`);
      if (seen.has(outputPath)) return [];
      seen.add(outputPath);
      return [{ text: phrase, outputPath, label: shortLabel(outputPath, "public/assets") }];
    });
  });

  if (tasks.length === 0) {
    console.log("No @lu phrases found in @sentence blocks.");
    return;
  }

  await Promise.all([...new Set(tasks.map(({ outputPath }) => dirname(outputPath)))]
    .map((dir) => mkdir(dir, { recursive: true })));

  const totalPhrases = withPhrases.reduce((sum, { phrases }) => sum + phrases.length, 0);
  console.log(`Target:  ${target}`);
  console.log(`Model:   ${model}`);
  console.log(`Files:   ${letzFiles.length} .letz`);
  console.log(`Phrases: ${totalPhrases} total, ${tasks.length} unique`);
  console.log();

  const { generated, skipped, failed } = await generateAll(tasks, model);

  console.log();
  console.log(`Done. Generated: ${generated}, skipped: ${skipped}, failed: ${failed}.`);
  if (failed > 0) process.exit(1);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
