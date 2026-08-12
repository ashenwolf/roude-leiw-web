# Authored-Content Contract — mechanized bounds

Every numeric limit and string rule that `npm run build` enforces on `.letz`
content, in one place, with the test that fails and the exact message you'll get.

**Why this file exists:** these bounds otherwise live only in test source, so
authoring a `@fill` block correctly would mean reading
`tests/integration/fill-content-rules.test.ts`, `exam-manifest-letz.test.ts`,
`buildFillExercise`, `normalizeAnswer`, and `lexer.ts`. Author against this table
instead. If you change a bound in a
test, change this row in the same commit — a stale row here is worse than no row,
because it will be trusted.

Two enforcing files:
- **F** = `tests/integration/fill-content-rules.test.ts` — walks **every** `.letz`
  under `public/assets/` (both catalogs, recursive).
- **M** = `tests/integration/exam-manifest-letz.test.ts` — walks the exam manifest
  only.

---

## 1. Per-sub-lesson Element floors (exam track)

| Bound | Value | Test | Notes |
|---|---|---|---|
| `@word` entries per sub-lesson | **≥ 10** | M | `"${sub.id}: needs vocabulary"` |
| `@sentence` blocks per sub-lesson | **≥ 3** | M | `"${sub.id}: needs sentences"` |
| `entries + sentences` | > 0 | M | subsumed by the two above |
| every `@word` side non-empty | — | M | a bare `@word x =` fails |
| every `@sentence` has ≥1 LU and ≥1 EN variant | — | M | |

**This is the floor for trimming.** When you remove content to offset newly
added `@fill` Elements, you may not drop a file below 10 words / 3 sentences.
`@fill` blocks do **not** count toward either floor — they are a third kind.

### Duplicate `@word` — scoped to the whole theme, and both sides

| Bound | Test | Failure message |
|---|---|---|
| no two `@word` entries in a **theme** share an LU side | M | `${theme.id}: duplicate LU side` |
| no two `@word` entries in a **theme** share an EN gloss | M | `${theme.id}: duplicate EN gloss` |

The scope is the **theme**, not the file — the sequential pass-gate makes every
earlier sub-lesson a prerequisite, so re-teaching a word is duplicated work
against one shared stat key. Both messages name the offending pair, so the
failure output tells you which file to edit.

**The EN half is a build gate, not advice.** `content-checks.md` lists "distinct
EN gloss per entry" under *while authoring*, which undersells it: word-match
shows several pairs at once, so two entries glossed `the shop` make one of them
unmatchable by reasoning. LU synonyms the dictionary translates identically
(`d'Geld` / `de Su` → "the money") must be re-glossed so they differ
(`the money` / `the coin`).

## 2. `@fill` — brackets and blanks

| Bound | Value | Test | Failure message |
|---|---|---|---|
| `[` count == `]` count, per line | — | F | `unbalanced brackets in "…"` |
| no nesting (`[[x]]`, `[a[b]`) | — | F | `nested brackets in "…"` |
| blanks per direction | **1–4** | F | `(${direction}): N blanks` |
| no empty blank (`[]`) | — | F | `(${direction}): empty blank` |

`BLANK_RX` is `/\[([^[\]]*)\]/g` — non-greedy by construction. Unbalanced
brackets do **not** throw; they survive as literal frame text and render a stray
`[` in the UI. The balance test is the only thing catching that.

Blank counts **may differ** between `@lu` and `@en` (word order differs); the two
presentations are graded independently.

## 3. `@fill` — tiles and distractors

| Bound | Value | Test | Failure message |
|---|---|---|---|
| all tiles distinct under `normalizeAnswer` | — | F | `(${direction}): duplicate tile text` |
| **surviving** distractors per direction | **≥ 2** | F | `(${direction}): only N usable distractors` |
| no distractor equals any blank answer | — | F | `distractor "x" is a correct answer` |
| no blank answer appears as a whole word in the frame | — | F | `answer "x" is already visible in the frame` |

### The distractor trap — count *after* the builder drops collisions

`buildFillExercise` filters authored distractors before they become tiles:

```ts
const blankSet = new Set(blanks.map(normalizeAnswer));
const distractors = rawDistractors
  .map(d => d.trim())
  .filter(d => d.length > 0 && !blankSet.has(normalizeAnswer(d)));
```

So a block authored with exactly 2 distractors, one of which duplicates an
answer, ends with **1** and fails — even though the file visibly lists two
`@distractor-lu` lines. Authoring 3 per direction gives you a margin. Note the
two tests overlap here: a collision trips *both* the `≥2 surviving` count and
the R3 equality check.

### `normalizeAnswer` — the exact spec

The single comparison function for tile identity, answer grading, and
`@fill`/`@sentence` disjointness (`src/exercise/SentenceBuilder/sentence-logic.ts`):

```ts
s.replace(/[.,!?;:'"''""]+/g, "").trim().replace(/\s+/g, " ").toLowerCase()
```

Consequences when checking distinctness by eye:
- **Case is folded** — `Sonn` and `sonn` are the *same* tile. Two tiles differing
  only in capitalization fail R1.
- **Apostrophes are stripped** — `d'Bild` → `dbild`. So `d'Sonn` and `dSonn`
  collide, and an apostrophe cannot be the only thing distinguishing two tiles.
- **Punctuation is stripped** but hyphens and `ë/é/ä` are **not** — `T-Shirt`
  keeps its hyphen, diacritics are significant. `Wollek` ≠ `Wolleken`.
- Whitespace collapses, so `Ferris  wheel` == `Ferris wheel`.

### "Answer visible in the frame" is whole-word

The check is `frameText.split(" ").includes(needle)` after normalization — so a
**multi-word** blank (`[Ferris wheel]`) is never caught by it, and a substring
(`Sonn` inside `Sonnebrëll`) is not caught either. Both are still authoring bugs;
the test just won't name them.

## 4. `@fill` — R5, the Eifeler Regel adjacency rule

| Bound | Test | Failure message |
|---|---|---|
| no LU blank directly follows an `-n`-final word **within the same clause** | F | `blank N follows "-n" word "x" in the same clause (Eifeler Regel)` |

Why: the n survives before a vowel or `d/h/n/t` (UNITED ZOAH) and drops
otherwise, so if the word before a blank ends in `-n`, the *correct frame text*
depends on which tile the learner places — there is no single correct form.

Mechanics of the check, which determine how to satisfy it:
- It inspects **only the LU line** (`fill.lu`), not the EN line.
- For each blank it takes the frame segment *before* it and tests the **last
  whitespace-delimited word** with `/n$/i`.
- A segment ending in `,` `;` or `:` (trailing whitespace allowed) is **exempt** —
  a comma ends the clause and stops the rule.

Two ways to fix a violation: reword so the preceding word isn't `-n`-final, or
put a comma before the blank (which is why two-clause frames —
`Ech mengen, et ass [Summer]` — are the safer shape).

## 5. `@fill` — block-level rules

| Bound | Test | Failure message |
|---|---|---|
| exactly **one** `@lu` and **one** `@en` per block | F | `${file}: @lu count` / `@en count` |
| no `@question` inside a `@fill` | F | `@fill must not carry @question` |
| no `@fill` shares a sentence with a `@sentence` in the same file | F | `"…" exists as both a @fill and a @sentence` |
| no two `@fill` blocks in a file teach the same sentence | F | `duplicate @fill sentence` |
| fill stat keys unique per file after truncation | F | `fill stat key collision` |

The grammar shares `sentenceTag` with `@sentence`, so a second `@lu` line parses
fine and the visitor silently keeps the first. Accepted variants *are* ambiguity
for this mechanic, hence the count check rather than a parser error.

Disjointness is checked in **both** directions and against both the gapless line
and the joined frame, normalized — so paraphrasing punctuation or case will not
get you past it.

## 6. Stat keys — the truncation rule

| Key family | Shape | Validator regex (`worker/lib/validators.ts`) |
|---|---|---|
| Word | `{lu}\|{en}` | `/^[^\|]{1,64}\|[^\|]{1,64}$/` |
| Phrase | `phrase:{en-lu\|lu-en}:{firstEn}` | `/^phrase:(?:en-lu\|lu-en):[^\|]{1,64}$/` |
| Fill | `fill:{en-lu\|lu-en}:{firstEn}` | `/^fill:(?:en-lu\|lu-en):[^\|]{1,64}$/` |

`elementKey` truncates `firstEn` to **64 chars** to stay in lockstep with those
regexes. Two elements of the same kind whose English agrees for 64 chars collide
onto one stat key.

**Non-obvious and load-bearing:** `fillKey` is built from the **raw `@en` line,
brackets included** — `buildFillExercise` passes `entry.en`, not the stripped
form. Two consequences:

1. Brackets consume part of the 64-char budget, so long EN lines collide sooner
   than their visible text suggests.
2. **Moving a bracket in the `@en` line changes the stat key**, which orphans any
   progress already recorded against that fill. Editing published `@fill` content
   resets it; treat the `@en` line as the element's identity.

A collision means the server accepts the sync but two different exercises share
one `{shown, correct, incorrect}` row — the mastery gate then can't tell them
apart. Reword one `@en` line; don't shorten to fit.

## 7. Picture-theme contract (`kind: "picture"`)

Keyed on the manifest's `kind` field, **never** on the theme id.

| Bound | Test | Failure message |
|---|---|---|
| every theme declares `kind` ∈ `topic` \| `picture` | M | `${theme.id}: bad kind` |
| theme title carries no `Theme: ` / `Describing a Picture: ` prefix | M | `prefix belongs in themeHeading()` |
| **no `@sentence` carries `@question`** | M | `sentence "…" must not carry @question` |
| every sub-lesson declares `@image-alt` | M | `${sub.id}: needs @image-alt` |
| `@image`, if present, matches `/^\/assets\/exam\//` | M | `@image must be root-relative` |
| `@image` ends in `.webp` | M | `@image must be .webp` |
| `@image` file exists, is a RIFF/WEBP container | M | `not RIFF` / `not WEBP` |
| `@image` width | **≤ 880px** | M | `Npx exceeds the 880px budget` |

Conversely, topic themes' `03_questions` files require `@question` on **every**
sentence (M: `missing @question`) — that rule is keyed on the *filename*
containing `03_questions`, so a renamed file silently escapes it.

Non-mechanized but binding (see `.claude/memory/picture-description-theme.md`):
pure description, no first-person opinion / preference / feeling, no content
about the *learner* visiting the place. A **depicted person's visible emotion**
(`De Jong lächelt`) is observation and is wanted. Rule of thumb: if a stranger
couldn't check the sentence against the photo, it doesn't belong.

## 8. Directive inventory — the lexer rejects anything else

`recoveryEnabled: false`, so an unknown `@token` is a hard lex error, not a
skipped line. The complete set (`src/lib/letz-parser/lexer.ts`):

```
@lesson  @sentence  @fill  @word  @lu  @en
@question  @distractor-en  @distractor-lu  @image  @image-alt
```

Do not invent directives. Adding one means editing `lexer.ts`, `parser.ts` and
`visitor.ts` together; adding a new **Element kind** on top of that is a much wider
change (see the ⚠️ note in `.claude/reference/mode-specs.md`).

Lexer facts that bite while authoring:
- `Text` is `/[^=\r\n#@]+/` — a value containing `=`, `#` or `@` **cannot** be
  unquoted. That's why `@image` / `@image-alt` values must be in double quotes.
- `#` starts a comment **anywhere on a line**, so no inline `#` in content.
- `LessonId` is `/[A-Za-z]\d+\.\d+/` — `P1.03` is legal, `picture.01` is not.
  The in-file `@lesson` id is a cosmetic label on the exam track; the manifest id
  is authoritative.

## 9. Track scoping

| Rule | Why |
|---|---|
| `@fill` in exam sub-lessons **only**, never `public/assets/lessons/` | Lesson Mode schedules no fill Slots, so those Elements can never reach the mastery gate and the lesson becomes unpassable. |
| `@fill` is **not** level-scoped | Its criterion is *reuse across topics*; A1 frames are first-class. |
| `@sentence` stays assemblable | The learner builds every tile: main clauses and short two-clause sentences; attributive adjectives only on feminine nouns (uninflected). |
| Declined attributives and verb-final subordinate clauses → `@fill` frames | The learner reads the frame rather than assembling it. |

## 10. Before committing

**The checklist lives in `content-checks.md`** — one copy, so it cannot drift from
this table. In short: `npx vitest run tests/integration`, LOD-verify new lemmas,
`npm run check-content`, the distractor-survival harness, then `npm run build`.
