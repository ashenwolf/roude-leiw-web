/**
 * Shared utilities for working with .letz lesson files and their derived audio.
 *
 * Used by:
 *   - scripts/generate-audio.mjs  (creates .mp3 files via Sproochmaschinn)
 *   - scripts/sync-audio.mjs      (mirrors .mp3 files to/from Cloudflare R2)
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";

// ---------------------------------------------------------------------------
// Slugification
// ---------------------------------------------------------------------------

/**
 * Convert a Luxembourgish phrase into a filesystem-safe slug consisting only
 * of lowercase ASCII letters, digits, and single hyphens. Diacritics are
 * stripped via NFD normalization (ä→a, é→e, ë→e, ü→u, ö→o, ...). Apostrophes
 * and other punctuation collapse into separating hyphens.
 *
 *   "Wéi geet et?"          -> "wei-geet-et"
 *   "d'Schockela"           -> "d-schockela"
 *   "Ech sinn d'Christine." -> "ech-sinn-d-christine"
 */
export const slugify = (input) =>
  input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// ---------------------------------------------------------------------------
// .letz parsing
// ---------------------------------------------------------------------------

/**
 * Extract every Luxembourgish phrase that appears as `@lu` inside an
 * `@sentence` block. A sentence block begins at `@sentence` and ends at the
 * next top-level directive (`@lesson` or `@word`). Comments (`#…`) and blank
 * lines are ignored. Multiple `@lu` lines inside one block are returned
 * separately — each is a distinct phrase that gets its own audio file.
 */
export const extractLuPhrases = (content) => {
  const phrases = [];
  let inSentence = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;

    if (line.startsWith("@sentence")) {
      inSentence = true;
      continue;
    }
    if (line.startsWith("@lesson") || line.startsWith("@word")) {
      inSentence = false;
      continue;
    }
    if (inSentence && line.startsWith("@lu ")) {
      const phrase = line.slice(4).trim();
      if (phrase.length > 0) phrases.push(phrase);
    }
  }
  return phrases;
};

/**
 * Extract every `@question` line (examiner prompts, always Luxembourgish).
 * Position-independent: a `@question` belongs to its `@sentence` block, but
 * for audio we only need the text, so a flat line scan is enough. Comments
 * (`#…`) are ignored — content files quote `@question` in prose comments.
 */
export const extractQuestions = (content) =>
  content
    .split(/\r?\n/)
    .map((rawLine) => rawLine.trim())
    .filter((line) => line.startsWith("@question "))
    .map((line) => line.slice("@question ".length).trim())
    .filter((question) => question.length > 0);

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

/**
 * Recursively find files under `root` matching `predicate`. Returns absolute
 * paths. Silently returns [] if `root` doesn't exist.
 */
export const walkFiles = async (root, predicate) => {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const results = [];
  for (const entry of entries) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await walkFiles(full, predicate)));
    } else if (entry.isFile() && predicate(full)) {
      results.push(full);
    }
  }
  return results;
};

/** Find all .letz files under `root` (recursively). */
export const findLetzFiles = (root) =>
  walkFiles(root, (path) => path.endsWith(".letz"));

/** Find all .mp3 files under `root` (recursively). */
export const findMp3Files = (root) =>
  walkFiles(root, (path) => path.endsWith(".mp3"));

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

/** True if `path` exists (file or directory). */
export const pathExists = async (path) => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

/**
 * Read a .letz file and return the slugs we expect under its sibling audio/
 * directory (deduplicated). Useful for download mode — tells us what to pull.
 * Sentence audio lives flat under audio/, question audio under
 * audio/questions/ — the two lists keep that distinction.
 */
export const expectedSlugsForLetz = async (letzPath) => {
  const content = await readFile(letzPath, "utf-8");
  const dedupe = (phrases) => [...new Set(phrases.map(slugify).filter((s) => s.length > 0))];
  return {
    sentences: dedupe(extractLuPhrases(content)),
    questions: dedupe(extractQuestions(content)),
  };
};

/** Pretty file label for log lines, e.g. "A1/A1_01_greetings.letz". */
export const shortLabel = (absolutePath, root) => {
  const idx = absolutePath.indexOf(root);
  if (idx === -1) return basename(absolutePath);
  return absolutePath.slice(idx + root.length).replace(/^\//, "");
};
