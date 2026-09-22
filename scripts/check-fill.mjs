/**
 * Pre-flight check for a proposed `@fill` block, before it goes into a file.
 *
 *   node scripts/check-fill.mjs <file.letz>        # every @fill in a file
 *   node scripts/check-fill.mjs --stdin < block    # one proposed block
 *
 * The integration tests already enforce these rules, but they report ONE failure
 * per run, so authoring a batch means a fix-rerun loop where each fix perturbs the
 * others: moving a blank off an `-n` word exposes an answer in the frame, changing
 * a distractor collides with a different answer. This reports every violation in
 * every block at once, which is what makes a batch authorable.
 *
 * Exit 1 on any violation, so it can gate a batch before the real build runs.
 */
import { readFile } from "node:fs/promises";
import process from "node:process";

// ─── The rules ────────────────────────────────────────────────────────────────

const MIN_BLANKS = 1;
const MAX_BLANKS = 5;
const MIN_DISTRACTORS = 2;
const MAX_DISTRACTORS = 4;

/** Mirrors src/exercise/answer-text.ts — tile identity must agree exactly. */
const normalize = (s) =>
  s
    .replace(/[.,!?;:'"''"]+/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const BLANK_RX = /\[([^[\]]*)\]/g;
const blanksOf = (line) => [...line.matchAll(BLANK_RX)].map((m) => m[1].trim());
const frameOf = (line) => line.replace(BLANK_RX, " ");

/**
 * Word class, coarsely — enough to catch two blanks a learner could swap.
 * Luxembourgish morphology is regular enough at the endings that this is useful
 * without a dictionary; it over-reports rather than under-reports, and a flag is
 * adjudicated by eye.
 */
const wordClass = (w) => {
  const x = w.toLowerCase();
  if (/^(hunn|hu|huet|hat|haten|hate|sinn|si|ass|war|waren|gëtt|ginn|gi)$/.test(x)) return "aux";
  if (/^(kann|kënne|kënnen|muss|mussen|wëll|wëllen|soll|sollen|wollt|däerf)$/.test(x)) return "modal";
  if (/^ge|^(komm|kaf|fonnt|bruecht)$/.test(x)) return "participle";
  if (/(ee?ren|éieren|en)$/.test(x) && x.length > 4) return "infinitive";
  if (/^[A-ZÄËÉÖÜ]/.test(w)) return "noun";
  return "other";
};

/** UNITED ZOAH: a final -n survives before these, and drops otherwise. */
const ZOAH = new Set("unitedzoah");
const baseLetter = (ch) => ch.normalize("NFD")[0].toLowerCase();

const checkOne = ({ lu, en, distractorsLu, distractorsEn, question, label }) => {
  const problems = [];
  const add = (rule, detail) => problems.push({ rule, detail });

  for (const [dir, line, rawDistractors] of [
    ["en-lu", lu, distractorsLu],
    ["lu-en", en, distractorsEn],
  ]) {
    const opens = [...line].filter((c) => c === "[").length;
    const closes = [...line].filter((c) => c === "]").length;
    if (opens !== closes) add("brackets", `${dir}: ${opens} '[' vs ${closes} ']'`);

    const blanks = blanksOf(line);
    if (blanks.length < MIN_BLANKS || blanks.length > MAX_BLANKS) {
      add("blank-count", `${dir}: ${blanks.length} blanks (want ${MIN_BLANKS}-${MAX_BLANKS})`);
    }
    if (blanks.some((b) => b.length === 0)) add("empty-blank", dir);

    // A question forces en→lu, so the EN line is never presented: its blanks are
    // markup only and its distractors are never tiles.
    const presented = question === undefined || dir === "en-lu";

    const answers = new Set(blanks.map(normalize));
    const surviving = rawDistractors
      .map((d) => d.trim())
      .filter((d) => d.length > 0 && !answers.has(normalize(d)));

    for (const d of rawDistractors) {
      if (answers.has(normalize(d))) add("distractor-is-answer", `${dir}: "${d}"`);
    }
    const dupes = surviving.filter((d, i) => surviving.findIndex((x) => normalize(x) === normalize(d)) !== i);
    for (const d of dupes) add("duplicate-distractor", `${dir}: "${d}"`);

    if (presented && surviving.length < MIN_DISTRACTORS) {
      add("too-few-distractors", `${dir}: ${surviving.length} surviving`);
    }
    if (presented && surviving.length > MAX_DISTRACTORS) {
      add("too-many-distractors", `${dir}: ${surviving.length} surviving`);
    }

    // An answer already visible as a whole word in the frame is a free tile.
    const frameWords = new Set(normalize(frameOf(line)).split(" "));
    for (const b of blanks) {
      if (frameWords.has(normalize(b))) add("answer-visible", `${dir}: "${b}" is in the frame`);
    }

    // Two blanks of the same class in the same presentation read as swappable.
    // Only advisory: the source-language prompt often pins which is which.
    const classes = blanks.map((b) => [b, wordClass(b)]);
    for (let i = 0; i < classes.length; i++) {
      for (let j = i + 1; j < classes.length; j++) {
        if (classes[i][1] === classes[j][1] && classes[i][1] !== "other") {
          add("same-class-blanks?", `${dir}: [${classes[i][0]}] and [${classes[j][0]}] are both ${classes[i][1]}`);
        }
      }
    }
  }

  // R5 — the LU line only. A blank directly after an -n-final word has no single
  // correct frame spelling, unless a comma ends the clause first.
  const luBlanks = blanksOf(lu);
  const segments = lu.split(BLANK_RX).filter((_, i) => i % 2 === 0);
  segments.slice(0, luBlanks.length).forEach((seg, i) => {
    const prev = seg.trimEnd().split(/\s+/).pop() ?? "";
    const clauseEnded = /[,;:]\s*$/.test(seg);
    if (!clauseEnded && /n$/i.test(prev) && prev.length > 1) {
      add("eifeler-regel", `blank ${i} follows "-n" word "${prev}" in the same clause`);
    }
  });

  // The n-drop heuristic over the completed LU sentence, so a fill is audited the
  // same way check-content audits a sentence.
  const complete = lu.replace(BLANK_RX, "$1").split(/\s+/);
  complete.slice(0, -1).forEach((raw, i) => {
    if (/[,.;:!?]$/.test(raw)) return;
    const a = raw.replace(/^[.,!?;:]+|[.,!?;:]+$/g, "");
    const b = complete[i + 1].replace(/^[.,!?;:]+|[.,!?;:]+$/g, "");
    if (a.length < 2 || !/n$/i.test(a)) return;
    if (!b || !/\p{L}/u.test(b[0]) || ZOAH.has(baseLetter(b[0]))) return;
    add("n-drop?", `'${a}' before '${b}'`);
  });

  return { label, problems };
};

// ─── Parsing ──────────────────────────────────────────────────────────────────

const fillsIn = (content) =>
  content
    .split(/\n(?=@fill\b|@sentence\b|@word\b|@lesson\b|@image)/)
    .filter((b) => b.startsWith("@fill"))
    .map((block) => {
      const lines = block.split("\n").map((l) => l.replace(/\s+#.*$/, ""));
      const one = (tag) => (lines.find((l) => l.startsWith(tag + " ")) ?? "").slice(tag.length + 1).trim();
      const many = (tag) =>
        lines.filter((l) => l.startsWith(tag + " ")).map((l) => l.slice(tag.length + 1).trim());
      const question = lines.some((l) => l.startsWith("@question "));
      return {
        lu: one("@lu"),
        en: one("@en"),
        distractorsLu: many("@distractor-lu"),
        distractorsEn: many("@distractor-en"),
        question: question ? one("@question") : undefined,
        label: (one("@question") || one("@en")).slice(0, 64),
      };
    });

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
};

const main = async () => {
  const args = process.argv.slice(2);
  const content = args.includes("--stdin")
    ? await readStdin()
    : await readFile(args[0], "utf-8");

  const results = fillsIn(content).map(checkOne);
  const bad = results.filter((r) => r.problems.length > 0);

  // A `?`-suffixed rule is a heuristic to adjudicate, not a build failure.
  const hard = bad.filter((r) => r.problems.some((p) => !p.rule.endsWith("?")));

  console.log(`${results.length} @fill block(s), ${bad.length} with findings\n`);
  bad.forEach(({ label, problems }) => {
    console.log(`  ${label}`);
    problems.forEach(({ rule, detail }) => console.log(`    ${rule.padEnd(22)} ${detail}`));
    console.log();
  });

  if (bad.length === 0) console.log("Clean.");
  else console.log(`${hard.length} block(s) with hard violations; '?' rules are advisory.`);

  process.exit(hard.length > 0 ? 1 : 0);
};

await main();
