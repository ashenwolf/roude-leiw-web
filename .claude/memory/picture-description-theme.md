# Picture-description theme (`picture`) — design decisions

**Date:** 2026-08-11 · Content: `public/assets/exam/picture/01_at_the_fair.letz`,
`02_the_woman_and_the_boy.letz`

The Sproochentest speaking exam includes a picture-description task: the examiner
shows a photo, the candidate describes it, then answers follow-up questions about
it. This theme drills that task. Both sub-lessons so far cover the *same* photo —
a busy Luxembourgish funfair (Schueberfouer-style) on a sunny summer afternoon:
`01` is the whole-scene description, `02` zooms into one person in it.

## Settled decisions

- **Not the three-step vocab→phrases→Q&A path.** The other themes split a topic
  across three files because a topic *has* stages. A photo description doesn't:
  vocabulary, descriptive sentences, and the examiner's questions are one unit,
  and splitting them would put the words for a photo in a file that never shows
  the photo. Every `picture` sub-lesson is therefore self-contained: its own
  vocabulary + descriptions + `@question` prompts.
- **Sub-lessons split by *task*, and only secondarily by photo** (revised
  2026-08-11 when `02_the_woman_and_the_boy` landed). The original note here said
  the theme grows by adding photos as siblings; that was too narrow. The exam's
  picture task has distinct sub-tasks — describe the whole scene, then pick one
  person and describe their appearance — and each is its own sub-lesson even when
  the photo is the same. So the axis is: **one sub-lesson per (photo × task)**.
  Two forces make this the right cut rather than appending to `01`:
  - `01` is already ~23 slots against 11–14 for every other exam sub-lesson.
    With `UNLOCK_LESSON_THRESHOLD` at 1.0 (see [[exam-and-lesson-pass-gate]]) a
    35-slot file's ring crawls — the exact failure mode
    [[lesson-content-sizing]] names splitting as the lever for.
  - The sub-tasks have disjoint vocabulary (scene/spatial vs hair/clothes/body),
    so nothing is duplicated by the split. `02` deliberately does **not** repeat
    words `01` teaches (`d'Fra`, `de Jong`, `droen`, `schwaarz`, `blo`, `frou`,
    `trëppelen`) — the theme's sequential pass-gate makes `01` a prerequisite,
    and stat keys are shared app-wide anyway.
  - Consequence: the sequential pass-gate means "master the whole-scene
    description before the person description", which for this pair is a real
    difficulty ramp. Across *different photos* it would be incidental. If photos
    should be independently open, that's a per-theme gating flag — not built,
    not needed yet.
- **Sub-lesson titles are `"<Photo>: <Task> Description"`** — `Fair: General
  Description`, `Fair: Person Description` (user request 2026-08-11). Because
  sub-lessons of one photo are siblings in a flat path, the title is the only
  thing telling the learner they belong together; the earlier
  `At the Fair` / `The Woman and the Boy` pair read as unrelated topics. The
  photo prefix also stays unambiguous once a second photo lands (`Park: General
  Description`), which a task-only title would not. Titles live in **two**
  places that must agree: the manifest row (authoritative — this is what
  `SubLessonPath` renders) and the in-file `@lesson "…"` label (cosmetic). The
  exam integration test deliberately doesn't compare them, so drift is silent.
- **A1–A2 vocabulary and grammar, deliberately stricter than the theme-wide ~B1
  guideline.** The picture task is where a weaker candidate can still score
  points, so the sentences must stay assemblable: present tense, simple main
  clauses, spatial adverbs (`lénks`, `riets`, `uewen`, `ënnen`) plus
  prepositions, and no attributive adjectives on masculine nouns (which would
  drag in declension the learner hasn't met). Because level is not modeled
  anywhere in the exam track (see [[exam-track]]), this is an authoring
  guideline recorded in the file's header comment — nothing enforces it.
  - **Appearance descriptions are where this constraint is easiest to break**, so
    `02` narrows it: attributive adjectives only on **feminine** nouns (`eng blo
    Box`, `eng hell Box`), where Luxembourgish leaves the adjective uninflected.
    Masculine/neuter attributives (`en schwaarzen T-Shirt`, `e frëndlecht
    Gesiicht`) need declension, so colours are stated **predicatively** instead
    (`D'Posch ass schwaarz a wäiss.`). The same trap already cost one rewrite in
    `01` (`e grousst Riserad` → `gesinn ech d'Riserad`).
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
- **Appearance vocabulary — what LOD rejects.** Authoring `02` burned a lot of
  lookups; recording the misses so the next person-description sub-lesson
  doesn't repeat them. **Not lemmas** (`found: 0`, no usable suggestion):
  `Aen`/`Aa` (eyes/eye), `Hemd` (shirt), `Sandale`, `Bluse`, `Handtäsch`,
  `Kleeder`, `Schouen`, `Getränk`. **Traps that resolve but mean the wrong
  thing:** `Kleedchen` is a *vest/undergarment*, not a dress (`Kleed` is the
  dress); `Polo` glosses only the sport; `Buuscht` is colloquial for a mop of
  hair; `Aarm` (arm, m) is a homograph of the adjective `aarm` "poor".
  **Confirmed and used:** `Hoer` (n), `donkel`, `hell`, `laang`, `kuerz`,
  `Posch` (f), `Box` (f — trousers *and* shorts), `Jeans` (f), `T-Shirt` (m),
  `Schung` (m), `Mamm` (f), `Hand` (f), `jonk`, `wäiss`, `halen`, `lächelen`,
  `ausgesinn`, `nieft`, `zesummen`. Also verified but not yet used:
  `Brëll` (m — note the spelling, not `Bréll`), `Sonnebrëll`, `Gesiicht` (n),
  `Jackett` (f), `Kleed` (n), `Kap` (f), `Faarf` (f), `Kapp` (m),
  `Schëller` (f), `Kand` (n), `beige`, `laachen`.
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
  for every new sub-lesson** — the collision is invisible in the `.letz` source.
  (Done for `02`: all 22 presentations keep both authored distractor tiles.)
  - Harness pitfall: compute the accepted-token set with the exported
    `tokenizeSentence(answer, lang)`, not a whitespace split. A naive split
    treats `d'Posch` as one token, so the real `d'` + `Posch` tiles look like
    surviving distractors and the dump over-reports. `buildSentenceExercise`
    takes `(entry, requestedDirection, lessonVocab)` — no rng argument.

## Not done

- The photo itself is not displayed anywhere. The app has no image-prompt
  Exercise type, so this file currently teaches the language *for* a picture the
  learner can't see in-app; the header comment describes the scene so the
  content stays maintainable. An `@image` directive + image-prompt Exercise is
  the natural follow-up and would make the theme land properly.
