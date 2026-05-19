#!/usr/bin/env node
/**
 * Generate ElevenLabs audio for every Luxembourgish phrase (`@lu`) inside the
 * `@sentence` blocks of a `.letz` lesson file.
 *
 * Usage
 * -----
 *   node scripts/generate-audio.mjs <path/to/lesson.letz>
 *   node --env-file=.env scripts/generate-audio.mjs <path/to/lesson.letz>
 *   npm run generate-audio -- <path/to/lesson.letz>
 *
 * Environment variables
 * ---------------------
 *   ELEVENLABS_API_KEY    (required)
 *   ELEVENLABS_VOICE_ID   (optional, default "cgSgspJ2msm6clMCkdW9" / "Jessica")
 *   ELEVENLABS_MODEL_ID   (optional, default "eleven_multilingual_v2";
 *                          set to "eleven_v3" for higher-quality alpha model)
 *
 * Output
 * ------
 *   <lesson-dir>/audio/<slug>.mp3
 *
 * Where <slug> is the slugified phrase (lowercase ASCII letters, digits, and
 * single hyphens). Existing files are skipped — re-running the script only
 * fetches phrases that don't already have audio.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import process from "node:process";

import { extractLuPhrases, pathExists, slugify } from "./lib/letz-audio.mjs";

const DEFAULT_VOICE_ID = "cgSgspJ2msm6clMCkdW9"; // "Jessica" — featured on ElevenLabs' Luxembourgish page
const DEFAULT_MODEL_ID = "eleven_multilingual_v2";
// For higher-quality, more expressive output (and full audio-tag support like
// [whispers], [excited], etc.), set ELEVENLABS_MODEL_ID=eleven_v3. v3 is in
// alpha as of 2026; multilingual_v2 is the stable default. Both officially
// support Luxembourgish — see https://elevenlabs.io/text-to-speech/luxembourgish

const REQUEST_INTERVAL_MS = 250;       // polite spacing between successful requests
const MAX_RETRIES = 5;                 // for 429 / 5xx
const RETRY_BASE_DELAY_MS = 1000;      // exponential backoff base

// ---------------------------------------------------------------------------
// ElevenLabs client
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Synthesize one phrase. Retries on 429 (rate-limited) and 5xx, honoring the
 * `Retry-After` header when present and falling back to exponential backoff.
 * Returns the raw mp3 bytes.
 */
const fetchAudio = async (text, { apiKey, voiceId, modelId }) => {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;
  const body = JSON.stringify({
    text,
    model_id: modelId,
    voice_settings: { stability: 0.5, similarity_boost: 0.75 },
  });

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body,
    });

    if (response.ok) {
      return Buffer.from(await response.arrayBuffer());
    }

    const isThrottled = response.status === 429 || response.status >= 500;
    if (!isThrottled) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error ${response.status}: ${errorText}`);
    }

    const retryAfterHeader = parseFloat(response.headers.get("retry-after") ?? "");
    const delay = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
      ? retryAfterHeader * 1000
      : RETRY_BASE_DELAY_MS * 2 ** attempt;
    console.log(
      `   ⏳ HTTP ${response.status} — retrying in ${Math.round(delay)}ms ` +
        `(attempt ${attempt + 1}/${MAX_RETRIES})`,
    );
    await sleep(delay);
  }

  throw new Error(`ElevenLabs API failed after ${MAX_RETRIES} retries`);
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const main = async () => {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: node scripts/generate-audio.mjs <path/to/lesson.letz>");
    process.exit(1);
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error("Missing ELEVENLABS_API_KEY environment variable.");
    console.error('Tip: run with `node --env-file=.env scripts/generate-audio.mjs ...` to load .env');
    process.exit(1);
  }

  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_VOICE_ID;
  const modelId = process.env.ELEVENLABS_MODEL_ID ?? DEFAULT_MODEL_ID;

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
    return [{ phrase, slug }];
  });

  console.log(`File:    ${absolutePath}`);
  console.log(`Output:  ${audioDir}`);
  console.log(`Voice:   ${voiceId}`);
  console.log(`Model:   ${modelId}`);
  console.log(`Phrases: ${phrases.length} total, ${tasks.length} unique`);
  console.log();

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < tasks.length; i += 1) {
    const { phrase, slug } = tasks[i];
    const outputPath = join(audioDir, `${slug}.mp3`);
    const prefix = `[${i + 1}/${tasks.length}]`;

    if (await pathExists(outputPath)) {
      console.log(`${prefix} • skip   ${slug}.mp3   (${phrase})`);
      skipped += 1;
      continue;
    }

    try {
      const audio = await fetchAudio(phrase, { apiKey, voiceId, modelId });
      await writeFile(outputPath, audio);
      console.log(`${prefix} ✓ saved  ${slug}.mp3   (${phrase})`);
      generated += 1;
      // Polite spacing only after a real request, not after a skip
      if (i < tasks.length - 1) await sleep(REQUEST_INTERVAL_MS);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${prefix} ✗ error  ${slug}.mp3   (${phrase})  — ${msg}`);
      failed += 1;
    }
  }

  console.log();
  console.log(`Done. Generated: ${generated}, skipped: ${skipped}, failed: ${failed}.`);
  if (failed > 0) process.exit(1);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
