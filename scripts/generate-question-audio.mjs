#!/usr/bin/env node
/**
 * Generate Sproochmaschinn audio for every `@question` examiner prompt across
 * all `.letz` files under a root (default: all content, both tracks).
 *
 * Questions are always Luxembourgish — the examiner asks in Luxembourgish and
 * the learner answers in Luxembourgish — so the whole batch goes to
 * Sproochmaschinn with one voice model.
 *
 * Usage
 * -----
 *   node scripts/generate-question-audio.mjs [pathOrDir]
 *   npm run generate-question-audio                       (all content)
 *   npm run generate-question-audio -- public/assets/exam/topic/tourism
 *
 * Environment variables
 * ---------------------
 *   SPROOCHMASCHINN_MODEL  (optional: "claude" | "max" | "maxine";
 *                           default "claude")
 *
 * Requires `ffmpeg` on PATH. See scripts/lib/sproochmaschinn.mjs for the API
 * contract (keyless sessions, rate limits, WAV → mp3).
 *
 * Output
 * ------
 *   <letz-dir>/audio/questions/<slug>.mp3
 *
 * The `questions/` subdirectory keeps examiner-prompt audio separate from
 * sentence audio (flat under `audio/`), and the per-theme .letz directories
 * provide the nesting — no single folder collects the whole corpus. Sub-lessons
 * of one theme share the directory, so a question repeated across them is
 * generated once. Existing files are skipped; re-running only fetches gaps.
 */
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import process from "node:process";

import { extractQuestions, findLetzFiles, shortLabel, slugify } from "./lib/letz-audio.mjs";
import { assertFfmpeg, generateAll, DEFAULT_MODEL, VOICE_MODELS } from "./lib/sproochmaschinn.mjs";

const DEFAULT_ROOT = "public/assets";

const main = async () => {
  const target = resolve(process.argv[2] ?? DEFAULT_ROOT);

  const model = process.env.SPROOCHMASCHINN_MODEL ?? DEFAULT_MODEL;
  if (!VOICE_MODELS.includes(model)) {
    console.error(`Unknown SPROOCHMASCHINN_MODEL "${model}". Options: ${VOICE_MODELS.join(", ")}.`);
    process.exit(1);
  }

  assertFfmpeg();

  const letzFiles = target.endsWith(".letz") ? [target] : await findLetzFiles(target);
  if (letzFiles.length === 0) {
    console.error(`No .letz files found under ${target}`);
    process.exit(1);
  }

  // One task per unique (audio dir, slug): sub-lessons of a theme share a
  // directory, so the same question text appearing in several files (or twice
  // in one) collapses to a single mp3.
  const withQuestions = await Promise.all(
    letzFiles.map(async (letzPath) => ({
      letzPath,
      questions: extractQuestions(await readFile(letzPath, "utf-8")),
    })),
  );

  const seen = new Set();
  const tasks = withQuestions.flatMap(({ letzPath, questions }) => {
    const questionsDir = join(dirname(letzPath), "audio", "questions");
    return questions.flatMap((question) => {
      const slug = slugify(question);
      if (slug.length === 0) {
        console.log(`skip (empty slug): "${question}"`);
        return [];
      }
      const outputPath = join(questionsDir, `${slug}.mp3`);
      if (seen.has(outputPath)) return [];
      seen.add(outputPath);
      return [{ text: question, outputPath, label: shortLabel(outputPath, "public/assets") }];
    });
  });

  if (tasks.length === 0) {
    console.log("No @question lines found.");
    return;
  }

  await Promise.all([...new Set(tasks.map(({ outputPath }) => dirname(outputPath)))]
    .map((dir) => mkdir(dir, { recursive: true })));

  const totalQuestions = withQuestions.reduce((sum, { questions }) => sum + questions.length, 0);
  console.log(`Root:      ${target}`);
  console.log(`Model:     ${model}`);
  console.log(`Files:     ${letzFiles.length} .letz, ${withQuestions.filter((f) => f.questions.length > 0).length} with questions`);
  console.log(`Questions: ${totalQuestions} total, ${tasks.length} unique`);
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
