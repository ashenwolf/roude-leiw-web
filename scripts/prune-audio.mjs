#!/usr/bin/env node
/**
 * Prune R2 objects that no current .letz content expects — dead keys from the
 * ElevenLabs era (pre-rekey `A1/audio/…`), edited phrases whose slug changed,
 * and deleted lessons.
 *
 * Talks to the Cloudflare REST API directly — no wrangler required.
 *
 * Usage
 * -----
 *   npm run prune-audio             # dry run: report orphans, delete nothing
 *   npm run prune-audio -- --delete # actually delete the orphans
 *
 * Environment variables (same pair the CI download uses)
 * ---------------------
 *   CLOUDFLARE_API_TOKEN   (required — needs Account > Workers R2 Storage: Edit)
 *   CLOUDFLARE_ACCOUNT_ID  (required)
 *
 * Get them once:
 *   1. https://dash.cloudflare.com/profile/api-tokens → Create Token →
 *      Custom → Permissions: Account / Workers R2 Storage / Edit.
 *   2. Account ID: dashboard home, right sidebar (or the URL after /dash/).
 *   3. Drop both into .env — `npm run prune-audio` loads it automatically.
 *
 * Expected keys are derived from content, mirroring sync-audio.mjs:
 *   lessons/<level…>/audio/<slug>.mp3             (@lu sentences)
 *   <track…>/audio/questions/<slug>.mp3           (@question prompts)
 * Anything else ending in .mp3 is an orphan. Non-mp3 keys are never touched,
 * only reported.
 */
import process from "node:process";
import { dirname, join, relative, resolve, sep } from "node:path";

import { expectedSlugsForLetz, findLetzFiles } from "./lib/letz-audio.mjs";
import { listR2Keys } from "./lib/r2.mjs";

const BUCKET = process.env.R2_BUCKET ?? "roude-leiw-audio";
const ASSETS_ROOT = "public/assets";
const API_BASE = "https://api.cloudflare.com/client/v4";

const deleteKey = async (accountId, token, key) => {
  const response = await fetch(
    `${API_BASE}/accounts/${accountId}/r2/buckets/${BUCKET}/objects/${encodeURIComponent(key)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
};

// ---------------------------------------------------------------------------
// Expected-key derivation (mirrors sync-audio.mjs key layout)
// ---------------------------------------------------------------------------

const assetsRootAbs = resolve(ASSETS_ROOT);

const toKey = (letzPath, slug, kind) => {
  const localPath = kind === "questions"
    ? join(dirname(letzPath), "audio", "questions", `${slug}.mp3`)
    : join(dirname(letzPath), "audio", `${slug}.mp3`);
  return relative(assetsRootAbs, localPath).split(sep).join("/");
};

const expectedKeys = async () => {
  const letzFiles = await findLetzFiles(assetsRootAbs);
  const perFile = await Promise.all(
    letzFiles.map(async (letzPath) => {
      const { sentences, questions } = await expectedSlugsForLetz(letzPath);
      return [
        ...sentences.map((slug) => toKey(letzPath, slug, "sentences")),
        ...questions.map((slug) => toKey(letzPath, slug, "questions")),
      ];
    }),
  );
  return new Set(perFile.flat());
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const main = async () => {
  const doDelete = process.argv.includes("--delete");

  const token = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId) {
    console.error("Missing CLOUDFLARE_API_TOKEN and/or CLOUDFLARE_ACCOUNT_ID.");
    console.error("See the header of scripts/prune-audio.mjs for how to create them.");
    process.exit(1);
  }

  const [expected, remoteKeys] = await Promise.all([
    expectedKeys(),
    listR2Keys({ accountId, token, bucket: BUCKET }),
  ]);

  const mp3Keys = remoteKeys.filter((key) => key.endsWith(".mp3"));
  const otherKeys = remoteKeys.filter((key) => !key.endsWith(".mp3"));
  const orphans = mp3Keys.filter((key) => !expected.has(key));

  console.log(`Bucket:   ${BUCKET}`);
  console.log(`Remote:   ${remoteKeys.length} objects (${mp3Keys.length} mp3)`);
  console.log(`Expected: ${expected.size} keys derivable from current content`);
  console.log(`Orphans:  ${orphans.length}`);
  if (otherKeys.length > 0) {
    console.log(`Ignored (non-mp3, never deleted): ${otherKeys.length}`);
    otherKeys.forEach((key) => console.log(`  ? ${key}`));
  }
  console.log();

  if (orphans.length === 0) {
    console.log("Nothing to prune.");
    return;
  }

  if (!doDelete) {
    orphans.forEach((key) => console.log(`  would delete ${key}`));
    console.log();
    console.log(`Dry run — re-run with --delete to remove ${orphans.length} objects.`);
    return;
  }

  const results = await orphans.reduce(
    async (statePromise, key, i) => {
      const state = await statePromise;
      const prefix = `[${i + 1}/${orphans.length}]`;
      try {
        await deleteKey(accountId, token, key);
        console.log(`${prefix} ✓ deleted ${key}`);
        return { ...state, deleted: state.deleted + 1 };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`${prefix} ✗ error   ${key}  — ${msg}`);
        return { ...state, failed: state.failed + 1 };
      }
    },
    Promise.resolve({ deleted: 0, failed: 0 }),
  );

  console.log();
  console.log(`Done. Deleted: ${results.deleted}, failed: ${results.failed}.`);
  if (results.failed > 0) process.exit(1);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
