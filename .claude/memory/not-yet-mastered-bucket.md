# Lesson Mode not-yet-mastered bucket

Added 2026-05-27 as `under-exposed` (keyed off `shown < MIN_ANSWERS`). **Renamed and redefined 2026-07-21 to `not-yet-mastered` (keyed off `correct < MASTERY_CORRECT_COUNT`)** — see "Straggler abandonment fix" below. Lesson Mode's `LESSON.buckets.wordMatch` and `LESSON.buckets.sentenceLesson` (in `src/exercise/constants.ts`) carry this as a third bucket at 30% weight, sitting in front of `current` and `previous`. The bucket draws from current-lesson Elements that have not yet passed the unlock gate.

## Why this exists

With pure uniform random picks inside the current lesson, individual Elements can sit unmastered indefinitely while the user grinds the others — blocking unlock through pure RNG unluck rather than user skill. The bucket pulls those laggards forward without changing the unlock rule itself.

## Straggler abandonment fix (2026-07-21)

Originally the bucket keyed off `shown < MIN_ANSWERS` because the *old* unlock gate was `correct >= 4 AND shown >= 5`. When the gate was simplified to just `correct >= 3` (see [[passed-gate-and-phrase-directions]]), the bucket predicate was left behind and a **permanent-stuck bug** opened up:

- A hard Element shown 10× but only correct twice is **not mastered** (`correct = 2 < 3`), so it drags the lesson percentage down.
- But it had **cleared `shown >= MIN_ANSWERS`**, so it dropped out of the old `under-exposed` pool and competed for a uniform draw across the whole lesson (~0.04 picks/session in a 193-element lesson). Effectively never seen again.
- Result: the lesson could sit below the unlock gate **forever** — the "stuck at a percentage" symptom. (The gate was 80% of Elements then and is 100% since 2026-08-01, see [[exam-and-lesson-pass-gate]] — which makes this bucket the only thing keeping the last stragglers reachable.)

Fix: the bucket now keys off `correct < MASTERY_CORRECT_COUNT` — the *same predicate as the unlock gate* (`isElementMastered`). This covers never-seen elements (correct=0) AND well-shown stragglers (shown=10, correct=2) with one aligned rule, and an Element only leaves the bias pool once it has actually passed. Word predicate: `isWordNotYetMastered` in `modes/lesson.ts`. Sentence predicate: `combinedPhraseStats(...).correct < MASTERY_CORRECT_COUNT` (both directions summed).

## Considered and rejected — weighted `1/(1+shown)`

We considered shaping inside the bucket with an inverse-shown weight so an Element shown 2× is preferred over one shown 4×, smoothing the bias. **Rejected** in favor of the binary cliff at `MIN_ANSWERS`:

1. The unlock gate is itself a binary cliff at `MIN_ANSWERS`. Internal consistency: the planner uses the same boundary as the rule it's trying to satisfy.
2. Weighted draws need a new `weightedPick` primitive in `selection.ts` — material new code surface to maintain.
3. The binary version converges in practice: at 30% weight against a single unmastered Element, the expected number of slots before that Element clears the gate is small (~5 draws of any kind).

If real usage shows stragglers persisting past expectation, promote to weighted then — same constants module, same bucket name, just a different selection primitive. Don't pre-optimize.

## Sentence-level precision (changed 2026-06-03)

The not-yet-mastered sentence pool is a **synthetic lesson containing only the unmastered sentences**, not the full current lesson. Built in `lesson.ts` as (predicate updated 2026-07-21 from `shown < MIN_ANSWERS` to `correct < MASTERY_CORRECT_COUNT`):

```ts
const notYetMasteredSentences = currentLesson.sentences.filter(
  (s) => s.enVariants[0] !== undefined &&
    combinedPhraseStats(userWords, s.enVariants[0]).correct < MASTERY_CORRECT_COUNT,
);
sentencePools["not-yet-mastered"] = notYetMasteredSentences.length > 0
  ? [{ ...currentLesson, sentences: notYetMasteredSentences }]
  : [];
```

**Why changed:** With a large lesson (e.g. A1.01 has 42 sentences), once most sentences are mastered, hitting the 30% bucket would still pick a random sentence from the whole lesson — high chance of landing on an already-mastered one. The bucket weight was right; the selection inside it wasn't. Synthetic lesson trick fixes this without changing `pickSentence` or breaking Layer-1 uniformity.

The previously-rejected alternative of changing `pickSentence` to take a sentence-level filter is still rejected for the same reason (breaks Layer-1 uniformity). The synthetic lesson achieves the same precision while keeping `pickSentence` generic.

## Adaptive word-match/sentence split (added 2026-07-21)

Distinct from *which* element the not-yet-mastered bucket picks: this controls *how often word-match runs at all*. The slot-type roll was a fixed 20% word-match / 80% sentence-builder (now `FIX_ERRORS.buckets.slotType`), which starves word practice in a word-heavy lesson (100+ unmastered words getting 1/5 of the exposure).

Lesson Mode now derives the split at plan time via `lessonSlotTypeDistribution(unmasteredWords, unmasteredSentences)` in `modes/lesson.ts`:

```
share = clamp(unmasteredWords / (unmasteredWords + unmasteredSentences), MIN, MAX)
```

Bounds in `constants.ts`: `LESSON.wordMatchShare.min = 0.2` (the historical floor — sentence practice never starves in a word-light lesson), `LESSON.wordMatchShare.max = 0.6` (sentence-builder stays present even in the most word-heavy lesson; sentences also drill vocab implicitly). No backlog at all → falls back to MIN. Counts are **current-lesson** unmastered elements only (`unmasteredWords.length`, `notYetMasteredSentences.length`); previous-lesson review is incidental, not what the unlock gate waits on.

The helper returns a bucket table in the same shape as the bucket tables, so it drops straight into `bucketedPick`. `FIX_ERRORS.buckets.slotType` is retained as the fixed split for **Fix Errors** mode (its backlog is by definition all struggling elements, so adaptive weighting doesn't apply). One-shot at plan time — mid-session results don't re-derive the split (pipeline invariant).

Considered and rejected: deficit-proportional weighting (account for 5 pairs/word-slot vs 1 element/sentence-slot to equalize sessions-to-unlock). More precise but more logic; start with the linear ratio clamp and escalate only if word starvation persists after content splitting.

## Session-level sentence deduplication (added 2026-06-03, **relaxed 2026-08-03**)

`planLessonMode` passes a shared **`SentenceBudget`** into every `buildSlot` call — `{ uses: Map<identity, count>, notYetMastered: Set<identity>, repeatAllowance }`, built by `makeSentenceBudget`. `claimSentence` records a scheduling if the sentence is under its allowance, otherwise the slot re-rolls (up to 10 retries), then the fallback path allows a repeat rather than dropping the slot.

Allowance per sentence:
- **not-yet-mastered, and fewer than `LESSON.totalSlots` of them left** → `MASTERY_CORRECT_COUNT` (3).
- **everything else** → 1 (the original strict dedup).

Originally the cap was a flat 1 (a plain `Set<string>`), which guaranteed variety across the ~12 sentence slots of a session. That cap turned out to be the **"stuck at 98%" bug** — see [[sentence-endgame-throughput]] for the measurements. A sentence earns at most +1 `correct` per appearance, so a flat cap of 1 put a hard floor of 3 sessions under any lesson whose remaining backlog was sentences, and the lesson percentage was *literally frozen* for all of them. Words never had that floor: `pickUniquePairs` dedupes only *within* one 5-pair slot, so a straggler word can be drawn by several slots in one session and clear the gate immediately.

The variety guarantee is unchanged above the threshold: with ≥ `LESSON.totalSlots` unmastered sentences there is ample distinct material, several sentences cross the gate each session so the percentage moves on its own, and strict dedup still applies. Already-mastered sentences are always capped at 1 — repeating them buys no progress. The cliff at `LESSON.totalSlots` is deliberate and harmless: the frozen-number problem only exists in the tail.

Word-match slots use `pickUniquePairs` — picks `count*4` candidates via with-replacement draws then deduplicates by `wordKey`, so the same pair can't appear twice in one 5-card slot.

## Touch points if rules change

- `src/exercise/constants.ts` — bucket definitions + doc comments.
- `src/exercise/modes/lesson.ts` — builds the `not-yet-mastered` sub-pool from `userWords`. Word predicate `isWordNotYetMastered` uses `wordKey`; sentence predicate uses `combinedPhraseStats`. Both compare `correct` against `MASTERY_CORRECT_COUNT` to align with the unlock gate. Also holds `makeSentenceBudget` / `claimSentence` (per-session sentence repeat allowance).
- `src/exercise/use-exercise-session.ts` — passes `userWords` into `planLessonMode` (both initial load and `resetSession`).
- `tests/src/exercise/modes/lesson.test.ts` — "not-yet-mastered bucket" + "adaptive slot-type split" describe blocks.
- `src/exercise/modes/lesson.ts` — `lessonSlotTypeDistribution` (adaptive split) + `LESSON.wordMatchShare` in `constants.ts`.

`combinedPhraseStats` sums both presentation directions, so the sentence predicate correctly treats a phrase as one Element regardless of which direction the user practised.

Related: [[stats-and-xp-redesign]] documents the unlock gate this bucket exists to satisfy.
