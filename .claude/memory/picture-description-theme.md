# Picture-description theme (`picture`) — design decisions

**Date:** 2026-08-11 · Content: `public/assets/exam/picture/01_at_the_fair.letz`

The Sproochentest speaking exam includes a picture-description task: the examiner
shows a photo, the candidate describes it, then answers follow-up questions about
it. This theme drills that task. The first sub-lesson covers one photo — a busy
Luxembourgish funfair (Schueberfouer-style) on a sunny summer afternoon.

## Settled decisions

- **One sub-lesson per photo, not the three-step vocab→phrases→Q&A path.** The
  other themes split a topic across three files because a topic *has* stages. A
  single photo doesn't: its vocabulary, its descriptive sentences, and the
  examiner's questions about it are one unit, and splitting them would put the
  words for a photo in a file that never shows the photo. So `picture` grows by
  adding **photos as sibling sub-lessons** (`picture.02`, `picture.03`, …), not
  by adding stages to one photo. Each new photo file is self-contained: its own
  vocabulary + descriptions + `@question` prompts.
  - Consequence: the sequential pass-gate within the theme now means "master
    photo 1 before photo 2", which is a reasonable difficulty ramp but is
    incidental rather than designed. If photos should be independently open,
    that's a per-theme gating flag — not built, not needed yet.
- **A1–A2 vocabulary and grammar, deliberately stricter than the theme-wide ~B1
  guideline.** The picture task is where a weaker candidate can still score
  points, so the sentences must stay assemblable: present tense, simple main
  clauses, spatial adverbs (`lénks`, `riets`, `uewen`, `ënnen`) plus
  prepositions, and no attributive adjectives on masculine nouns (which would
  drag in declension the learner hasn't met). Because level is not modeled
  anywhere in the exam track (see [[exam-track]]), this is an authoring
  guideline recorded in the file's header comment — nothing enforces it.
- **Mixed plain `@sentence` + `@question` in one file.** Descriptions are plain
  sentences (presentable in either direction — recognizing "Am Hannergrond" in
  LU is as useful as producing it), while examiner prompts carry `@question` and
  are therefore always assembled en→lu by `resolveSentenceDirection`. The
  integration test's "`03_questions` files are all-`@question`" assertion keys
  off the filename, so this file is correctly outside that rule.

## Content notes

- **Vocabulary is LOD-verified** (`lod_lookup` on every `@word` LU side), unlike
  the `vacation`/`family` themes — the follow-up in [[exam-track]] still stands
  for those two. Corrections the dictionary forced: `Riserad` (not
  `Risenrad`), `Vierdergrond` (not `Virdergrond`), `Bam`/`Beem` for tree,
  `Schiet` for shadow, `Fritt`/`Fritten` for fries.
- **Plurals are stored as separate `@word` entries** where a sentence uses the
  plural (`d'Bud`/`d'Buden`, `d'Wollek`/`d'Wolleken`,
  `d'Attraktioun`/`d'Attraktiounen`). Same rationale as the A1 course lessons
  (see [[lesson-content-sizing]]) — the assembled tile must be a word the
  learner has actually been taught.
- **Distractors were validated against the real builder**, not by eye: a
  throwaway test ran `buildSentenceExercise` over every sentence in both
  directions and printed the surviving distractor tiles.
  `buildSentenceExercise` silently drops any distractor token that collides
  with an accepted-answer token, so a multi-word EN distractor like
  "at the top" against an answer containing "at"/"the" degrades to a single
  bare "top" tile. Two distractors were rewritten for this. **Re-run that check
  when adding photos** — the collision is invisible in the `.letz` source.

## Not done

- The photo itself is not displayed anywhere. The app has no image-prompt
  Exercise type, so this file currently teaches the language *for* a picture the
  learner can't see in-app; the header comment describes the scene so the
  content stays maintainable. An `@image` directive + image-prompt Exercise is
  the natural follow-up and would make the theme land properly.
