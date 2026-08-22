# `@fill` — why the mechanic is shaped this way

**Status: mechanic built; first content shipped in the Schueberfouer picture
theme, so the ambiguity rules are now enforced over real content.** No course
lesson carries `@fill` — see "The remaining gap" below for why one can't yet.

Authoring rules and bounds: the `letz-content-generator` skill and its
`references/content-contract.md`. This file is the *why*.

## What it is for

Most of a sentence is already in place; the learner drops 1–4 words into the
blanks. The purpose is **not** more sentence practice — it teaches the **typical
phrases** used to describe a picture or answer a topic question, plus the **topic
and positional words** that slot into them.

The frame carries the pattern; the blanks carry the vocabulary. That division
should drive every authoring decision.

## `@fill` is scoped to *reusable* material, not to a level

**Correction (user) — do not reintroduce the old framing.** An earlier draft
called `@fill` "the designated home for B1". That is wrong: `@fill` is not tied to
a level. Its axis is **reuse**, so the selection test is never "is this B1?" but:

> Does this frame recur across topics, so learning it once pays off in several
> themes?

`Am Hannergrond gesinn ech …` qualifies at A1. `Ech bleiwen doheem, falls …`
qualifies at B1. A sentence true of exactly one photo qualifies at no level — it
is a `@sentence`. A beginner needs the reusable openers *most*, so A1 frames are
first-class. Don't gate `@fill` authoring on reaching B1, and don't let a theme's
level guideline decide whether it gets fill items.

B1 material *happens* to fit `@fill` well, for the mechanical reason in
[[exam-track]] § Register split — that is a consequence, not the definition.

## Settled design decisions

- **A new `@fill` block, not an annotation on `@sentence`.** Bracketing an existing
  `@sentence` and letting the planner pick a mechanic is far cheaper (no new
  Element kind, no validator change) but forces one distractor set to serve two
  mechanics whose correctness rules differ: a distractor that is safely wrong when
  assembling a whole sentence can be a *second valid answer* in one blank. Since
  "exactly one correct form" is a hard requirement, distractor sets must be
  authored per mechanic — so, separate blocks.
- **Its own Element kind**, with its own stat key, its own contribution to lesson
  progress, and its own error pool. A separate `fill:` prefix rather than reusing
  `phrase:`: reuse would collide a `@fill` with a `@sentence` expressing the same
  English, made *more* likely by the 64-char key truncation. The disjointness rule
  already prevents that collision; the separate prefix means a future authoring
  slip can't silently merge two Elements' stats.
- **`@fill` and `@sentence` must never carry the same sentence** (user). Not merely
  a key-collision guard — a content rule. Re-teaching a sentence the learner
  already assembles whole wastes a Slot. `@sentence` teaches *that sentence*;
  `@fill` teaches a *pattern that outlives it*.
- **Square brackets mark blanks in place**, so the full correct sentence stays
  readable in the source. Verified: `[` and `]` already pass through the lexer
  untouched and appear in no existing file, so they needed no lexer change. Beats a
  separate index list or a `___` placeholder plus answer line — no second place to
  keep in sync, and review-by-eye works.
- **Exactly one `@lu` and one `@en` per block.** The grammar permits more (it
  shares `sentenceTag` with `@sentence`), so this is test-enforced rather than
  grammatical. Accepted variants *are* ambiguity for this mechanic.
- **One blank = one tile, verbatim.** Bracket contents and distractor lines are
  **not** tokenized — a multi-word blank is one tile. This eliminates within-blank
  ordering ambiguity outright and is a deliberate divergence from the sentence
  builder. Do not "unify" the two by routing fill tiles through `tokenizeSentence`.
- **Blank counts may differ between `@lu` and `@en`** because word order does. The
  two presentations are graded and keyed independently; no cross-language blank
  correspondence is implied.
- **All-or-nothing grading, one progress tick per Slot** (per submit, not per
  blank). Per-blank ticks would make a 4-blank item weigh 4× a sentence on the
  progress bar for the same single graded decision. `FillGameState` is an immutable
  accumulation record with a one-way lock — a structural sibling of
  `sentence-logic.ts`, deliberately not a state machine.

## The ambiguity rules, and which one is load-bearing

Five rules guarantee "exactly one correct form". Three are mechanized (tile
distinctness, distractor ≠ answer, the Eifeler-Regel adjacency rule); two are
authoring judgement no test can see — no two blanks grammatically interchangeable,
and **a distractor must be wrong in *every* blank**, not just the nearest one.

**Keeping determiners and prepositions in the fixed frame is the load-bearing
one.** With `d'` outside the blank, masculine tiles are grammatically impossible
there and exactly one assignment survives.

**Conscious tradeoff:** this lets *grammar* rather than *meaning* eliminate some
distractors, which makes a fill item a weaker test of comprehension than a
sentence builder item. Accepted — uniqueness is the hard constraint, and the fixed
frame is precisely the reusable pattern the exercise exists to teach.

## Two-clause frames are the *safer* shape

The Eifeler-Regel n-drop does not cross a comma, so a blank at a clause boundary
is safe while a blank mid-clause after an `-n`-final word makes the frame
**unfixable** (the correct spelling would depend on which tile is placed). This is
counter-intuitive and worth remembering: `…, well d'[Beem] keng [Blieder] hunn` is
exactly the shape this mechanic wants.

## Blanking a connector — the sharpest trap

Independent of level. The natural thing to blank in a two-clause frame is the
connector, and connectors overlap semantically: in `Ech bleiwen doheem, [falls] et
reent`, both `well` and `wann` are also true. It is permitted — often it *is* the
lesson — but it makes the uniqueness rules harder, not easier. Contrast (`obwuel`)
and sequence (`nodeems`, `éier`) are far easier to make unique than
cause/condition. **Never blank both the connector and a content word that
determines which connector is correct** — that is two blanks with one joint
solution, which the one-blank-one-tile model cannot express.

## Cost, stated honestly

A new *Exercise type* is the 3-touch-point recipe in
[`.claude/reference/mode-specs.md`](../reference/mode-specs.md). A new *Element
kind* is far wider — the shipped change touched roughly 30 files including tests,
i.e. an order of magnitude more. The 3-touch-point recipe understates it; that
gap is why the ⚠️ note there exists.

## Open question: where a cross-topic frame lives

**Not decided — do not pick one without asking.** If a frame's whole justification
is that it spans topics, storing it in one theme's file is in tension with that:
the learner meets it only if they play the owning theme, and a second theme must
either re-teach it or go without.

1. **Duplicate per theme.** Simplest, no schema change. But it splits one
   pattern's stats across several Elements, so mastery of the *pattern* is never
   measured — and the duplicate-LU-side check flags it as a defect.
2. **A shared frame file** the planners pull alongside the sub-lesson. One Element
   per pattern, one stat key. Costs a catalog concept (a "lesson" that is not a step
   on any path) plus a decision on how its Elements count toward a pass gate they
   don't belong to. **That last part is the hard bit, not the loading.**
3. **One theme owns them, others reference them.** No new file kind, but introduces
   cross-lesson references, which the format has nothing for today.

Option 2 looks closest to the intent. Worth resolving *before* authoring a frame
library, since the answer decides whether frames are authored per theme or
centrally. It does **not** block anything else: `@fill` inside a single sub-lesson
is well-defined.

## First content shipped — Schueberfouer, Aug 2026

The mechanic is no longer dormant: every sub-lesson of the picture theme carries
`@fill` blocks, so `fill-content-rules.test.ts` runs non-vacuously. What authoring
them actually taught:

- **The two real ambiguity bugs were both invisible to the tests, and both were
  caught by the throwaway builder audit** — printing every surviving tile per
  direction. Neither is mechanizable, which is exactly what the R2/R3 "authoring
  judgement" caveat predicted:
  1. **A semantically valid distractor is a second correct answer.** In
     `Et ass [warscheinlech] Summer, well d'Sonn schéngt`, `sécher`
     ("certainly") was the obvious distractor and is *wrong as one*: it is
     grammatical **and** coherent in a hedge slot. Fix: distractors that cannot
     occupy the slot at all (nouns before a bare noun) plus `net`, which
     contradicts the offered reason.
  2. **Two coordinated predicative adjectives are always interchangeable.**
     `Hir Hoer si [laang] a [brong]` reads fine and breaks R6 — `brong a laang`
     is equally true and grammatical. Fix: blank one side only. Generalising:
     **`X a Y` with both sides blanked is an R6 violation by construction**
     unless the pair has a forced order. Two blanks are only safe in *different
     clauses* or *different word classes*.
- **Comma-before-blank is the load-bearing shape.** Every frame that needed a
  blank near an `-n`-final word got a comma (`Ech mengen, et ass [Summer]`), which
  both satisfies R5 mechanically and is the natural hedge phrasing anyway. The
  two-clause frame is not a workaround; it is the better `@fill`.
- **The n-drop audit must strip brackets before the letter test**, or `[gesinn]
  ech` is never compared. Two flags remained, both the documented `Sonn` stem-final
  false positive.
- **A dead-vocabulary check is worth running:** list `@word` lemmas never appearing
  in any `@lu`/`@en` line of the theme. It found `frou` and `d'Jeans` taught but
  never used (removed), and `mëttes`/`d'Woch`/`villäicht`, which drove the fourth
  fill instead. Loose stem matching means infinitives (`stoen`→`stinn`) are false
  positives — adjudicate by hand.

## Second theme, first topic-track fill — Hobbies, Aug 2026

`hobbies/03_questions.letz` is the first **topic** theme (not picture) to carry
`@fill`, confirming the mechanic isn't picture-specific. It surfaced a third
ambiguity-bug shape, same family as the `sécher` bug above but from a different
source:

- **A high-frequency verb makes its own distractors coherent.** In
  `Wann ech Zäit hunn, maachen ech [Fotoen]`, the first-drafted distractor
  `Sport` is *wrong as one* — `Sport maachen` ("to do sports") is itself a
  real, common Luxembourgish collocation, so the filled sentence reads as a
  second true statement, not a wrong one. `maachen`/`hunn`/`ginn` are exactly
  the verbs this bites hardest, because they collocate promiscuously (`Musek
  maachen`, `Concert maachen` are both real too). Fix: distractors that are
  *objects, not activities* (`Bicher`, `Kamera`) — things the verb cannot
  plausibly govern in this sense at all, not just things the narrator didn't
  mean. **When the frame's fixed verb is a generic do/have/make verb, audit
  every noun distractor for its own idiom with that verb before trusting it.**

## The remaining gap

**`planLessonMode` schedules no fill Slots.** Only Exam and Fix Errors do. So a
**course** lesson carrying `@fill` would be unpassable — its fill Elements could
never reach the gate. Adding `@fill` under `public/assets/lessons/` requires a
Lesson-planner change in the same commit.

Related: [[exam-track]], [[picture-description-theme]] (the frame library),
[[mastery-and-unlock]] (the key family and validator trap). The mechanized bounds
now live in `.claude/skills/letz-content-generator/references/content-contract.md`
— author against that, not the test source.
