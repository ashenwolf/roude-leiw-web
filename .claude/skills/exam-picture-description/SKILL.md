---
name: exam-picture-description
description: >
  Generate a Sproochentest picture-description theme for the Roude Léiw exam track:
  optimizes a dropped-in photo, analyzes what's in it, and authors three .letz
  sub-lesson files (General / Person / Weather description) plus a manifest entry.
  Use when the user wants to add a new exam picture theme, describe a photo for the
  Sproochentest picture task, create picture-description exercises, or has dropped a
  photo into public/assets/tmp for the exam track. This is PURE DESCRIPTION — no
  @question, no first-person opinion — distinct from the personalized-interview
  topic-theme flow (see exam-theme-discussion) and from PDF→course-lesson conversion
  (see letz-content-generator).
---

# Exam Picture Description

## What this skill produces

One picture-description theme for the exam track (`public/assets/exam/`):

- an optimized photo at `public/assets/exam/picture/<slug>/img/<slug>.webp`
- three `.letz` files in the same directory — `01_general.letz`, `02_people.letz`,
  `03_weather.letz`
- one `kind: "picture"` entry in `public/assets/exam/manifest.json`

This is the exam track's **picture** contract: pure description, A1–A2, no
`@question`, no first-person opinion/preference/feeling. If the task is instead a
**topic** theme (vacation/family/shopping-style, with a personalized `@question`
interview), use `exam-theme-discussion`. If the task is PDF→course-lesson
conversion, use `letz-content-generator`.

## Shared references — read the one you need, don't duplicate

These live in the sibling skill and apply unchanged to exam content:

| File | Read it for |
|---|---|
| `.claude/skills/letz-content-generator/references/letz-format.md` | `.letz` syntax, the `@image`/`@image-alt` directive spec and the exact `magick` optimization recipe |
| `.claude/skills/letz-content-generator/references/content-contract.md` | every mechanized bound — §7 (picture-theme contract), §2–5 (`@fill` rules R1–R7), §1 (word/sentence floors) |
| `.claude/skills/letz-content-generator/references/luxembourgish-grammar.md` | connectors, Eifeler Regel, homograph traps |
| `.claude/skills/letz-content-generator/references/content-checks.md` | the pre-commit verification checklist |
| `.claude/memory/picture-description-theme.md` | the ~25-frame `@fill` library (start here, don't invent frames), fill density rationale, indoor/outdoor and seasonal-contrast guidance, the LOD trap list, the image pipeline |
| `.claude/memory/exam-track.md` | why the two theme kinds have different contracts |

Also available: `mcp__lod__lod_lookup` / `lod_suggest` (LOD dictionary MCP) — use it
to verify every new Luxembourgish word and every inflected form inside a sentence.

## Step by step

### 1. Get the photo

The user drops the original into `public/assets/tmp/` (gitignored staging area).
Confirm it's there:

```bash
ls -la public/assets/tmp/
```

**Never** commit the original, point `@image` at a path under `tmp/`, or delete
anything in that folder — it's the user's staging area, not scratch space.

### 2. Analyze the photo

View it with the Read tool. Build a description that covers the examiner's actual
six-question checklist, because that checklist is what maps onto the three files:

| Examiner question | Feeds into |
|---|---|
| **Wou?** — what kind of place, named if recognisable | `01_general` |
| **Wat maache si?** — what the people are doing | `01_general` |
| **Wéi eng Objete?** — objects, **with positions** (left/right/foreground/background) | `01_general` |
| **Wien?** — who's there, how many, alone or in groups | `02_people` |
| One person in visual detail | `02_people` |
| **Wéini?** — time of day, season, weekday-or-weekend guess | `03_weather` |

Specifically extract:

- **The place name** — must be nameable (`de Chrëschtmaart`, `d'Groussgaass`), not
  just "objects visible". This is the examiner's first question.
- **Every distinct object**, and where it sits in the frame.
- **What people are doing**, and roughly how many/whether grouped.
- **One person to describe in detail**: apparent gender, approximate age,
  clothing (each garment + its color), visible mood/state, where they stand.
  Pick whoever the photo gives the most detail to work with.
- **Evidence for hedged inference**: decorations, clothing weight, light quality,
  crowd behavior, anything that argues (without being certain) for a season, a
  time of day, or whether this is an ordinary vs. a special day. This becomes
  03's material — see step 5.
- **Indoor vs. outdoor.** An indoor photo has no sky to read for weather — read
  `picture-description-theme.md`'s "Indoor vs outdoor" section before assuming
  the sky/weather conventions the outdoor samples use; substitute light/season
  cues from what's actually visible (window light, indoor decorations, clothing).

If a suspected typo or non-standard spelling comes up while drafting Luxembourgish
words from this analysis, flag it — don't silently correct it (see
`letz-content-generator`'s "Suspected typos" edge case).

### 3. Pick a slug and check for collisions

- Slug: kebab-case from the photo's subject (`chreschtmaart`, `groussgaass`).
- Confirm it's unused: `grep -o '"id": "[^"]*"' public/assets/exam/manifest.json`
  and `ls public/assets/exam/picture/`.
- Pick an unused `@lesson` id prefix (`<Letter><N>`, e.g. `P4`, cosmetic only — the
  manifest id is authoritative): `grep -h '^@lesson' public/assets/exam/picture/*/*.letz`.
- Theme title = the bare subject name (`"Chrëschtmaart"`), **no**
  `"Describing a Picture: "` prefix — that's added by `themeHeading()` at render
  time.

### 4. Optimize and place the image

```bash
magick identify public/assets/tmp/<original>          # get W×H first
magick public/assets/tmp/<original> \
  -crop <W>x<H>+<X>+<Y> +repage -resize 880x495 \
  -define webp:method=6 -quality 80 -strip \
  public/assets/exam/picture/<slug>/img/<slug>.webp
```

Crop to 16:9 first (compute `<W>x<H>+<X>+<Y>` from the identified dimensions —
center-crop unless the subject sits off-center), then cap width at 880px. Verify
after: `magick identify public/assets/exam/picture/<slug>/img/<slug>.webp` should
show `RIFF/WEBP`, width ≤ 880.

### 5. Author the three files

Each file needs `@image` + `@image-alt` (declare in **every** file, even though
they point at the same photo — the learner must see it each sub-lesson; vary the
alt text per file to describe that file's detail), plus the standard floors
(≥10 `@word`, ≥3 `@sentence`) and a comparable `@fill` share (10 per file matches
the existing themes — see "Fill density" in the memory file; check with
`grep -c '^@word' <file>` against sibling files rather than a fixed number).

**Register, all three files:** present tense, spatial adverbs (`lénks`, `riets`,
`uewen`, `ënnen`) + prepositions, short two-clause sentences with `well`/`wann`/
`mee`. Attributive adjectives **only on feminine nouns**, uninflected
(`eng blo Box`); masculine/neuter go predicative (`D'Posch ass schwaarz.`).
Declined attributives and verb-final subordinate clauses belong in `@fill`, not
`@sentence` — the learner reads the frame instead of assembling it.

- **`01_general.letz`** — name the place; list objects with positions
  (foreground/background/left/right); state what people are doing. Don't
  describe any one person in depth here — that's 02's job.
- **`02_people.letz`** — who's present and how many; then the one detailed
  person: gender-appropriate noun (`de Mann`/`d'Meedchen`/`d'Kand`), clothing via
  `hunn … un` (separable, verb-final placement in `@fill`), age via
  `ongeféier N Joer al`, mood via `gesäit … aus`. Don't repeat words `01` already
  taught — the pass-gate makes it a prerequisite and stat keys are shared.
- **`03_weather.letz`** — time of day / season, then the hedged inferences. Use
  the hedge vocabulary the existing themes rely on: `ech mengen`, `villäicht`,
  `warscheinlech` (no `h` — the German cognate is the spelling trap and LOD
  returns `found: 0` for the `h` form), `Ech géif soen`, `Ech sinn net sécher,
  mee villäicht`, `Et kéint … sinn`, `Et gesäit no … aus`, `Ech weess net, ob …`.
  A hedged claim about the photo is not an opinion — a preference or feeling of
  the speaker's own is what's excluded. Every hedge must have real photo
  evidence backing it (see step 2); don't hedge on nothing.

**`@fill` authoring** — start from the frame library in
`picture-description-theme.md` rather than inventing frames; adapt each to this
photo's actual nouns/adjectives. Before finalizing each block, run the selection
test and R1–R7 from `content-contract.md`:

- Does this frame recur across topics (pattern), not just this photo (sentence)?
- R4: keep determiners/prepositions in the fixed frame, never blanked.
- R5: no blank directly after an `-n`-final word mid-clause (two-clause frames
  with a comma before the blank are the safe shape).
- R6: two blanks in the same block need different word classes or a forced order
  — never both sides of `X a Y` unless the pair is ascending/ordered.
- R3 (your half): check every distractor against **every** blank, not just the
  nearest — no test catches semantic validity, only literal equality.

**Correctness rule for every distractor** (`@sentence` and `@fill` alike): if
swapping it in produces a grammatically correct and photo-consistent result,
it's broken. Mentally substitute before finalizing. Keep every `@sentence`/
`@question`-style distractor a single word — the real sentence builder
tokenizes multi-word distractors into that many loose tiles (see
`content-checks.md`).

### 6. Update the manifest

Add to `public/assets/exam/manifest.json`:

```json
{
  "id": "<slug>",
  "kind": "picture",
  "title": "<Subject Name>",
  "subLessons": [
    { "id": "<slug>.01", "file": "picture/<slug>/01_general.letz", "title": "General Description" },
    { "id": "<slug>.02", "file": "picture/<slug>/02_people.letz", "title": "Person Description" },
    { "id": "<slug>.03", "file": "picture/<slug>/03_weather.letz", "title": "Weather Description" }
  ]
}
```

### 7. Verify — run `content-checks.md`'s full checklist, in order

1. LOD every `@word` LU side and every inflected form inside a `@lu` sentence
   (`mcp__lod__lod_lookup`, batched). `found: 0` **with** `suggestions` is the
   error signal; a bare `found: 0` is normal for legitimate plurals/compounds.
2. `npx vitest run tests/integration` — bracket balance, blank/distractor counts,
   R5 adjacency, `@fill`/`@sentence` disjointness, stat-key collisions, the
   picture-theme contract (no `@question`, `@image-alt` present, image ≤880px),
   duplicate `@word` within the theme.
3. `npm run check-content` — the Eifeler-Regel n-drop audit (advisory, you
   adjudicate false positives).
4. The distractor-survival harness through the real builder (see
   `content-checks.md` for the throwaway-harness recipe) — both real ambiguity
   bugs found so far were invisible to every automated check and surfaced only
   by dumping the tiles the builder actually produces.
5. `npm run build` before calling it done.

After it's green, consider whether anything non-obvious about this photo's frame
choices or inference angles is worth adding to `picture-description-theme.md` —
e.g. a new hedge angle, an indoor-specific substitution, a frame pairing no
earlier theme used.
