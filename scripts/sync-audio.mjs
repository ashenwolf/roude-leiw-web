#!/usr/bin/env node
/**
 * Mirror generated audio files between the local filesystem and a Cloudflare
 * R2 bucket. Audio files are gitignored — R2 is the durable backup, and this
 * script is what keeps them in sync.
 *
 * Local layout:   public/assets/<track…>/audio/<slug>.mp3            (@lu sentences)
 *                 public/assets/<track…>/audio/questions/<slug>.mp3  (@question prompts)
 * R2 key layout:  path relative to public/assets/, e.g.
 *                 lessons/A1/audio/<slug>.mp3
 *                 exam/topic/tourism/audio/questions/<slug>.mp3
 *
 * Usage
 * -----
 *   node scripts/sync-audio.mjs upload   [letzPathOrDir] [--force]
 *   node scripts/sync-audio.mjs download [letzPathOrDir] [--force]
 *
 *   letzPathOrDir   Path to a .letz file or a directory under public/assets/.
 *                   Defaults to the assets root (sync everything).
 *   --force         Re-download files even if a local copy already exists.
 *                   (Uploads always overwrite — they are idempotent.)
 *
 * Modes
 * -----
 * upload    Walks every <…>/audio/*.mp3 under the target and pushes each to
 *           R2. Always overwrites — content is content-addressed by slug, so
 *           re-uploading is safe.
 *
 * download  Reads each .letz file under the target, derives the expected
 *           slugs, lists the bucket once, and pulls only keys that exist.
 *           Never-generated slugs are skipped without a per-file 404.
 *
 * Setup
 * -----
 *   npx wrangler login                         (one time)
 *   npx wrangler r2 bucket create roude-leiw-audio
 *
 * Override the bucket name with R2_BUCKET=other-bucket in the environment.
 */
import { spawn } from "node:child_process";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import process from "node:process";

import {
  expectedSlugsForLetz,
  findLetzFiles,
  findMp3Files,
  pathExists,
} from "./lib/letz-audio.mjs";
import { classifyAudioDownload, listR2Keys } from "./lib/r2.mjs";

const BUCKET = process.env.R2_BUCKET ?? "roude-leiw-audio";
const ASSETS_ROOT = "public/assets";
const CONCURRENCY = 4;

const credStatus = (value) => (value ? `set (${value.length} chars)` : "unset");

/** One-line CI banner — never prints secret values. */
const printSyncContext = (mode, extraLines = []) => {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  console.log(`Bucket:     ${BUCKET}${process.env.R2_BUCKET ? " (R2_BUCKET)" : " (default)"}`);
  console.log(`Account:    ${accountId ?? "(unset — wrangler default)"}`);
  console.log(`API token:  ${credStatus(process.env.CLOUDFLARE_API_TOKEN)}`);
  console.log(`Mode:       ${mode}`);
  extraLines.forEach((line) => console.log(line));
};

/** Dump the first wrangler result once so a Pages log shows 404 vs 403 vs auth. */
const logFirstProbe = (() => {
  let logged = false;
  return (result) => {
    if (logged) return;
    logged = true;
    const kind = result.ok
      ? "ok"
      : isAuthError(result)
        ? "auth"
        : isNotFound(result)
          ? "not-found"
          : "error";
    console.log(`First probe: ${kind} (wrangler exit ${result.code})`);
    const detail = `${result.stderr}\n${result.stdout}`.trim();
    if (detail.length > 0) {
      console.log(detail.split("\n").slice(0, 16).join("\n"));
    }
    console.log();
  };
})();

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

const parseArgs = (argv) => {
  const [, , mode, ...rest] = argv;
  const positionals = rest.filter((a) => !a.startsWith("--"));
  const flags = new Set(rest.filter((a) => a.startsWith("--")));
  return {
    mode,
    target: positionals[0] ?? ASSETS_ROOT,
    force: flags.has("--force"),
  };
};

const printUsage = () => {
  console.error("Usage:");
  console.error("  node scripts/sync-audio.mjs upload   [letzPathOrDir] [--force]");
  console.error("  node scripts/sync-audio.mjs download [letzPathOrDir] [--force]");
};

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

const assetsRootAbs = resolve(ASSETS_ROOT);

/** Convert a local .mp3 path to its R2 key (path relative to public/assets/). */
const localToR2Key = (localAbsPath) => {
  const rel = relative(assetsRootAbs, localAbsPath);
  return rel.split(sep).join("/");
};

/** Convert a (letzPath, slug, kind) to its local audio path. */
const slugToLocalPath = (letzPath, slug, kind) =>
  kind === "questions"
    ? join(dirname(letzPath), "audio", "questions", `${slug}.mp3`)
    : join(dirname(letzPath), "audio", `${slug}.mp3`);

/** Convert a (letzPath, slug, kind) to its R2 key. */
const slugToR2Key = (letzPath, slug, kind) =>
  localToR2Key(slugToLocalPath(letzPath, slug, kind));

// ---------------------------------------------------------------------------
// wrangler r2 wrappers
// ---------------------------------------------------------------------------

/**
 * Run `wrangler r2 object <subcommand>`. Returns { ok, stdout, stderr, code }.
 * Never throws — caller decides how to interpret the result.
 */
const runWrangler = (args) =>
  new Promise((resolveFn) => {
    const child = spawn("npx", ["wrangler", ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("close", (code) => {
      resolveFn({ ok: code === 0, stdout, stderr, code: code ?? -1 });
    });
    child.on("error", (err) => {
      resolveFn({ ok: false, stdout, stderr: String(err), code: -1 });
    });
  });

const r2Put = (key, file) =>
  runWrangler([
    "r2", "object", "put", `${BUCKET}/${key}`,
    "--file", file,
    "--remote",
    "--content-type", "audio/mpeg",
    "--cache-control", "public, max-age=31536000, immutable",
  ]);

const r2Get = (key, file) =>
  runWrangler([
    "r2", "object", "get", `${BUCKET}/${key}`,
    "--file", file,
    "--remote",
  ]);

const isNotFound = (result) =>
  /not exist|not found|no such key/i.test(result.stderr) ||
  /not exist|not found|no such key/i.test(result.stdout);

const isAuthError = (result) =>
  /not authenticated|unauthorized|please run.*login|authentication/i.test(result.stderr);

const loadRemoteKeys = async () => {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) return null;
  try {
    const keys = await listR2Keys({ accountId, token, bucket: BUCKET });
    return new Set(keys);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`⚠  Could not list R2 objects — falling back to per-file get.\n   ${msg}`);
    return null;
  }
};

// ---------------------------------------------------------------------------
// Concurrency helper
// ---------------------------------------------------------------------------

/**
 * Run `worker(item, index)` for each item with at most `limit` in flight.
 * Preserves order in the returned array.
 */
const parallelMap = async (items, limit, worker) => {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = next++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
};

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

const upload = async (target) => {
  const targetAbs = resolve(target);
  const exists = await pathExists(targetAbs);
  if (!exists) {
    console.error(`Target not found: ${targetAbs}`);
    process.exit(1);
  }

  // If target is a single .letz file, only upload that lesson's audio dir.
  // Otherwise walk all .mp3 files under the target.
  let files;
  if (targetAbs.endsWith(".letz")) {
    const audioDir = join(dirname(targetAbs), "audio");
    files = await findMp3Files(audioDir);
  } else {
    files = await findMp3Files(targetAbs);
  }

  if (files.length === 0) {
    console.log("No .mp3 files found to upload.");
    return;
  }

  printSyncContext("upload", [
    `Files:      ${files.length}`,
    `Sample key: ${localToR2Key(files[0])}`,
  ]);
  console.log();

  let uploaded = 0;
  let failed = 0;

  await parallelMap(files, CONCURRENCY, async (file, i) => {
    const key = localToR2Key(file);
    const prefix = `[${i + 1}/${files.length}]`;
    const result = await r2Put(key, file);
    if (result.ok) {
      console.log(`${prefix} ✓ pushed ${key}`);
      uploaded += 1;
    } else {
      console.error(`${prefix} ✗ error  ${key}\n${result.stderr.trim()}`);
      failed += 1;
    }
  });

  console.log();
  console.log(`Done. Uploaded: ${uploaded}, failed: ${failed}.`);
  if (failed > 0) process.exit(1);
};

const download = async (target, force) => {
  const targetAbs = resolve(target);
  const exists = await pathExists(targetAbs);
  if (!exists) {
    console.error(`Target not found: ${targetAbs}`);
    process.exit(1);
  }

  const letzFiles = targetAbs.endsWith(".letz")
    ? [targetAbs]
    : await findLetzFiles(targetAbs);

  if (letzFiles.length === 0) {
    console.log("No .letz files found.");
    return;
  }

  // Build the full task list: every (letz, slug, kind) triple becomes a
  // candidate — sentence audio flat under audio/, question audio under
  // audio/questions/.
  const tasks = [];
  for (const letzPath of letzFiles) {
    const { sentences, questions } = await expectedSlugsForLetz(letzPath);
    for (const [kind, slugs] of [["sentences", sentences], ["questions", questions]]) {
      for (const slug of slugs) {
        tasks.push({
          letzPath,
          slug,
          localPath: slugToLocalPath(letzPath, slug, kind),
          key: slugToR2Key(letzPath, slug, kind),
        });
      }
    }
  }

  const remoteKeys = await loadRemoteKeys();

  printSyncContext("download", [
    `Lessons:    ${letzFiles.length}`,
    `Phrases:    ${tasks.length}`,
    `Inventory:  ${remoteKeys === null ? "unavailable (will probe each key)" : `${remoteKeys.size} objects`}`,
    `Sample key: ${tasks[0].key}`,
    ...(force ? ["Force:      yes (will overwrite local files)"] : []),
  ]);
  console.log();

  let downloaded = 0;
  let skipped = 0;
  let missing = 0;
  let failed = 0;
  let authMissing = false;

  await parallelMap(tasks, CONCURRENCY, async (task, i) => {
    const prefix = `[${i + 1}/${tasks.length}]`;

    if (authMissing) {
      missing += 1;
      return;
    }

    const localExists = await pathExists(task.localPath);
    const remoteHas = remoteKeys === null ? null : remoteKeys.has(task.key);
    const action = classifyAudioDownload({ force, localExists, remoteHas });

    if (action === "have") {
      console.log(`${prefix} • have   ${task.key}`);
      skipped += 1;
      return;
    }

    if (action === "absent") {
      console.log(`${prefix} · absent ${task.key}`);
      missing += 1;
      return;
    }

    await mkdir(dirname(task.localPath), { recursive: true });
    const result = await r2Get(task.key, task.localPath);
    logFirstProbe(result);

    if (result.ok) {
      console.log(`${prefix} ✓ pulled ${task.key}`);
      downloaded += 1;
      return;
    }

    // wrangler creates the destination file before checking remote, so a
    // failed get can leave behind an empty/garbage file. Clean it up.
    await unlink(task.localPath).catch(() => {});

    if (isAuthError(result)) {
      authMissing = true;
      missing += 1;
      return;
    }

    if (isNotFound(result)) {
      console.log(`${prefix} · absent ${task.key}`);
      missing += 1;
    } else {
      console.error(`${prefix} ✗ error  ${task.key}\n${result.stderr.trim()}`);
      failed += 1;
    }
  });

  console.log();
  if (authMissing) {
    console.warn(
      "⚠  Cloudflare credentials not found — skipped R2 download.\n" +
        "   Set CLOUDFLARE_API_TOKEN (and CLOUDFLARE_ACCOUNT_ID) in this\n" +
        "   environment, or run `npx wrangler login` locally. Build will\n" +
        "   continue without audio.",
    );
  }
  console.log(
    `Done. Pulled: ${downloaded}, already-local: ${skipped}, ` +
      `not-on-r2: ${missing}, failed: ${failed}.`,
  );
  if (failed > 0) process.exit(1);
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const main = async () => {
  const { mode, target, force } = parseArgs(process.argv);

  if (mode !== "upload" && mode !== "download") {
    printUsage();
    process.exit(1);
  }

  if (mode === "upload") {
    if (force) console.log("(--force has no effect on upload — it is always idempotent)");
    await upload(target);
  } else {
    await download(target, force);
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
