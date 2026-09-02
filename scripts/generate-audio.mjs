#!/usr/bin/env node
/**
 * Generate Sproochmaschinn audio for every Luxembourgish phrase (`@lu`) inside
 * the `@sentence` blocks of a `.letz` lesson file.
 *
 * Usage
 * -----
 *   node scripts/generate-audio.mjs <path/to/lesson.letz>
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

import { extractLuPhrases, slugify } from "./lib/letz-audio.mjs";
import { assertFfmpeg, generateAll, DEFAULT_MODEL, VOICE_MODELS } from "./lib/sproochmaschinn.mjs";

const main = async () => {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: node scripts/generate-audio.mjs <path/to/lesson.letz>");
    process.exit(1);
  }

  const model = process.env.SPROOCHMASCHINN_MODEL ?? DEFAULT_MODEL;
  if (!VOICE_MODELS.includes(model)) {
    console.error(`Unknown SPROOCHMASCHINN_MODEL "${model}". Options: ${VOICE_MODELS.join(", ")}.`);
    process.exit(1);
  }

  assertFfmpeg();

  const absolutePath = resolve(inputPath);
  const content = await readFile(absolutePath, "utf-8");
  const phrases = extractLuPhrases(content);

  if (phrases.length === 0) {
    console.log("No @lu phrases found in @sentence blocks.");
    return;
  }

  const audioDir = join(dirname(absolutePath), "audio");
  await mkdir(audioDir, { recursive: true });

  // Deduplicate by slug. If two phrases collapse to the same slug they share
  // a single audio file — cross-run, the existence check catches the rest.
  const seenSlugs = new Set();
  const tasks = phrases.flatMap((phrase) => {
    const slug = slugify(phrase);
    if (slug.length === 0) {
      console.log(`skip (empty slug): "${phrase}"`);
      return [];
    }
    if (seenSlugs.has(slug)) return [];
    seenSlugs.add(slug);
    return [{ text: phrase, outputPath: join(audioDir, `${slug}.mp3`), label: `${slug}.mp3` }];
  });

  console.log(`File:    ${absolutePath}`);
  console.log(`Output:  ${audioDir}`);
  console.log(`Model:   ${model}`);
  console.log(`Phrases: ${phrases.length} total, ${tasks.length} unique`);
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
