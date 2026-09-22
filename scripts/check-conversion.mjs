/**
 * Advisory audit: which `@sentence` blocks are too order-heavy to assemble tile
 * by tile, and should become `@fill` frames instead.
 *
 *   npm run check-conversion                    # every theme under public/assets/exam
 *   npm run check-conversion -- <path>...       # specific files or directories
 *   npm run check-conversion -- --band 9-11     # only the judgement-call band
 *
 * Why this is advisory and NOT a build gate
 * -----------------------------------------
 * Whether a given sentence is better assembled or better filled is authoring
 * judgement — the classifier below detects *structure*, and structure only
 * predicts difficulty. A flat 10-token coordination (`Zwee Leit si jonk an zwee
 * Leit sinn al`) repeats one easy decision and is fine to assemble; a 9-token
 * verb-final clause hides the single most-failed rule in the language. Exit code
 * is always 0, like `check-content`.
 *
 * What it measures, and why these five things
 * -------------------------------------------
 * A tile-reordering task loads working memory per TILE, and the replicated
 * capacity figure is ~4 chunks (Cowan), not Miller's 7±2 — so the cost of a
 * sentence builder is the number of independent ordering decisions, not the word
 * count. A banked cloze is recognition plus local slotting against a fixed frame,
 * which is why a frame can carry a much longer sentence than a tile pool can.
 *
 * Luxembourgish concentrates those decisions in a few shapes, and each is exactly
 * what a `@fill` frame teaches for free:
 *
 *   perfect-bracket    aux + participle split across the clause (`sinn … gaangen`)
 *   modal-bracket      modal + clause-final infinitive
 *   ze-infinitive      `fir … ze <inf>` — infinitive lands at the very end
 *   verb-final-clause  a comma-introduced subordinate clause (verb goes last)
 *   separable-prefix   detached prefix stranded at the clause end (`… eng Kap un`)
 *   3+-clauses         coordination, which re-runs every decision
 *
 * Docs: `.claude/skills/letz-content-generator/references/content-checks.md`
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

// Below this, every sentence is assemblable regardless of structure: too few
// tiles for ordering to be the hard part.
const ALWAYS_BUILDER_MAX = 6;
// At or above this, the tile pool exceeds working-memory capacity by itself, so
// structure no longer changes the verdict.
const ALWAYS_FILL_MIN = 12;
// In between, one structural trigger only converts a sentence this long or longer.
const SINGLE_TRIGGER_MIN = 9;

const SUBORDINATORS = new Set([
  "well", "wann", "wa", "wou", "wéi", "datt", "dass", "obwuel", "nodeems", "éier",
  "falls", "während", "bis", "ob", "wéini", "deen", "déi", "dat", "wat", "sou",
]);

const AUXILIARIES = new Set([
  "hunn", "hu", "hues", "huet", "hat", "haten",
  "sinn", "si", "sidd", "bass", "ass", "war", "waren",
  "ginn", "gëtt", "gi", "géif", "géifen", "wäert",
]);

const MODALS = new Set([
  "kann", "kanns", "kënnen", "muss", "musst", "mussen", "wëll", "wëllen",
  "soll", "sollen", "däerf", "däerfen", "wollt", "konnt",
]);

// Present-tense verbs that merely BEGIN with ge- and are not participles. Without
// this, every `gesinn`/`gesäit` sentence reads as a perfect bracket.
const GE_PRESENT = new Set([
  "gesinn", "gesäit", "gesäis", "geséien", "geet", "ginn", "gëtt", "gi",
  "gefält", "gefällt", "gehéiert", "gehéieren",
]);

// Irregular participles that shed the ge- prefix.
const BARE_PARTICIPLES = new Set(["komm", "kaf", "bruecht", "fonnt"]);

// Separable prefixes, counted ONLY clause-finally: most are also ordinary
// prepositions, and only the stranded position is a word-order decision.
const SEPARABLE_PREFIXES = new Set([
  "un", "op", "aus", "of", "mat", "no", "vir", "zou", "eran", "eraus",
  "erun", "erof", "ewech", "zesummen", "bei",
]);

const bare = (word) => word.replace(/[.,!?;:"']/g, "").toLowerCase();
const wordsOf = (text) => text.split(/\s+/).filter((w) => w.length > 0);

const isParticiple = (word) =>
  !GE_PRESENT.has(word) && (/^ge/.test(word) || BARE_PARTICIPLES.has(word));

const clausesOf = (lu) => lu.split(/[,;:]/).filter((c) => c.trim().length > 0);

/**
 * A subordinator only forces verb-final order when it OPENS a clause. The same
 * words serve as question words and demonstratives in plain main clauses
 * (`Wéi geet et?`, `dat ass gutt`), so position, not membership, is the test.
 */
const hasVerbFinalClause = (lu) =>
  clausesOf(lu)
    .slice(1)
    .some((clause) => {
      const first = wordsOf(clause).map(bare).filter((w) => w.length > 0);
      // A coordinator may precede the subordinator: `, an wann ech Zäit hunn`.
      const head = ["an", "a", "mee", "awer", "oder"].includes(first[0]) ? first[1] : first[0];
      return head !== undefined && SUBORDINATORS.has(head);
    });

const hasClauseFinalPrefix = (lu) =>
  clausesOf(lu)
    .map((clause) => wordsOf(clause).map(bare).filter((w) => w.length > 0))
    .some((clause) => clause.length > 2 && SEPARABLE_PREFIXES.has(clause[clause.length - 1]));

/** The structural triggers present in one LU sentence, in report order. */
export const triggersOf = (lu) => {
  const tokens = wordsOf(lu).map(bare);

  return [
    tokens.some((w) => AUXILIARIES.has(w)) && tokens.some(isParticiple) ? "perfect-bracket" : null,
    tokens.some((w) => MODALS.has(w)) ? "modal-bracket" : null,
    tokens.includes("ze") ? "ze-infinitive" : null,
    hasVerbFinalClause(lu) ? "verb-final-clause" : null,
    hasClauseFinalPrefix(lu) ? "separable-prefix" : null,
    clausesOf(lu).length >= 3 ? "3+-clauses" : null,
  ].filter((t) => t !== null);
};

/**
 * builder | fill | judgement — the third is where a human decides.
 *
 * `judgement` is deliberately a distinct verdict rather than a coin-flip: in the
 * 7–11 band the structure signal is real but not decisive, and silently picking
 * one would hide exactly the cases worth looking at.
 */
export const verdictOf = (tokenCount, triggers) =>
  tokenCount <= ALWAYS_BUILDER_MAX ? "builder"
  : tokenCount >= ALWAYS_FILL_MIN ? "fill"
  : triggers.length >= 2 ? "fill"
  : triggers.length === 1 && tokenCount >= SINGLE_TRIGGER_MIN ? "judgement"
  : "builder";

/** `@sentence` blocks with their LU line and line number. */
const sentencesOf = (content) =>
  content
    .split("\n")
    .map((raw, i) => ({ n: i + 1, text: raw.replace(/#.*$/, "").trim() }))
    .reduce(
      ({ inSentence, blocks }, { n, text }) => {
        if (text.startsWith("@sentence")) return { inSentence: true, blocks };
        if (/^@(lesson|word|fill|image)/.test(text)) return { inSentence: false, blocks };
        if (!inSentence || !text.startsWith("@lu ")) return { inSentence, blocks };
        const lu = text.slice(4).trim();
        return { inSentence, blocks: lu.length > 0 ? [...blocks, { n, lu }] : blocks };
      },
      { inSentence: false, blocks: [] },
    ).blocks;

const walk = async (path) =>
  (await stat(path)).isDirectory()
    ? (await Promise.all((await readdir(path)).map((e) => walk(join(path, e))))).flat()
    : path.endsWith(".letz")
      ? [path]
      : [];

const main = async () => {
  const args = process.argv.slice(2);
  const bandOnly = args.includes("--band");
  const targets = args.filter((a) => !a.startsWith("--") && a !== "9-11");
  const roots = targets.length > 0 ? targets : [join(ROOT, "public/assets/exam")];
  const files = (await Promise.all(roots.map(walk))).flat().sort();

  if (files.length === 0) {
    console.log("No .letz files found.");
    return;
  }

  const rows = (
    await Promise.all(
      files.map(async (file) =>
        sentencesOf(await readFile(file, "utf-8")).map(({ n, lu }) => {
          const triggers = triggersOf(lu);
          const tokenCount = wordsOf(lu).length;
          return { file, n, lu, triggers, tokenCount, verdict: verdictOf(tokenCount, triggers) };
        }),
      ),
    )
  ).flat();

  const flagged = rows.filter(({ verdict }) => verdict !== "builder");
  const shown = bandOnly ? flagged.filter((r) => r.verdict === "judgement") : flagged;

  const counts = rows.reduce(
    (acc, { verdict }) => ({ ...acc, [verdict]: (acc[verdict] ?? 0) + 1 }),
    {},
  );

  console.log(
    `Conversion audit — ${files.length} file(s), ${rows.length} @sentence block(s)\n` +
      `  keep as builder: ${counts.builder ?? 0}\n` +
      `  convert to fill: ${counts.fill ?? 0}\n` +
      `  your call:       ${counts.judgement ?? 0}\n`,
  );

  const byFile = shown.reduce(
    (acc, row) => ({ ...acc, [row.file]: [...(acc[row.file] ?? []), row] }),
    {},
  );

  Object.entries(byFile).forEach(([file, group]) => {
    console.log(`${relative(ROOT, file)}`);
    group.forEach(({ n, lu, tokenCount, triggers, verdict }) =>
      console.log(
        `  :${String(n).padEnd(4)} ${verdict === "fill" ? "FILL " : "?    "}` +
          `${String(tokenCount).padStart(2)}t [${triggers.join(",") || "length-only"}]\n` +
          `        ${lu}`,
      ),
    );
    console.log();
  });

  console.log(
    [
      "Advisory only — nothing failed.",
      "",
      "FILL = the tile pool alone exceeds what a learner can order (>=12 tokens), or",
      "two structural traps stack. ?    = one trap in a 9-11 token sentence: read it and",
      "decide. A flat coordination repeating one easy decision is fine to assemble; a",
      "verb-final clause or a stranded prefix is the rule a fixed frame should teach.",
      "",
      "When converting, remember what it costs and what it requires:",
      "  · the stat key changes phrase: -> fill:, orphaning recorded progress",
      "  · a @fill may not share its sentence with a @sentence in the same file",
      "  · <=5 blanks, and never more than 4 distractors (a 10-tile pool is a builder)",
      "  · blank the grammar skeleton, not the vocabulary WordMatch already drills",
      "  · put a comma before a blank that would follow an -n word (Eifeler Regel)",
    ].join("\n"),
  );
};

await main();
