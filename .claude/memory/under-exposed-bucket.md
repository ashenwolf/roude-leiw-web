# Lesson Mode under-exposed bucket

Added 2026-05-27. Lesson Mode's `LESSON_WORD_MATCH_BUCKETS` and `LESSON_SENTENCE_LESSON_BUCKETS` (in `src/exercise/constants.ts`) gained a third bucket `under-exposed` at 30% weight, sitting in front of `current` and `previous`. The bucket draws from current-lesson Elements with `shown < MIN_ANSWERS`.

## Why this exists

The unlock gate requires every Element to clear `shown >= MIN_ANSWERS` (5) before its accuracy is even counted. With pure uniform random picks inside the current lesson, individual Elements can sit at `shown = 0–4` indefinitely while the user grinds the others — blocking unlock through pure RNG unluck rather than user skill. The under-exposed bucket pulls those laggards forward without changing the unlock rule itself.

## Considered and rejected — weighted `1/(1+shown)`

We considered shaping inside the bucket with an inverse-shown weight so an Element shown 2× is preferred over one shown 4×, smoothing the bias. **Rejected** in favor of the binary cliff at `MIN_ANSWERS`:

1. The unlock gate is itself a binary cliff at `MIN_ANSWERS`. Internal consistency: the planner uses the same boundary as the rule it's trying to satisfy.
2. Weighted draws need a new `weightedPick` primitive in `selection.ts` — material new code surface to maintain.
3. The binary version converges in practice: at 30% weight against a single under-exposed Element, the expected number of slots before that Element clears the gate is small (~5 draws of any kind).

If real usage shows stragglers persisting past expectation, promote to weighted then — same constants module, same bucket name, just a different selection primitive. Don't pre-optimize.

## Sentence-level precision (changed 2026-06-03)

The `under-exposed` sentence pool is now a **synthetic lesson containing only the under-exposed sentences**, not the full current lesson. Built in `lesson.ts` as:

```ts
const underExposedSentences = currentLesson.sentences.filter(
  (s) => (userWords[phraseKey("en-lu", s.enVariants[0])]?.shown ?? 0) < MIN_ANSWERS,
);
sentencePools["under-exposed"] = underExposedSentences.length > 0
  ? [{ ...currentLesson, sentences: underExposedSentences }]
  : [];
```

**Why changed:** With a large lesson (e.g. A1.01 has 42 sentences), once most sentences have cleared `MIN_ANSWERS`, hitting the 30% under-exposed bucket would still pick a random sentence from the whole lesson — 70%+ chance of landing on an already-shown one. The bucket weight was right; the selection inside it wasn't. Synthetic lesson trick fixes this without changing `pickSentence` or breaking Layer-1 uniformity.

The previously-rejected alternative of changing `pickSentence` to take a sentence-level filter is still rejected for the same reason (breaks Layer-1 uniformity). The synthetic lesson achieves the same precision while keeping `pickSentence` generic.

## Session-level sentence deduplication (added 2026-06-03)

`planLessonMode` now passes a shared `usedSentenceKeys: Set<string>` into every `buildSlot` call. When a sentence slot is built, its `phrase:en-lu:…` key is added to the set; future slots skip already-used keys (up to 10 retries), then fall back to allowing repeats only when the pool is exhausted. Guarantees variety across the ~12 sentence slots in a typical 15-slot session as long as the lesson has ≥ 12 unique sentences (A1.01 has 42).

Word-match slots use `pickUniquePairs` — picks `count*4` candidates via with-replacement draws then deduplicates by `wordKey`, so the same pair can't appear twice in one 5-card slot.

## Touch points if rules change

- `src/exercise/constants.ts` — bucket definitions + doc comments.
- `src/exercise/modes/lesson.ts` — builds the `under-exposed` sub-pool from `userWords`. Requires `wordKey` and `phraseKey("en-lu", …)` to align with the unlock gate.
- `src/exercise/use-exercise-session.ts` — passes `userWords` into `planLessonMode` (both initial load and `resetSession`).
- `tests/src/exercise/modes/lesson.test.ts` — "under-exposed bucket" describe block.

Phrase stats are always keyed by `en-lu` direction regardless of presentation direction — see `buildSentenceExercise` in `src/exercise/exercise-builders.ts`. If that ever splits per-direction, the under-exposed-sentence check here breaks.

Related: [[stats-and-xp-redesign]] documents the unlock gate this bucket exists to satisfy.
