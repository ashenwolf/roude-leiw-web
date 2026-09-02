#!/usr/bin/env node
/**
 * Pack every generated .mp3 into a tar archive that preserves the repo-relative
 * folder structure, for transferring audio to another checkout of this repo.
 *
 * Audio is gitignored and R2 is the canonical backup, but R2 needs credentials
 * and wrangler — this is the sneakernet path: one file, `scp` it, extract at the
 * other repo root, done.
 *
 * Usage
 * -----
 *   npm run pack-audio                       # -> audio-transfer/roude-leiw-audio.tar
 *   npm run pack-audio -- path/to/out.tar    # explicit destination
 *   npm run pack-audio -- --root public/assets/lessons/A1   # pack a subtree only
 *
 * Then, on the other host:
 *   scp <this-host>:<tar> .
 *   tar -xf roude-leiw-audio.tar -C /path/to/roude-leiw-web
 *
 * Entries are stored relative to the REPO ROOT (`public/assets/…`), so
 * extracting with `-C <repo root>` lands every file exactly where the app and
 * the generators expect it. Extraction overwrites same-named files and leaves
 * everything else alone.
 *
 * No compression: mp3 is already compressed, so gzip costs time for ~1%.
 */
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";

import { findMp3Files } from "./lib/letz-audio.mjs";

const DEFAULT_OUTPUT = "audio-transfer/roude-leiw-audio.tar";
const DEFAULT_ROOT = "public/assets";

const REPO_ROOT = resolve(import.meta.dirname, "..");

const parseArgs = (argv) => {
  const rest = argv.slice(2);
  const rootFlagIndex = rest.indexOf("--root");
  const root = rootFlagIndex === -1 ? DEFAULT_ROOT : rest[rootFlagIndex + 1];
  const positional = rest.filter(
    (arg, i) => !arg.startsWith("--") && i !== rootFlagIndex + 1,
  );
  return { root, output: positional[0] ?? DEFAULT_OUTPUT };
};

/** Run tar with the file list on stdin-free `-T`, so no arg-length limit applies. */
const runTar = (output, listFile) =>
  new Promise((resolvePromise, reject) => {
    const tar = spawn("tar", ["-cf", output, "-C", REPO_ROOT, "-T", listFile], {
      stdio: ["ignore", "inherit", "pipe"],
    });
    const err = [];
    tar.stderr.on("data", (chunk) => err.push(chunk));
    tar.on("error", reject);
    tar.on("close", (code) =>
      code === 0
        ? resolvePromise()
        : reject(new Error(`tar exited ${code}: ${Buffer.concat(err).toString().trim()}`)),
    );
  });

const main = async () => {
  const { root, output } = parseArgs(process.argv);

  const rootAbs = resolve(root);
  const files = await findMp3Files(rootAbs);
  if (files.length === 0) {
    console.error(`No .mp3 files found under ${rootAbs}`);
    console.error("Generate some first: npm run generate-audio -- <letzFileOrDir>");
    process.exit(1);
  }

  const outputAbs = resolve(output);
  await mkdir(dirname(outputAbs), { recursive: true });

  // tar reads the member list from a file (paths relative to -C) so a corpus of
  // any size stays clear of the argv limit.
  const scratch = await mkdtemp(join(tmpdir(), "roude-leiw-audio-"));
  const listFile = join(scratch, "files.txt");
  const members = files.map((file) => relative(REPO_ROOT, file)).sort();
  await writeFile(listFile, `${members.join("\n")}\n`);

  try {
    await runTar(outputAbs, listFile);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }

  const { size } = await stat(outputAbs);
  const mib = (size / 1024 / 1024).toFixed(1);

  console.log(`Packed:  ${files.length} mp3 files (${mib} MiB)`);
  console.log(`Root:    ${relative(REPO_ROOT, rootAbs) || "."}`);
  console.log(`Archive: ${outputAbs}`);
  console.log();
  console.log("On the other host:");
  console.log(`  scp ${process.env.HOSTNAME ?? "<this-host>"}:${outputAbs} .`);
  console.log(`  tar -xf ${relative(dirname(outputAbs), outputAbs)} -C /path/to/roude-leiw-web`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
