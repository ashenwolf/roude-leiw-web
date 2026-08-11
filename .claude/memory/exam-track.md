# Exam track (Sproochentest Prep) — design decisions

Themes mirror the Sproochentest/TWAL oral-exam topics. Expected learner level
~B1, but level is deliberately **not modeled anywhere** — it is an authoring
guideline in file comments only.

**Authoring content? Read the skill, not this file.** The `letz-content-generator`
skill holds the procedure and the contracts; this file holds only the *why* behind
the structure, so a future session doesn't re-litigate it.

## Settled — don't re-open without new information

- **Parallel catalog, not a pseudo-level.** The exam manifest is theme-first, a
  separate schema. Encoding the track as a `level: "Exam"` row in the course
  manifest was explicitly rejected: it would leak into every `loadAllLessons`
  consumer (Word Mix pool, error pool, "Learned X/Y") and lie about ordering.
  Course pipelines never see exam content **by construction**, not by filtering.
- **No tier/level dimension on themes.** TWAL is tiered; we are
  Sproochentest-scoped, so themes are a flat list. If depth tiers are ever wanted:
  an additive `tier` field or separate themes, no migration. Deferred, not
  forgotten.
- **Manifest id is authoritative; the in-file `@lesson` id is a cosmetic label.**
  The lexer's `LessonId` token cannot express `vacation.01`, and relaxing it widens
  a latent LessonId-vs-Text tie-break ambiguity. So exam files use compact ids and
  everything — gate, progress keys, navigation — keys off the manifest id. The exam
  integration test deliberately does *not* assert the two match (the course one
  does), so title/id drift between them is silent.
- **Themes are all open, mutually independent, and independent of course
  progress.** The ~B1 audience may skip the A1 course entirely.
- **Modes own coverage and order; exercise construction is shared.** Chunking and
  the `@question` → en→lu rule live in Layer 1, so course lessons using `@question`
  behave identically and future Exercise types reach every Mode. Deliberately *not*
  unified: Lesson samples from weighted buckets while Exam covers everything once —
  different strategies, same bricks. Merging the planners would mean one function
  with a mode flag, which is what the layering exists to avoid.
- **Fix Errors is GLOBAL; Word Mix and Home stats stay course-scoped** (user
  decision, superseding an earlier exam-scoped plan). `selectErrorPool` is
  scope-agnostic — its `lessons` argument *is* the scope. Fix Errors call sites pass
  course lessons + exam sub-lessons that are played or unlocked (locked ones can't
  carry stats). Words shared between tracks cross-pollinate through the shared stat
  key: accepted and desirable.
- **One theme per picture, not one theme for all pictures.** A second photo becomes
  its own theme with its own directory — not extra sub-lessons under a shared one.
  `kind` (`topic` | `picture`) is a required manifest field and is what selects the
  content contract; it replaced `theme.id === "picture"` checks, which only worked
  while exactly one picture theme existed. A theme that forgets `kind` fails a test
  rather than silently escaping both contracts.
- **Titles are bare in the manifest.** The section prefix comes from
  `themeHeading(kind, title)` at render time, so baking it in would double it.

## Two kinds of theme, two contracts

This is the top-level authoring fork — decide which kind a theme is *before*
writing anything. Full rules and checks: the `letz-content-generator` skill.

| | **Topic** (vacation, family, shopping) | **Picture** (one per photo) |
|---|---|---|
| Exam skill | conversation with the examiner | describing a photo |
| Path | vocab → phrases → Q&A | 3 tasks: general → person → weather |
| `@question` | **required** in the Q&A file | **forbidden** — pure description |
| First person | **wanted**, personalised via interview | **excluded** (no opinion/attitude) |
| `@image-alt` | n/a | **required** |

Both are content decisions only — no schema or planner change.

**Why picture themes exclude attitude:** mixing examiner prompts and preferences
into a description task blurs two different exam skills. A *depicted* person's
visible emotion (`Si lächelt`) is observation and is wanted. Rule of thumb: if a
stranger couldn't check the sentence against the photo, it doesn't belong. Hedged
inference (`villäicht ass et Wanter, well …`) is the one licensed
non-observation — it is a claim about the photo, not about the speaker.

**Why topic Q&A must be interview-sourced:** the answers are the learner's own,
collected conversationally before authoring. The point is rehearsing what they
will actually say in the Sproochentest, so generic answers defeat the exercise.
Record in the file header that the answers are personal, or a later cleanup pass
will "improve" them into neutral content.

## Register split across mechanics

Exam content **may venture into B1**, and the vehicle is complex sentences with
conjunctions. The split is a division of labour, not a compromise:

| Mechanic | Teaches | Register it can carry |
|---|---|---|
| `@sentence` | producing *this* sentence, token by token | main clauses + short two-clause sentences |
| `@fill` | a *reusable pattern*, at any level | anything, incl. verb-final clauses and declined attributives |

The reason is mechanical: SentenceBuilder makes the learner assemble **every**
token, so a verb-final clause is a word-order puzzle with several plausible orders
— expensive to fail under a 100% gate. In a `@fill` that order sits in the fixed
frame the learner *reads*.

> ⚠️ **One-directional.** "B1 leans on `@fill`" does **not** mean "`@fill` is for
> B1" — see [[fill-in-words-exercise]]. `@fill` is not level-scoped at all.

**The declined-attributive restriction is separate and holds at every level**, for
`@sentence`: attributives only on feminine nouns (Luxembourgish leaves those
uninflected); colours predicative for masculine/neuter. That is about tile-level
derivation, not clause complexity, so the B1 relaxation does not touch it.

## Sizing

A sub-lesson much larger than its siblings crawls under the 100% gate — the
failure mode [[lesson-throughput]] names splitting as the lever for. **A
vocabulary-first file runs several times the size of its `02`/`03` siblings**,
which is tolerated because it is front-loaded; the picture theme was split when one
file reached roughly twice the size of any other sub-lesson. Count with
`grep -c '^@word'` rather than trusting a number written here.

The **six-question coverage checklist is not a file axis**: two questions land in
each of three files. Do not grow it to six files — that would re-split vocabulary
that belongs together (objects and activities share scene nouns; "who is there"
and "describe one of them" share person nouns). A further reduction would have to
cut *content*, not redistribute it.

**Which file owns a word follows the task**, not the order it was written in, and
a later file must never re-teach an earlier one's words — the sequential gate makes
it a prerequisite and stat keys are shared app-wide. `npm run check-content` plus
the duplicate-`@word` integration test are what prove that mechanically.

## Open follow-ups

- **`vacation` and `family` vocabulary is not LOD-verified** (the `lod` tools
  returned 403 from a remote CI environment when those were authored). `shopping`
  and the picture theme are verified. Genders, plurals, and Eifeler-Regel forms are
  the risk areas.
- Theme-completion/readiness stat; audio playback on prompts; a self-graded
  speaking-prompt Exercise type; more themes (work, free time, housing, health,
  past/future, Luxembourg).
- **Licensing:** committed photos are a redistribution and this repo deploys
  publicly. Use own or clearly-licensed images.

Related: [[mastery-and-unlock]], [[fill-in-words-exercise]],
[[picture-description-theme]], [[lod-mcp]].
