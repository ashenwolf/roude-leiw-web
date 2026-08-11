/**
 * Eifeler-Regel (n-drop) audit over authored `.letz` files.
 *
 *   npm run check-content                     # every theme under public/assets/exam
 *   npm run check-content -- <path>...         # specific files or directories
 *
 * This is a HEURISTIC and deliberately NOT part of `npm run build`: it
 * over-reports on stem-final `-nn` nouns, plural-noun-before-noun, and proper
 * names, and a human has to adjudicate each flag. Exit code is always 0.
 *
 * The rules that CAN be decided mechanically are integration tests instead —
 * duplicate `@word` glosses live in `tests/integration/exam-manifest-letz.test.ts`,
 * the `@fill` bounds in `tests/integration/fill-content-rules.test.ts`.
 *
 * Docs: `.claude/skills/letz-content-generator/references/content-checks.md`
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

/** Final -n/-nn drops before a word starting outside U N I T E D Z O A H. */
const ZOAH = new Set("unitedzoah");

/**
 * Diacritics are folded before the letter test: `é` is E and therefore IS in
 * the list, so `Ech iessen, éier …` correctly keeps its -n. Unfolded, `é` looks
 * absent from the list and the check fires on correct content. Same for ë/ä/ü.
 */
const baseLetter = (ch) => ch.normalize("NFD")[0].toLowerCase();

/**
 * Flag each `-n`-final word whose following word starts outside UNITED ZOAH.
 *
 * The rule is phonological sandhi across an unbroken speech stream, so it does
 * **not** cross a comma or any other pause — a clause boundary exempts the pair
 * (`Wann ech Zäit hunn, ginn ech akafen.` is correct as written). Complex B1
 * sentences are full of commas, so this exemption is load-bearing.
 */
const nDropFindings = (lines) =>
  lines.flatMap(({ n, text }) => {
    if (!/^@(lu|question)\b/.test(text)) return [];
    // Strip `@fill` blank brackets first, or `[gesinn] ech` is never compared —
    // the bracket would sit between the two words being tested.
    const words = text
      .replace(/^@\w+\s*/, "")
      .replace(/[[\]]/g, "")
      .trimEnd()
      .split(/\s+/);
    return words.slice(0, -1).flatMap((raw, i) => {
      // Punctuation on the first word ends the clause — test before stripping.
      if (/[,.;:!?]$/.test(raw)) return [];
      const a = raw.replace(/^[.,!?;:]+|[.,!?;:]+$/g, "");
      const b = words[i + 1].replace(/^[.,!?;:]+|[.,!?;:]+$/g, "");
      if (a.length < 2 || !/n$/i.test(a)) return [];
      if (!b || !/\p{L}/u.test(b[0]) || ZOAH.has(baseLetter(b[0]))) return [];
      return [{ line: n, word: a, next: b }];
    });
  });

const walk = async (path) =>
  (await stat(path)).isDirectory()
    ? (
        await Promise.all((await readdir(path)).map((e) => walk(join(path, e))))
      ).flat()
    : path.endsWith(".letz")
      ? [path]
      : [];

/** Strip comments (`#` starts one anywhere) and blank lines, keep line numbers. */
const readLines = async (file) => ({
  file,
  lines: (await readFile(file, "utf-8"))
    .split("\n")
    .map((raw, i) => ({ n: i + 1, text: raw.replace(/#.*$/, "").trim() }))
    .filter(({ text }) => text.length > 0),
});

const main = async () => {
  const targets = process.argv.slice(2);
  const roots = targets.length > 0 ? targets : [join(ROOT, "public/assets/exam")];
  const files = (await Promise.all(roots.map(walk))).flat().sort();

  if (files.length === 0) {
    console.log("No .letz files found.");
    return;
  }

  const parsed = await Promise.all(files.map(readLines));
  const flags = parsed.flatMap(({ file, lines }) =>
    nDropFindings(lines).map((f) => ({ ...f, file })),
  );

  console.log(`Eifeler-Regel audit — ${files.length} file(s), ${flags.length} flag(s)\n`);
  flags.forEach(({ file, line, word, next }) =>
    console.log(`  ${relative(ROOT, file)}:${line}  '${word}' before '${next}'`),
  );

  console.log(
    [
      "",
      "Advisory only — nothing failed. Adjudicate each flag by hand.",
      "Known false positives (the rule applies to inflectional final -n, not stem-final):",
      "  · stem-final -nn nouns — D'Sonn schéngt, d'Bunn, de Mann",
      "  · plural noun before a noun — Wochen Congé",
      "  · proper names — Spuenien geflunn",
      "A real hit is usually a verb: sinn/hunn/ginn before an adjective or adverb",
      "is the highest-frequency bug site (`si sinn laang` → `si si laang`).",
      "Prefer rewriting the clause over teaching a form the learner must un-learn.",
    ].join("\n"),
  );
};

await main();
