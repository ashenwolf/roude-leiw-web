---
name: letz-content-generator
description: >
  Generate .letz vocabulary and sentence files for the Roude Léiw Luxembourgish learning app
  from PDF lesson materials. Use this skill whenever the user wants to convert Luxembourgish
  lesson PDFs (Quizlet exports, class slides, vocabulary lists) into .letz format files, or
  when they mention Roude Léiw content creation, .letz files, Luxembourgish lesson conversion,
  vocabulary extraction from PDFs, or building Duolingo-style exercises from course materials.
  Also trigger when the user uploads Luxembourgish lesson PDFs and asks to process, extract,
  or convert them — even if they don't mention ".letz" by name. If the user mentions
  "Luxembourgish lesson" together with "convert", "extract", "process", "generate", or
  "vocabulary", this skill applies.
---

# Letz Content Generator

Generate `.letz` lesson files for the Roude Léiw Luxembourgish learning app from PDF source materials.

## What this skill produces

A single `.letz` file per lesson containing:
- A `@lesson` header with level code and descriptive title
- `@word` entries: vocabulary pairs (Luxembourgish = English)
- `@sentence` entries: full sentences with translations and distractors

## Source material types

Two kinds of PDF input, often provided together for the same lesson:

1. **Quizlet exports** — numbered lists of `Luxembourgish phrase: English translation` pairs
2. **Lesson slides** — presentation decks with vocabulary tables, dialogues, exercises, and grammar notes

When multiple PDFs are provided, they all belong to the same lesson. Merge content from all sources into one `.letz` file, deduplicating entries that appear in both.

## Verifying content with the LOD dictionary (MCP)

This repo ships an MCP server (`tools/lod-mcp/`, registered in `.mcp.json`) that wraps the official **Lëtzebuerger Online Dictionnaire** ([lod.lu](https://lod.lu)). **Use it to verify every `@word` against the authoritative dictionary** rather than trusting the PDF or guessing — it is the source of truth for translations, part of speech, and grammatical gender.

> The tools are loaded only when Claude Code starts. If `lod_lookup` is not available, the session predates `.mcp.json` — ask the user to restart Claude Code, then proceed. (You can still author content without it, but flag entries you couldn't verify.)

**Tools:**
- `lod_lookup { words[]|word, locale?=en, maxEntries?=3, verbose?=false }` → `{ locale, results[] }`; each result is `{ word, found, entries[] }` where an entry has `lemma`, `pos`, `gender` (`m`/`f`/`n`) and `senses[]` (translation with its clarifier folded in, e.g. `"coffee (beans)"`) — or `{ word, found: 0, suggestions[] }` on a miss.
- `lod_suggest { word, locale? }` → spellchecker suggestions. **Rarely needed** — a `lod_lookup` miss already returns them.

> **Batch every lookup.** Pass the whole vocabulary list in one `words: [...]` call (≤60, deduped, order preserved) — collect the lemmas first, then make a single call. One call per word costs one model round trip each and is the slow path. Add `verbose: true` only when you actually need IPA or declension info.

**When to call it:**
1. **Gender → article.** Batch-look-up every noun lemma; map `gender` to the definite article — `m`→`de(n)`, `f`→`d'`, `n`→`d'`/`den`. Don't infer the article from the PDF; confirm it (see step 4).
2. **Translation sanity.** Cross-check your English gloss against the entry's `senses`. If they diverge, prefer the LOD gloss or flag the conflict in the summary (see step 5).
3. **Typo / lemma recovery.** A misspelled or inflected source word comes back `found: 0` with `suggestions` inline — re-look-up the suggested lemma in your next batch (see Edge cases).

**Caveats:**
- **Inflected forms, typos, and proper names return `found: 0`** (not an error). Read the `suggestions` that come with it: non-empty = misspelled, empty = usually a legitimate plural or compound (`Kanner`, `Beem`, `Keessebong`). Never invent a translation for a miss.
- **Polysemy / homographs:** a word can have multiple senses or entries (`Bank` = bank *and* bench/`Bänk`; `Kéis` = cheese *and* nonsense; `Post` masc/fem). Pick the sense that fits the lesson context — first result isn't always right. The parenthesised clarifier in each sense is what tells them apart; raise `maxEntries` to see more homographs.

## Step-by-step workflow

### 1. Read all provided PDFs

Use the pdf-reading skill or the content already in context. Extract every Luxembourgish–English pair and every Luxembourgish sentence you can find, including:
- Explicit vocabulary lists and tables
- Example sentences in dialogues and exercises
- Fill-in-the-blank exercises (use the completed/answered version when available)
- Conversation scripts between characters

### 2. Determine lesson metadata

Derive the `@lesson` line:
- **Lesson number**: extract from filenames (e.g., `lesson-1.pdf` → `A1.01`, `lesson-2a.pdf` → `A1.02`). If the user provides a number, use it. If ambiguous, ask.
- **Lesson title**: infer from the dominant topic of the vocabulary. Use a short English description in quotes (e.g., `"Greetings & Introductions"`, `"Where Are You From?"`, `"Family & Descriptions"`).

### 3. Classify each extracted item as WORD or SENTENCE

This is the critical routing decision:

**→ WORD** if:
- It is a single word: `Moien = Hi`
- It is a 2-word fixed expression: `Gudde Moien = Good morning`
- It is a standard short greeting/farewell: `Gudden Owend = Good evening`
- It is a noun with article: `de Gaart = the garden`
- It is a bare infinitive verb or short verb phrase (≤3 words): `schaffen = to work`

**→ SENTENCE** if:
- It contains more than 3 words (unless it's a standard greeting)
- It is a question: `Wéi heeschs du? = What are you called?`
- It is a conjugated-verb clause: `Ech kommen aus Frankräich. = I come from France.`
- It contains subject + verb + object/complement structure

When a Quizlet entry is a full sentence, route it to `@sentence`, not `@word` — even though the source treats it as a vocabulary item.

### 4. Process WORD entries

Apply these transformations:

#### Split singular/plural
Source: `e Gaart, de Gaart (m), Gäert: garden, gardens`
Output:
```
@word de Gaart = the garden
@word d'Gäert = the gardens
```

#### Keep the article, drop the gender marker
Source has `(m)`, `(f)`, `(n)` — omit these annotations. The article itself (`de`, `d'`, `den`, `eng`) already signals gender to the learner.

Source: `e Buch, d'Buch (n), Bicher: book, books`
Output:
```
@word d'Buch = the book
@word d'Bicher = the books
```

Use the **definite article form** (de/d'/den/eng→d') for the primary entry. The indefinite form (e/en/eng) is implicit.

When unsure of a noun's gender (and therefore its article), confirm with `lod_lookup` — the `gender` field (`m`/`f`/`n`) is authoritative: `m`→`de`/`den`, `f`→`d'`, `n`→`d'`/`den`. Prefer this over guessing from the source.

#### Drop formal/informal annotations
Source: `Schwätz du Lëtzebuergesch?: Do you (informal) speak Luxembourgish?`
If this routes to a sentence, the English side should just say: `Do you speak Luxembourgish?`

Do NOT create duplicate entries for formal vs. informal variants of the same meaning. Pick the more common or informal version unless both are clearly distinct vocabulary.

#### Countable vs. non-countable
For non-countable nouns, produce a single entry:
Source: `d'Fleesch (n, non-countable): meat`
Output: `@word d'Fleesch = the meat` (just one line, no plural)

#### Adjectives, adverbs, and other parts of speech
Straightforward mapping:
```
@word kleng = small
@word grouss = big, tall
@word spéit = late
```

Before finalizing a batch of `@word` entries, verify them against `lod_lookup` — **one call with every lemma in `words: [...]`** (see "Verifying content with the LOD dictionary" above). For each lemma, confirm the English gloss matches one of the entry's `senses`; if your gloss and LOD's disagree, prefer LOD's or flag the conflict in the output summary.

### 5. Process SENTENCE entries

For each sentence:

```
@sentence
@lu Ech kommen aus der Ukrain.
@en I come from Ukraine.
@distractor-en Germany
@distractor-en live
@distractor-lu Däitschland
@distractor-lu wunnen
```

#### Generating distractors

Produce 3–5 distractors per sentence split roughly evenly between `@distractor-en` and `@distractor-lu`.

**Distractor selection strategy (in priority order):**

1. **Same-lesson vocabulary** that is semantically close but wrong — a different country, a different verb, a different pronoun. These are the best distractors because they test real comprehension.
2. **Same grammatical category** — if the sentence uses a verb, a distractor verb; if it uses a noun, a distractor noun. Don't mix a distractor adjective into a slot where a noun is expected.
3. **Plausible confusions** — words the student might genuinely mix up at A1 level. E.g., `wou` vs `wat` vs `wéi`, or `aus` vs `vu` vs `an`.

Avoid distractors that are obviously wrong (e.g., a food word as a distractor in a greeting sentence).

**Critical correctness rule:** A distractor must NEVER be a synonym or valid substitute for any word in the correct sentence. If swapping a distractor into the sentence could produce a grammatically correct and semantically valid translation, that distractor is broken — it would punish a student for a correct answer. Before finalizing each distractor, mentally substitute it into the sentence and verify it produces a clearly *wrong* result.

Examples of BAD distractors:
- Sentence: `Ech kommen aus Frankräich.` / `I come from France.` → distractor `arrive` is bad because "I arrive from France" is borderline valid
- Sentence: `Gudde Moien!` / `Good morning!` → distractor `Moien` is bad because `Moien` is literally part of the sentence
- Sentence: `Ech sinn traureg.` / `I'm sad.` → distractor `unhappy` is bad because it's a synonym of `sad`

#### Handling ambiguous / multi-interpretation sentences

If a sentence from the slides has blanks to fill in, and the answer is provided (often on a later slide or in a side annotation), use the completed sentence. If the answer isn't provided but can be unambiguously inferred from grammar rules taught in the lesson, fill it in. If genuinely ambiguous, skip it.

#### Formal vs. informal sentence variants

When both `du` and `Dir` versions exist for the same sentence pattern, pick ONE (prefer `du` for A1 as it's more conversational) and use it. Don't duplicate.

### 6. Assemble the .letz file

Structure:
```
# A1.01/01_greetings.letz

@lesson A1.01 "Greetings & Introductions"

@word Moien = Hi
@word Gudde Moien = Good morning
...

@sentence
@lu Wéi geet et dir?
@en How are you?
@distractor-en ...
@distractor-lu ...
```

**Ordering:**
- Words first, grouped loosely by sub-topic (greetings, then farewells, then nouns, then verbs, etc.) — but don't add sub-headers or comments between groups.
- Sentences after all words.
- Within sentences, order by complexity (shorter/simpler first).

**Filename convention:** `{level}_{number}_{snake_case_topic}.letz`
Example: `A1_01_greetings_and_introductions.letz`

### 7. Output

Save the `.letz` file to `/mnt/user-data/outputs/` and present it to the user.

After presenting, briefly summarize what was generated: how many `@word` entries, how many `@sentence` entries, and flag anything that was ambiguous or skipped with a reason.

## Edge cases and pitfalls

**Suspected typos** — Luxembourgish spelling can be inconsistent across sources (e.g., `Kaf` vs the standard `Kaffi`, or `Lëtzebuesch` vs `Lëtzebuergesch`). When you spot a word that looks like a misspelling or non-standard form, **confirm with the LOD dictionary**: a `lod_lookup` returning `found: 0` means it isn't a dictionary lemma, and the `suggestions` returned alongside it give the standard spelling — re-verify that lemma in your next batch call. Include the entry using the source spelling but add a warning at the end of the output summary. Format: `⚠️ Possible typo: "Kaf" in source — LOD suggests "Kaffi". Used source form.` Let the user decide whether to correct it.

**Infinitive extraction** — When a sentence in the source uses a conjugated verb (e.g., `Du bezils d'Rechnung`), it is fine to extract the infinitive form (`bezuelen = to pay`) as a separate `@word` entry even if the infinitive never appears explicitly in the PDF. This is expected and useful — learners need the dictionary form. Verify the infinitive you derived with `lod_lookup` (the conjugated form will return `found: 0`; the infinitive lemma should resolve) — this catches a wrong stem before it ships.

**Pronunciation notes** — Slides sometimes include pronunciation hints like `"Lëtzeboiesch"` or `"riit"`. These are teaching aids, not vocabulary. Skip them.

**Grammar tables** — Verb conjugation tables (e.g., the full conjugation of `sinn` or `hunn`) should be extracted as individual word entries only if they represent distinct vocabulary. Don't generate 6 entries for `ech sinn / du bass / hien ass / ...` — instead, just add `sinn = to be` as a word if it's not already there.

**Exercise instructions** — Text like "Fill in the correct form" or "Find the mistake" is meta-content. Skip it.

**Slide artifacts** — Page numbers (`1 / 3`, `eent`, `zwee`), URLs (`quizlet.com/...`), and branding (`www.learnluxembourgish.com`) should be stripped.

**The UNITED ZOAH rule** — This is a grammar mnemonic from the lessons (don't drop the N before words starting with U, N, I, T, E, D, Z, O, A, H). Don't extract it as vocabulary — it's a teaching device.

**Duplicate detection** — The same word often appears in both the Quizlet export and the slides. Deduplicate by Luxembourgish form. If English translations differ slightly, pick the more natural/complete one.

## Exam-track content (no PDF source)

Everything above assumes a PDF source and the **course** track. Exam-track themes
(`public/assets/exam/`) are authored from scratch and split into **two kinds with
different content contracts**. Decide which kind you are writing *before* writing
anything.

| | **Topic themes** (`vacation`, `family`, `shopping`) | **Picture themes** (`picture`) |
|---|---|---|
| Exam skill | conversation with the examiner | describing a photo |
| Path | 3 steps: `01_vocabulary` → `02_phrases` → `03_questions` | 3 tasks per photo: General → Person → Weather |
| `@question` | **required** in `03_questions` | **forbidden** |
| First person | **wanted**, personalised via interview | **excluded** — no opinion/preference/attitude |
| Level | ~B1 | A1–A2 (deliberately stricter) |

### Topic themes: interview the user first — REQUIRED

**Never invent the answers.** Before authoring any `@question` content, ask the
learner the theme's exam questions conversationally and use *their* answers as
the source. The whole point is rehearsing what they will actually say in the
Sproochentest. Use `AskUserQuestion` for closed choices, plain conversation for
open ones. Record in the file header that the answers are personal, so a later
session doesn't "improve" them into generic ones.

### Picture themes: pure description

The learner describes what is visibly in the photo. **No `@question` blocks, and
no first-person opinion, preference, or feeling.** Describing a depicted person's
visible emotion (`Si lächelt`) is fine — that is observation. Rule of thumb: if a
stranger couldn't check the sentence against the photo, cut it.

Coverage is a **six-question checklist** — the questions an examiner actually
asks — mapped onto **three files**, two questions each. Do not create six files.

| Examiner question | File |
|---|---|
| **Wou?** what kind of place (name it if recognisable) | `01` General |
| **Wat maache si?** what the people are doing | `01` General |
| **Wéi eng Objete gesitt Dir?** objects **with positions** | `01` General |
| **Wien?** who is there, how many, alone or in groups | `02` Person |
| **Beschreif eng Persoun** one person in visual detail | `02` Person |
| **Wéini?** time of day, season, weekday-or-weekend | `03` Weather |

- **`01` must name the place**, not just list objects — `d'Foussgängerzon`,
  `d'Groussgaass`, `de Buttek`, `d'Gebai`. Naming the setting is the examiner's
  first question and it is the gap a scene-elements-only file leaves.
- **`03` is the hedged-inference file**; weather is only its evidence. It also
  carries time of day (`mëttes`, `nomëttes`) and weekday-vs-weekend guesses.
  Hedges to teach — the samples use all six: `ech mengen`, `villäicht`,
  `warscheinlech`, `Ech géif soen`, `Ech sinn net sécher, mee …`,
  `Et kéint … sinn`, `Et gesäit no … aus`. Spelling trap: `warscheinlech` has no
  `h` — the German `wahrscheinlich` is the trap and LOD returns `found: 0` for
  the `h` form. Likewise `Vierdergrond` (foreground), never `Virdergrond`.
- Hedged inference is **not** a violation of the no-attitude rule: it is a claim
  about the photo. A preference or feeling of the speaker's own is.

**Converting an existing `@question` block to a plain description** (rather than
deleting authored, already-verified content): drop the `@question` line; restate
a yes/no answer as an assertion (`Nee, hir Hoer sinn net kuerz.` → `Hir Hoer sinn
net kuerz.` — this also removes the free `Jo`/`Nee` first tile); cut anything that
expresses attitude. **Add `@distractor-en` lines**: `@question` blocks are
direction-locked to en→lu so they typically carry only `@distractor-lu`, but a
plain `@sentence` is presented both ways and would otherwise have zero
distractors in lu→en. The file still parses, so nothing warns you.

Additional picture-theme rules:

- **Register — what `@sentence` may carry.** Present tense, spatial adverbs
  (`lénks`, `riets`, `uewen`, `ënnen`) + prepositions, and **short two-clause
  sentences** with the frequent connectors (`well`, `wann`, `mee`) are fine.
  Attributive adjectives **only on feminine nouns** (`eng blo Box` —
  uninflected); colours **predicative** for masculine/neuter (`D'Posch ass
  schwaarz a wäiss.`). That last restriction is about tile-level derivation, so it
  holds at every level.
  Verb-final subordinate clauses and declined attributives (`e schwaarze Brëll`,
  `en normalen Dag`) are better placed in a `@fill`, where the order sits in the
  fixed frame instead of being assembled token by token. **That does not make
  `@fill` a B1 feature** — see the `@fill` section below for its actual
  criterion.
- **Don't re-teach words** an earlier file in the same theme already teaches —
  the sequential pass-gate makes it a prerequisite and stat keys are shared.
- **One theme per photo.** The manifest theme is the photo (`title:
  "Schueberfouer"`, `kind: "picture"`), and its sub-lesson titles are the bare
  task (`"General Description"`, `"Person Description"`, `"Weather
  Description"`). The `"Describing a Picture: "` prefix is added by
  `themeHeading()` at render time — never bake it into a title. Files live in
  `public/assets/exam/picture/<photo>/`, with the photo under that directory's
  `img/`.
- **The photo itself:** the user drops the original into the gitignored
  `public/assets/tmp/` for review. Commit only an optimized derivative — WebP,
  pre-cropped 16:9, ≤880px wide — under `<photo>/img/`. Never commit the
  original, never `@image` a path under `tmp/`, never delete that folder. Recipe
  in `references/letz-format.md`.
- Target **~12–18 Elements per file**. Much larger and the 100% pass-gate makes
  the progress ring crawl.

### Authoring `@fill` blocks

`@fill` teaches a reusable **pattern** in the fixed frame plus **topic and
positional words** in the blanks.

**Exam SubLessons only** — Lesson Mode schedules no fill Slots, so a `@fill` under
`public/assets/lessons/` would make that course lesson unpassable.

> **Read `references/content-contract.md` first.** It carries every mechanized
> bound with the failing test's exact message, including the three you cannot
> guess: distractors are counted *after* the builder drops collisions with an
> answer (so author 3 for margin), `normalizeAnswer` folds case and strips
> apostrophes (`d'Sonn` and `dSonn` are one tile), and `fillKey` is built from the
> **raw `@en` line including brackets** — moving a bracket orphans recorded
> progress.

**The selection test — what belongs in a `@fill`.** It exists to drill the phrases
and constructions that **span multiple topics**, and it is **not level-scoped**: A1
openers (`Am Hannergrond gesinn ech …`) are as much fill material as B1 clauses
(`…, falls et reent`). So never ask "is this B1?" but:

> Does this frame recur across topics, so learning it once pays off in several
> themes?

A sentence true of exactly one photo fails that test at any level — it is a
`@sentence`. Flip side of "never reuse a sentence a `@sentence` already teaches":
`@sentence` teaches *that sentence*, `@fill` teaches a *pattern that outlives it*.

**The promise is that exactly one assignment of tiles to blanks is correct.**

| # | Rule | Enforced by |
|---|---|---|
| R1 | Every tile text distinct in one presentation, under `normalizeAnswer` | test |
| R2 | No two blanks grammatically interchangeable (same word class **and** slot) | **you** |
| R3 | Every distractor wrong in **every** blank, not just the nearest | test catches literal equality only — **the semantic half is yours** |
| R4 | Determiners and prepositions stay in the **fixed frame** | **you** |
| R5 | No blank directly after an `-n`-final word *mid-clause* | test |
| R6 | Two blanks need different word classes **or** a forced order | **you** |
| R7 | Blanking a connector is allowed, and is the sharpest trap | **you** |

- **R4 is load-bearing.** With `d'` outside the blank, masculine tiles are
  grammatically impossible there and exactly one assignment survives.
- **R5 has a payoff:** the n-drop does not cross a comma, so **two-clause frames
  are the safer shape**, not the riskier one. A blank mid-clause after `-n` makes
  the frame *unfixable*; keeping a determiner in the frame
  (`gesinn ech e [Chantier]`) defuses it.
- **R6 by construction:** `X a Y` with **both** sides blanked always violates it
  unless the pair has a forced order (`[fofzeg] bis [siechzeg]` is ascending;
  `[kuerz] [donkel] Hoer` is length-before-colour). Two coordinated predicative
  adjectives are always interchangeable — blank one side only. Two blanks are safe
  only in *different clauses* or *different word classes*.
- **R7:** often the connector *is* the lesson, so `…, [falls] et reent` is
  legitimate — but connectors overlap (`well` and `wann` are frequently also true).
  Contrast (`obwuel`) and sequence (`nodeems`, `éier`) are far easier to make
  unambiguous than cause/condition. Never blank both the connector **and** a
  content word that determines which connector is right.

**The annotated frame library** — ~25 photo-independent frames with the rationale
for each blank — is in `.claude/memory/picture-description-theme.md`. Start from it
rather than inventing frames.

**Two bugs the tests cannot see, both found by the builder audit** (see
`references/content-checks.md`): a *semantically valid* distractor is a second
correct answer (`sécher` in a hedge slot is grammatical **and** coherent), and two
coordinated adjectives are interchangeable. Run the audit.

### B1: conjunctions and connecting words

Exam content **may venture into B1**, and complex sentences are the vehicle. The
two categories must not be mixed up — that confusion *is* the B1 error:
subordinating conjunctions send the verb to the end; connecting words are
order-neutral and cannot themselves cause inversion.

**The verified inventory, both inversion patterns content must show, the two wrong
forms class handouts circulate, and the homograph gloss traps are in
`references/luxembourgish-grammar.md` §§ 2–4.** Don't restate them here.

### Verification

**The full checklist is `references/content-checks.md`** — run it before every
commit. In short: LOD every LU side and every inflected form in a sentence;
`npm run check-content` for the n-drop audit; the distractor-survival harness
through the real builder; then `npm run build`.

Every exam sub-lesson must mix `@word` and `@sentence` content (≥10 words,
≥3 sentences) so Sessions alternate exercise types — enforced by
`tests/integration/exam-manifest-letz.test.ts`.

## References

Read the one you need; don't read all four.

| File | Contains |
|---|---|
| `references/letz-format.md` | the `.letz` DSL **syntax** — every directive, with examples |
| `references/content-contract.md` | every **mechanized bound** the build enforces, each row naming the failing test and its message. Consult instead of reading the integration tests. |
| `references/luxembourgish-grammar.md` | the **language facts** — Eifeler Regel, conjunctions, connectors, homograph traps, noun conventions |
| `references/content-checks.md` | the **verification checklist**, and why each check is a test, a script, or manual |
