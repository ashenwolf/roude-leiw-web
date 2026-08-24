---
name: exam-theme-discussion
description: >
  Generate a Sproochentest topic theme for the Roude Léiw exam track: interviews
  the learner for their real personal answers, then authors three .letz sub-lesson
  files (Vocabulary / Key Phrases / Talking About It) plus a manifest entry. Use
  when the user wants to add a new exam topic theme (work, hobbies, health, daily
  routine, and similar Sproochentest/TWAL conversation topics), practice answering
  examiner questions about a topic, or provides a list of exam questions to turn
  into exercises. This track is PERSONALIZED — answers come from interviewing the
  user, never invented — distinct from the pure-description picture-theme flow
  (see exam-picture-description) and from PDF→course-lesson conversion (see
  letz-content-generator).
---

# Exam Theme Discussion

## What this skill produces

One topic theme for the exam track (`public/assets/exam/topic/<theme-id>/`):

- `01_vocabulary.letz` — word-match vocabulary for the topic
- `02_phrases.letz` — plain key-phrase sentences (no `@question`)
- `03_questions.letz` — examiner `@question` blocks whose answers are the
  learner's **own, real** answers, plus reusable `@fill` frames drilling the same
  connectors
- one `kind: "topic"` entry in `public/assets/exam/manifest.json`

This is the exam track's **topic** contract: personalized, ~A2 drifting into B1,
`@question` required in `03`. If the task is instead a **picture** theme (pure
description, no first person), use `exam-picture-description`. If the task is
PDF→course-lesson conversion, use `letz-content-generator`.

## Shared references — read the one you need, don't duplicate

| File | Read it for |
|---|---|
| `.claude/skills/letz-content-generator/references/letz-format.md` | `.letz` syntax, `@question`/`@fill` directive spec |
| `.claude/skills/letz-content-generator/references/content-contract.md` | mechanized bounds — §1 (floors, duplicate-`@word` scoping), §2–5 (`@fill` rules R1–R7), §9 (track scoping) |
| `.claude/skills/letz-content-generator/references/luxembourgish-grammar.md` §§2–5 | the verified connector inventory, both inversion patterns (subordinating conjunctions send the verb to the end; connecting words are order-neutral), the two wrong forms class handouts circulate, homograph traps, and `ze`/`fir … ze` purpose clauses (§5) — the natural shape of "why/what do you plan" answers |
| `.claude/skills/letz-content-generator/references/content-checks.md` | the pre-commit verification checklist |
| `.claude/memory/exam-track.md` | why topic themes require the interview, the register split, sizing rationale |
| `.claude/memory/fill-in-words-exercise.md` | `@fill` mechanics beyond the picture-theme frame library |

Also available: `mcp__lod__lod_lookup` / `lod_suggest` — verify every new
Luxembourgish word and every inflected form inside a sentence.

## Step by step

### 1. Scope the theme

- Confirm the topic with the user if not already given (work, hobbies, health,
  daily routine, housing, and similar Sproochentest/TWAL conversation subjects).
- If the user supplies a list of examiner questions for this topic, use exactly
  those. If not, propose a standard set of questions typical for the topic (model
  them on the existing themes' `03_questions.letz` files — `wou`, `wéini`,
  `wéi laang`, `mat wiem`, `firwat`, `wat gär`, `wat maacht Dir` shapes) and
  confirm the list with the user before interviewing on it.
- Check `public/assets/exam/manifest.json` for existing theme ids to avoid a
  collision, and pick an unused `@lesson` id prefix
  (`grep -h '^@lesson' public/assets/exam/topic/*/*.letz`).

### 2. Interview the learner — REQUIRED, before writing any `@question` content

**Never invent an answer.** For each examiner question, get the user's real
answer:

- Use `AskUserQuestion` when the answer has a natural closed set (yes/no, a
  specific choice among a handful of likely options).
- Ask conversationally in plain text for open-ended answers (a job title, a
  hobby, a reason).
- If the user already gave an answer earlier in this conversation, reuse it —
  don't re-ask.
- Record in the file's header comment that the answers are personal — e.g.
  `# These are <name>'s real answers, gathered by interview — do not
  "improve" or genericize them in a later editing pass.` A later session without
  this note may quietly neutralize the content back into generic answers,
  defeating the point (the learner rehearses what they'll actually say).

Only after the interview is complete, move to authoring.

### 3. Author `01_vocabulary.letz`

- ≥10 `@word` entries covering the topic's core nouns/verbs/adjectives, grouped
  loosely by sub-topic (no header comments between groups, matching the existing
  files' style).
- ≥3 `@sentence` blocks (no `@question`) built from the vocabulary, so the
  session alternates word-match and sentence-builder slots.
- LOD-verify every LU word and confirm gender → article before finalizing.
- Split singular/plural into separate entries; drop gender annotations, keep the
  article.

### 4. Author `02_phrases.letz`

- Plain `@sentence` blocks — no `@question` — presented in either direction.
- **Personal, grounded in the same interview facts as `03` — never an abstract
  claim about the world.** `02` is not exempt from personalization just because
  it lacks `@question`: "Painting is a creative activity." and "Concerts are
  always exciting." are exactly the kind of generic filler to never write. `02`
  differs from `03` in *depth*, not in *whose facts it uses* — shorter, simpler
  restatements of the learner's real answers ("My father had a camera, and I
  also like taking photos."), not truisms. If the interview covered more ground
  than fits in `03`'s Q&A, `02` is where the overflow facts belong.
- Use the connector inventory from `luxembourgish-grammar.md` §§2–3 for
  two-clause sentences: coordinating (`mee`/`awer`, `an`, `oder`) stays
  order-neutral, subordinating (`well`, `wann`, `obwuel`, `ob`, …) sends the
  verb to the end — don't mix the two categories up, that confusion *is* the
  B1-level error.
- Introduce any new vocabulary the phrases need as `@word` entries in this same
  file; ≥10 words / ≥3 sentences floor still applies here too.
- Single-word distractors only for every `@sentence` — a multi-word distractor
  gets tokenized into that many loose tiles by the real builder (see
  `content-checks.md`).

### 5. Author `03_questions.letz` — the personalized core

For **every** examiner question from step 2:

```
@sentence
@question <examiner's LU question>
@lu <the learner's real answer, in Luxembourgish>
@en <English translation>
@distractor-lu <wrong word, single-word>
@distractor-lu <wrong word, single-word>
@distractor-en <wrong word, single-word>
@distractor-en <wrong word, single-word>
```

- The `@lu` answer must be the **translated, LOD-verified** form of what the
  learner actually told you — not a generic model answer.
- `@question` forces en→lu presentation (the learner assembles the LU answer) —
  this is required on every sentence in this file (mechanized: M checks the
  filename for `03_questions`).
- Distractors: same correctness rule as everywhere — never a valid substitute
  for a real word in the answer; prefer same-theme vocabulary that's
  semantically close but wrong.
- **`Firwat …?` / `Wat plangt Dir …?`-style questions are where `ze` and
  `fir … ze` (grammar §5) actually belong** — reasons and plans are naturally
  phrased `Ech probéieren … ze …` or `… fir … ze …`, not just a bare `well`
  clause. Use the learner's real reason/plan and put it in that shape when it
  fits; don't force it onto answers that read more naturally as a plain clause.
  Remember the 5 modal verbs (`wëllen`, `mussen`, `däerfen`, `sollen`, `kënnen`)
  never take `ze`.

Then add **reusable `@fill` frames, without `@question`**, drilling the same
connector patterns the phrases and answers use — this is the "answers as
sentence and fill" split: `@sentence`+`@question` teaches *this learner's
specific answer*, `@fill` teaches the *pattern* that transfers to any topic
(the same reuse criterion as the picture-theme frame library — "does this frame
recur across topics?"). **Write at least 10 `@fill` blocks, not a token 3** — a
short well-causal/wann-conditional/comparative set exercises the mechanic too
thinly to justify a dedicated Slot type. Vary the connector and blank-word-class
across all 10 so they don't collapse into restatements of each other: causal
(`well`), conditional (`wann`), contrast (`obwuel`), comparative (`léiwer wéi`),
purpose (`fir … ze`), a fronted-adverb inversion (`dofir`, `dann`), a duration or
number blank, a frequency-adverb blank, a hedge (`Ech mengen, …`). Ground each
frame's *fixed text* in the theme's real facts too (not a bare grammar
template) — reuse-scoped does not mean context-free.
`@fill` is legal at any level (it is **not** B1-scoped, just reuse-scoped) —
apply R1–R7 from `content-contract.md` §2–5 exactly as in a picture theme:
determiners/prepositions stay in the fixed frame (R4), no blank directly after
an `-n`-final word mid-clause (R5) — including immediately after `hunn`/`sinn`/
`ginn` with no comma, a common trap when fronting the blank as an adverb — two
blanks need different word classes or a forced order (R6), every distractor
wrong in every blank (R3, yours to verify — watch for a common do/have/make verb
in the fixed frame making an otherwise-safe noun distractor into a real
collocation, e.g. `Sport` is a bad distractor next to `maachen`). A `@fill` must
never repeat a sentence a `@sentence` in this file already teaches. Run the
distractor-survival dump (step 7.5) over every fill before calling this step
done, not just the `@sentence` blocks.

### 6. Update the manifest

Add to `public/assets/exam/manifest.json`:

```json
{
  "id": "<theme-id>",
  "kind": "topic",
  "title": "<Theme Title>",
  "subLessons": [
    { "id": "<theme-id>.01", "file": "topic/<theme-id>/01_vocabulary.letz", "title": "Vocabulary" },
    { "id": "<theme-id>.02", "file": "topic/<theme-id>/02_phrases.letz", "title": "Key Phrases" },
    { "id": "<theme-id>.03", "file": "topic/<theme-id>/03_questions.letz", "title": "Talking About It" }
  ]
}
```

### 7. Verify — run `content-checks.md`'s full checklist, in order

1. LOD every `@word` LU side and every inflected form inside a `@lu` sentence
   (batched `mcp__lod__lod_lookup`).
2. **Duplicate check is theme-scoped, not file-scoped**: no two `@word` entries
   across all three of this theme's files share an LU side or an EN gloss
   (`npx vitest run` catches it, but check by eye while drafting — LU synonyms
   the dictionary glosses identically, e.g. `d'Geld`/`de Su` → "the money", need
   distinct EN glosses).
3. `npx vitest run tests/integration` — floors (≥10 words/≥3 sentences per
   file), `@question` required on every `03_questions` sentence, `@fill`
   bracket/blank/distractor rules, stat-key collisions.
4. `npm run check-content` — Eifeler-Regel n-drop audit (advisory).
5. The distractor-survival harness through the real builder (recipe in
   `content-checks.md`) — catches tokenization and collision bugs no other
   check sees.
6. `npm run build` before calling it done.

Cross-theme vocabulary overlap (e.g. two topics both teaching `d'Wieder`) is
fine — the duplicate check and the pass-gate are both scoped to one theme; topic
themes are independent of each other and of the picture themes.
