# .letz File Format Reference

The `.letz` format is a custom DSL for the Roude Léiw Luxembourgish learning app. It defines vocabulary and sentence exercises for Duolingo-style Word Match games.

## File structure

```
# {path}/{filename}.letz          ← comment line (optional)

@lesson {LEVEL.NUMBER} "{Title}"  ← exactly one per file

@word {luxembourgish} = {english} ← zero or more
...

@sentence                         ← zero or more sentence blocks
@question {luxembourgish question}   ← optional; forces en→lu presentation
@lu {luxembourgish sentence}
@en {english translation}
@en {alternate english translation}  ← optional, for acceptable variants
@distractor-en {english word}     ← 3-5 distractors total
@distractor-lu {luxembourgish word}
...
```

Not shown above, but **implemented and safe to emit** (both landed Aug 2026):
`@image` / `@image-alt` (lesson-level) and `@fill` blocks. Both are specified
below. The content-level bracket and ambiguity checks for `@fill` already exist in
`tests/integration/fill-content-rules.test.ts`.

**The full set of mechanized bounds — with the failing test and its exact message
per rule — is in `references/content-contract.md`.** This file specifies the
*syntax*; that one specifies the *limits*. Read it before authoring `@fill`.

## Directives

### `@lesson`
```
@lesson A1.01 "Greetings & Introductions"
```
- Level code: `A1`, `A2`, `B1`, etc.
- Number: two-digit, zero-padded
- Title: in double quotes, English, title case

On the **exam track** the in-file id is only a lexer-legal *label* (`P1.01`) —
the manifest id (`picture.01`) is authoritative. Titles appear in both the
manifest row (authoritative, rendered in the UI) and here (cosmetic); nothing
asserts they match, so keep them in sync by hand.

### `@image` / `@image-alt` — BUILT (Aug 2026)

Lesson-level directives for picture-description sub-lessons. **Values must be
quoted** — a bare `=` inside unquoted `Text` breaks parsing. An `@image` path must
be root-relative and same-origin: `img-src` is `'self'` and a test enforces it.

```
@image "/assets/exam/picture/schueberfouer/img/schueberfouer.webp"
@image-alt "A busy funfair with a Ferris wheel and food stalls"
```

- **Must be quoted.** A bare `=` inside an unquoted value breaks the parser, so
  paths and URLs with query strings go in a `QuotedString`.
- One image per sub-lesson, lesson-level (not per sentence). **Every sub-lesson
  of a picture theme declares its own `@image`**, even when they all point at the
  same file — the learner must see the photo in each one. The `@image-alt` text
  should differ per file, describing the detail that sub-lesson drills.
- When `@image` is absent the UI shows a **placeholder** captioned with
  `@image-alt`, so `@image-alt` is load-bearing content, not just a11y text —
  declare it either way.
- **Originals live in `public/assets/tmp/`, which is gitignored.** That folder is
  a staging area the user drops photos into for review — **never commit an
  original**, never point an `@image` at a path under it (nothing there is
  served), and never delete what's in it.
- **Optimize before attaching — required, test-enforced.** Convert to **WebP**,
  pre-crop to **16:9** (the frame is `aspect-video`), cap width at **880px** (2×
  the largest iPhone logical width), and commit only that derived file. A test
  parses the WebP header to check the file exists, is WebP, and fits the budget.
  ```bash
  magick <src> -crop <W>x<H>+<X>+<Y> +repage -resize 880x495 \
    -define webp:method=6 -quality 80 -strip <dest>.webp
  ```
- Keep files local under `public/assets/exam/picture/<photo>/img/` — `img-src
  'self'` already allows them; an external host needs a CSP edit in
  `public/_headers`.

### `@word`
```
@word Moien = Hi
@word de Gaart = the garden
@word schaffen = to work
```
- Left side: Luxembourgish word/phrase with article if noun
- `=` separator
- Right side: English translation
- One entry per line
- No trailing punctuation unless it's part of the word itself

### `@sentence`
```
@sentence
@lu Ech kommen aus Frankräich.
@en I come from France.
@distractor-en Germany
@distractor-en live
@distractor-lu Däitschland
@distractor-lu wunnen
```
- `@sentence` on its own line opens a new sentence block
- `@lu` — the Luxembourgish sentence (exactly one required)
- `@en` — English translation (at least one required, multiple allowed for variants)
- `@distractor-en` — an English word that does NOT belong in the correct translation
- `@distractor-lu` — a Luxembourgish word that does NOT belong in the correct sentence
- 3–5 distractor lines total per sentence block
- Sentence blocks are separated by blank lines

### `@question`

```
@sentence
@question Wéi ass d'Wieder op dem Bild?
@lu D'Wieder ass schéin a sonneg.
@en The weather is nice and sunny.
```

- Optional examiner question in Luxembourgish, rendered above the prompt.
- A sentence carrying `@question` is **always** presented en→lu (assemble the LU
  answer) — enforced in `resolveSentenceDirection`, so it behaves the same on
  both tracks.
- **Exam-track scoping:** required throughout topic-theme `03_questions` files;
  **forbidden in picture-description themes** (those are pure description). See
  the exam-track authoring split in the SKILL.

### `@fill` — BUILT (Aug 2026)

Fill-in-words: most of the sentence is fixed, the learner drops 1–4 words into
bracketed blanks. Safe to emit. The content-level checks (balanced non-nested
brackets, 1–4 blanks per direction, ≥2 *surviving* distractors, no blank text
repeated in the frame, R5 Eifeler-Regel adjacency, no sentence shared with a
`@sentence`, stat-key collisions after 64-char truncation) **are** enforced by
`tests/integration/fill-content-rules.test.ts` — so `npm run build` will fail on
a violation and name the file. Rules that stay authoring judgement: a distractor
must be wrong in *every* blank, and no two blanks may be grammatically
interchangeable.

**Both tracks.** `@fill` is legal under `public/assets/lessons/` as well as in exam
SubLessons: `planLessonMode` schedules fill Slots for any lesson that declares
`@fill` (see `.claude/reference/mode-specs.md` > Lesson). Before Sep 2026 it did
not, and a course fill was an unreachable Element that made its lesson
permanently unpassable — if you are reading an older copy of this rule, that is
why it said "exam only".

```
@fill
@lu Am Hannergrond [gesinn] ech d'[Riserad].
@en In the background I [see] the [Ferris wheel].
@distractor-lu Vierdergrond
@distractor-lu Bam
@distractor-en foreground
@distractor-en tree
```

- `[square brackets]` mark the blanks **in place**, so the full correct sentence
  stays readable in the source. Brackets must be balanced and never nested.
- **Exactly one `@lu` and one `@en`** per block — no answer variants. Variants
  are ambiguity in this exercise.
- **One blank = one tile, verbatim.** A multi-word blank (`[Ferris wheel]`) is a
  single tile; bracket contents and distractor lines are NOT tokenized.
- 1–4 blanks per direction; ≥2 distractors per direction — counted **after** the
  builder drops any distractor equal to an answer, so author 3 for margin. Blank
  count may differ between `@lu` and `@en` (word order differs) — that is fine, the
  two presentations are graded independently.
- **The `@en` line is the element's identity.** `fillKey` is built from it raw,
  brackets included, truncated to 64 chars — so moving a bracket in `@en` changes
  the stat key and orphans recorded progress.
- Purpose: the fixed frame teaches the reusable **pattern**, the blanks drill
  **topic words** and (for picture description) **positional words**.
- **A `@fill` must never carry the same sentence as a `@sentence`** — pick a
  pattern worth reusing, don't re-teach an already-assembled sentence.
- **The one-correct-form rules** — see the SKILL's "Authoring @fill blocks".

## Formatting rules

- UTF-8 encoding
- Luxembourgish special characters must be preserved: ë, é, è, ä, ü, ö
- No smart quotes — use straight double quotes for the lesson title
- Blank line between the `@lesson` line and the first `@word`
- Blank line between the last `@word` and the first `@sentence`
- Blank line between each `@sentence` block
- Comment lines start with `#` and are ignored by the parser
- No inline comments

## What goes in @word vs @sentence

| Input | Classification | Reason |
|---|---|---|
| `Moien` = `Hi` | @word | Single word |
| `Gudde Moien` = `Good morning` | @word | Fixed 2-word greeting |
| `de Gaart` = `the garden` | @word | Noun with article |
| `schaffen` = `to work` | @word | Bare infinitive |
| `Gudden Owend` = `Good evening` | @word | Fixed greeting |
| `Ech sinn d'Anne.` | @sentence | Subject + verb + complement |
| `Wéi heeschs du?` | @sentence | Question with conjugated verb |
| `Mir geet et gutt.` | @sentence | >3 words, conjugated verb |
| `Ech kommen aus Frankräich.` | @sentence | Full clause |

## Noun entry conventions

Always use the **definite article** form for noun entries:
- Masculine: `de` / `den` (before UNITED ZOAH consonants)
- Feminine: `d'` (before consonant) or `d'` (before vowel)  
- Neutral: `d'`
- Plural: `d'`

Split singular and plural into separate `@word` entries.

Examples:
```
@word de Gaart = the garden
@word d'Gäert = the gardens
@word d'Mamm = the mother
@word d'Mammen = the mothers
@word d'Kand = the child
@word d'Kanner = the children
```
