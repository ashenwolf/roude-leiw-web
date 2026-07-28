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
- `lod_lookup { word, locale?=en, maxEntries?=3 }` → matching entries with `lemma`, `partOfSpeech`, `gender` (`m`/`f`/`n`), `ipa`, and `meanings[]` (each with `translations`, `clarifiers`, `examples`).
- `lod_suggest { word, locale? }` → spellchecker suggestions (find the correct lemma before `lod_lookup`).

**When to call it:**
1. **Gender → article.** Look up each noun's lemma; map `gender` to the definite article — `m`→`de(n)`, `f`→`d'`, `n`→`d'`/`den`. Don't infer the article from the PDF; confirm it (see step 4).
2. **Translation sanity.** Cross-check your English gloss against the entry's `translations`. If they diverge, prefer the LOD gloss or flag the conflict in the summary (see step 5).
3. **Typo / lemma recovery.** When a source word looks misspelled or inflected, run `lod_suggest`, then `lod_lookup` the suggested lemma (see Edge cases).

**Caveats:**
- **Inflected forms, typos, and proper names return `found: 0`** (not an error). A zero result means "not a dictionary lemma" — recover the lemma with `lod_suggest`, don't invent a translation.
- **Polysemy / homographs:** a word can have multiple senses or entries (`Bank` = bank *and* bench/`Bänk`; `Kéis` = cheese *and* nonsense; `Post` masc/fem). Pick the sense that fits the lesson context — first result isn't always right. Raise `maxEntries` to see alternatives.

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

Before finalizing a batch of `@word` entries, verify them against `lod_lookup` (see "Verifying content with the LOD dictionary" above). For each lemma, confirm the English gloss matches one of the entry's `translations`; if your gloss and LOD's disagree, prefer LOD's or flag the conflict in the output summary.

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

**Suspected typos** — Luxembourgish spelling can be inconsistent across sources (e.g., `Kaf` vs the standard `Kaffi`, or `Lëtzebuesch` vs `Lëtzebuergesch`). When you spot a word that looks like a misspelling or non-standard form, **confirm with the LOD dictionary**: a `lod_lookup` returning `found: 0` means it isn't a dictionary lemma — run `lod_suggest` to get the standard spelling, then `lod_lookup` that lemma to verify. Include the entry using the source spelling but add a warning at the end of the output summary. Format: `⚠️ Possible typo: "Kaf" in source — LOD suggests "Kaffi". Used source form.` Let the user decide whether to correct it.

**Infinitive extraction** — When a sentence in the source uses a conjugated verb (e.g., `Du bezils d'Rechnung`), it is fine to extract the infinitive form (`bezuelen = to pay`) as a separate `@word` entry even if the infinitive never appears explicitly in the PDF. This is expected and useful — learners need the dictionary form. Verify the infinitive you derived with `lod_lookup` (the conjugated form will return `found: 0`; the infinitive lemma should resolve) — this catches a wrong stem before it ships.

**Pronunciation notes** — Slides sometimes include pronunciation hints like `"Lëtzeboiesch"` or `"riit"`. These are teaching aids, not vocabulary. Skip them.

**Grammar tables** — Verb conjugation tables (e.g., the full conjugation of `sinn` or `hunn`) should be extracted as individual word entries only if they represent distinct vocabulary. Don't generate 6 entries for `ech sinn / du bass / hien ass / ...` — instead, just add `sinn = to be` as a word if it's not already there.

**Exercise instructions** — Text like "Fill in the correct form" or "Find the mistake" is meta-content. Skip it.

**Slide artifacts** — Page numbers (`1 / 3`, `eent`, `zwee`), URLs (`quizlet.com/...`), and branding (`www.learnluxembourgish.com`) should be stripped.

**The UNITED ZOAH rule** — This is a grammar mnemonic from the lessons (don't drop the N before words starting with U, N, I, T, E, D, Z, O, A, H). Don't extract it as vocabulary — it's a teaching device.

**Duplicate detection** — The same word often appears in both the Quizlet export and the slides. Deduplicate by Luxembourgish form. If English translations differ slightly, pick the more natural/complete one.

## Format reference

See `references/letz-format.md` for the complete `.letz` DSL specification if you need to verify syntax details.
