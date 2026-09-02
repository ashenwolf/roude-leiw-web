# Lesson throughput — why the percentage used to freeze

Three distinct problems that all presented as
"the lesson is stuck at a percentage":

| Symptom | Cause | Fix |
|---|---|---|
| stuck **forever** below the gate | a straggler dropped out of every priority bucket | `not-yet-mastered` bucket keyed on `correct` |
| stuck at **98%** for 3–5 Sessions | sentences capped at one appearance/Session | `SentenceBudget` repeat allowance |
| bar **crawls** ~1–2%/Session | 197-Element lesson, gate is every Element | split oversized lessons (**still open**) |

## 1. The `not-yet-mastered` bucket — reachability

Lesson Mode's word and sentence bucket tables lead with `not-yet-mastered`:
current-lesson Elements below the mastery gate. With pure uniform picks inside a
lesson, a hard Element can sit unmastered indefinitely while the user grinds the
others — blocked by RNG, not by skill.

**The predicate must match the gate.** It originally keyed on
`shown < MIN_ANSWERS`, mirroring the *old* gate. When the gate simplified to a
correct-count, the bucket was left behind and opened a permanent-stuck bug: an
Element shown 10× but correct twice is unmastered, yet had cleared `shown >= 5`,
so it fell out of the bias pool and competed for a uniform draw across the whole
lesson (~0.04 picks/session in a 193-element lesson). Now both use
`correct < MASTERY_CORRECT_COUNT`, so an Element leaves the pool only once it has
actually passed.

**The sentence pool is a synthetic lesson** containing only the unmastered
sentences, not the whole current lesson — otherwise, once most sentences are
mastered, hitting the bucket still lands on an already-mastered one. This keeps
`pickSentence` generic; the rejected alternative (a sentence-level filter
parameter) breaks Layer-1 uniformity.

**Rejected: weighted `1/(1+shown)` picks inside the bucket.** The gate is itself a
binary cliff, so the planner uses the same boundary as the rule it satisfies; a
weighted draw needs a new selection primitive; and the binary version converges in
practice (~5 draws). Promote only if stragglers persist past expectation.

## 2. Adaptive slot-type split — exposure

Distinct from *which* Element the bucket picks: this controls how often
word-match runs at all. A fixed 20/80 split starves word practice in a word-heavy
lesson (100+ unmastered words getting 1/5 of the exposure).

`lessonSlotTypeDistribution` derives the share at plan time from the current
lesson's unmastered counts, clamped by `LESSON.wordMatchShare`. `min` preserves
the historical floor so sentence practice never starves in a word-light lesson;
`max` keeps sentence-builder present in the most word-heavy one. Counts are
current-lesson only — previous-lesson review is incidental, not what the gate
waits on. Fix Errors keeps a **fixed** split: its backlog is by definition all
struggling Elements, so adaptive weighting doesn't apply.

Rejected: deficit-proportional weighting accounting for 5 pairs/word-slot vs
1 Element/sentence-slot. More precise, more logic; escalate only if starvation
persists after content splitting.

**Rejected: lifting the clamp when one side's backlog is exactly zero.** The
clamp looks wrong at the extremes — a tail of 4 phrases and 0 unmastered words
still sends ~3 of 15 Slots to word-match, spending ~15 graded answers on words
already past the gate. Measured cost of removing it: **~0.3 of a Session** with 4
phrases left, and nothing at all with 1–2 left or anywhere mid-lesson (9→10
Slots). That is not a throughput argument.

It is also not the goal. The floor is deliberate **spaced repetition**: mastery
at `correct >= 3` is a pass gate, not a claim the user will still know the word
next week, and `min`/`max` guarantee both exercise types keep appearing so
learned content stays warm. Learning is repetition — a Session that drills only
the last unmastered Element would be optimizing the percentage rather than the
learner. Keep the clamp unconditional; do not special-case a zero backlog.

## 3. `SentenceBudget` — throughput asymmetry

A **word** can be drawn by several word-match Slots in one Session (`pickUniquePairs`
dedupes only *within* one Slot), so a straggler word goes 0 → 4 correct in a single
Session. A **sentence** was capped at one appearance per Session and earns at most
+1 correct per appearance — a hard floor of 3 Sessions before the percentage could
move, usually 4–5 given the bucket is probabilistic.

Compounding it: the card renders `mastered/total`, so `correct = 1/3` and `2/3`
are indistinguishable from `0/3`. The number is **literally frozen** while the
Session is in fact working. That also explains the whole grid's shape — lessons
climb smoothly then stall, because what survives into the tail is
disproportionately sentences.

Simulated over 200 trials on A1.02 as it was then (~147 words + ~45 sentences) —
a one-off experiment, not a figure to keep current:

| tail remaining | nothing after 3 rounds (before → after) | median rounds to 100% |
|---|---|---|
| 4 sentences | **61%** → 7% | 6 → 4 |
| 2 sentences | **48%** → 3% | 3 → 2 |
| 4 words | 0% → 0% | 2 → 2 |
| 2 words + 2 sentences | 0% → 0% | 4 → 3 |

Fix: a not-yet-mastered sentence may be scheduled `MASTERY_CORRECT_COUNT` times
per Session **when fewer than `LESSON.totalSlots` of them remain**; everything
else keeps a cap of 1. Chosen over a flat "always allow 3", which would let a
sentence repeat for no benefit in a fresh 45-sentence lesson and regress the
variety guarantee. The pool-size gate targets exactly the case where variety is
impossible anyway. Already-mastered sentences stay capped at 1 — repeating them
buys no progress.

## 4. Content sizing — the remaining lever

The bar is `mastered / total` Elements, so a big lesson crawls regardless of the
algorithm. This is about **speed**; §1 is about **reachability of the gate**.

A1 `.letz` files stored most nouns three times (indefinite / definite / plural).
The indefinite form is a pure duplicate of the definite — same stem, same gloss —
so **definite + plural are kept, indefinite dropped** (user decision). Matching was
on normalized stem + exact gloss, which protected gendered pairs like
`e Frënd`/`eng Frëndin` that share a gloss but each have their own definite form;
multi-word indefinites with no definite counterpart were kept.

**Still oversized and deferred: A1.02 and A1.07**, each several times the size of
A1.03/A1.09. Every Element needs `MASTERY_CORRECT_COUNT` correct answers with no
slack for a straggler, so A1.02 alone is in the hundreds. **Splitting oversized
lessons into ~40–60-Element lessons is the biggest remaining lever** — the 100%
gate promoted it from "feels slow" to "one unreachable Element blocks the next
lesson". Current sizes: `grep -c '^@word\|^@sentence' public/assets/lessons/A1/A1.1/*.letz`.

## Ruled out during the 98% investigation — do not re-check

- The planner **can** reach every Element; a perfect player converges to 100% on
  all nine A1 lessons.
- **All sentences are solvable** in both directions across both catalogs.
- **No `.letz`-derived stat key trips the sync validator**, and none collide after
  truncation.
- **WordMatch homonym cross-matching self-corrects** — each left tile is removed
  exactly once per Session, so every pair receives exactly one `correct`.
- **Client and server merges are additive and consistent**; KV caps are nowhere
  near being hit.
- **No cross-lesson Element overlap** (0–2%) that could auto-complete a later
  lesson.

## Known gaps, deliberately not fixed

1. **`DebugPanel` lists only `lesson.entries`** — sentences are invisible, so a
   sentence-only tail shows all-green words. Also desktop-only. Both made this
   bug much harder to self-diagnose.
2. **Neither fallback Mode reaches a never-drawn straggler.** Word Mix builds only
   word-match Exercises; the error pool needs `shown >= MIN_ANSWERS` or
   `incorrect > 0`, and tail stragglers typically have neither.

## 5. The gate is a cliff, so the bar had no sub-mastery resolution

Separate from *reaching* an Element (§1) and from *how fast* the tail clears
(§4): the displayed number itself could not move. `mastered / total` counts
Elements at `correct >= MASTERY_CORRECT_COUNT`, so an Element at 1 or 2 correct
reads identically to one never seen. On the exam track this is exact, not
probabilistic: a SubLesson plans every Element once, so two clean Sessions raise
every `correct` to 2 and leave the ring at **precisely 0%**, then the third jumps
it to 100%. The user's own report — "the phrase came up three times and the
percentage didn't move, so it must already be mastered" — is the reasonable
inference from a display with no resolution below the cliff, and it is wrong in
the worst direction: it reads working practice as wasted.

`LessonProgress.credit` is the same stats summed with partial credit
(`Σ min(correct, gate) / (total × gate)`). Bars read it; the numeric label
reads `mastered/total`, which is the number that actually gates unlock. It is
computed in `computeLessonProgress` off the one per-Element stats list the gate
also reads, so the two cannot diverge — and it is monotonic and reaches 1.0
exactly when `isComplete` does, so it cannot promise a completion the gate
withholds.

Rejected: showing "N Elements left" instead. It is honest but still frozen for a
whole Session, and it needs its own copy in every card; the bar already exists
and this makes it tell the truth.

Related: [[mastery-and-unlock]] (the gate this exists to satisfy).
