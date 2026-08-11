# Authoring exam themes — checks that catch real errors

**Date:** 2026-08-11 · First applied while adding the `shopping` theme
("Akafe Goen"): `public/assets/exam/shopping/{01_vocabulary,02_phrases,03_questions}.letz`

The `.letz` grammar and the integration test only guarantee a file *parses* and
mixes both Element kinds. Neither catches wrong Luxembourgish. These four checks
each found real defects that eye-review had already passed, so run all of them
when adding a theme.

## 1. LOD every `@word` LU side, and every inflected form in a `@lu` sentence

`lod_lookup` on lemmas is the documented step (see [[lod-mcp]]), but the
sentences are where the mistakes were. `lod_suggest` on a **conjugated or
plural** form returns `found: 0` plus the standard spelling. Corrections it
forced on `shopping`:

| Wrote | LOD says |
|---|---|
| `owens` (in the evening) | `owes` |
| `Buttecker` (shops) | `Butteker` |
| `wann ech glift` | `wann ech gelift` |

`found: 0` alone is **not** evidence of an error — legitimate plurals
(`Grompere`, `Präisser`, `Bicher`, `Tuten`, `Kaddoen`, `Kleeder`) and compounds
(`Keessebong`, `Wiesselgeld`) return zero with no suggestions. Treat "zero
results **with** suggestions" as the error signal.

## 2. Eifeler Regel (n-drop) on verbs, not just nouns

The UNITED ZOAH mnemonic is taught for nouns, and it is easy to write the bare
verb infinitive/1st-plural and forget it applies there too. Final `-n`/`-nn`
drops before a word starting with anything outside U N I T E D Z O A H. Four
sentences in `shopping/03` were wrong until fixed:

- `ech ginn mat menger Famill` → `ech gi mat …` (m)
- `ech kucken just` → `ech kucke just` (j)
- `ech bezuelen ronn` → `ech bezuele ronn` (r)
- `ech hunn meng Lëscht` → `ech hu meng …` (m)

It correctly does **not** drop where the next word starts with a listed letter:
`ech kafen dacks` (d), `ech sichen e Kaddo` (e), `ech ginn no der Aarbecht` (n),
`ech hunn net genuch` (n). Check each occurrence against the letter list rather
than by ear — the two cases look identical in the source.

## 3. No duplicate English gloss within a theme

Word-match shows several pairs at once; two `@word` entries sharing an EN side
make one of them unmatchable-by-reasoning — the learner must guess. Cheap check:

    grep -h '^@word' *.letz | sed 's/.*= //' | sort | uniq -d

On `shopping` this caught `d'Geld` and `de Su` both glossed "the money"
(`de Su` → "the coin"). Distinct LU synonyms need distinct EN glosses even when
the dictionary lists the same translation for both.

## 4. Distractor audit through the real builder

Already documented in [[picture-description-theme]] and it still applies: a
throwaway test calling `buildSentenceExercise` over every sentence in both
directions, printing surviving tiles. `shopping` passed with no drops, but the
check costs a minute and the failure mode is invisible in source.

## Interview-sourced answers (new pattern)

`shopping/03_questions.letz` holds the **user's own answers**, collected by
asking the exam questions conversationally before authoring. The learner then
rehearses what they will actually say in the Sproochentest instead of generic
content. Worth repeating for any `03_questions` file; it costs one round of
questions and makes the sub-lesson materially more useful. The file header
records that the answers are personal so a future session doesn't "improve"
them into neutral ones.
