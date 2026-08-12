# Mode specs — binding reference

Read this before touching any `src/exercise/modes/*.ts` planner, `session-reducer.ts`, or the error-pool/unlock functions they call. CLAUDE.md's Architecture Reference states the encapsulation layering and links here for the per-Mode detail; **this file wins on Mode-specific behavior.**

## Encapsulation layering

```
Layer 4: Mode planners              planLessonMode, planWordMixMode, planFixErrorsMode
                                     ↓ produce
Layer 3: SessionMachine              one reducer (Block/Slot transitions, popups)
                                     ↓ consumes
Layer 2: Exercises (plug-in)         WordMatchExercise, SentenceBuilderExercise, …
                                     ↓ built from
Layer 1: Selection primitives        bucketedPick(roll, buckets), pickPair, pickSentence,
                                     buildWordMatchExercise, buildSentenceExercise,
                                     chunkIntoWordMatchExercises, resolveSentenceDirection
                                     ↓ reading from
Layer 0: Pure derivations            selectErrorPool, classifyElement, computeCursor,
                                     unlockedSet, MIN_ANSWERS, thresholds
```

**Each layer imports only from layers below it.** The only place that knows which buckets feed which Exercise type is Layer 4 (the Mode planners). The SessionMachine (Layer 3) is Mode-agnostic — it walks a queue of pre-built Exercises and emits popup events at Block boundaries.

## Pipeline alignment invariants

Four rules that must hold across this architecture (in addition to the Data Pipeline rules in `.claude/reference/data-flow.md`):

1. **One-shot planning.** Mode planners run once at Session start, read a stats snapshot, and emit a complete `ModeConfig` with every Slot's Exercise pre-built. Mid-Session events update global Stats (sink) but do **not** re-enter the planner. Planners are stateless producers; the SessionMachine is a stupid consumer.
2. **No callbacks across layer boundaries.** `ModeConfig.completionEffect` is a plain enum tag (`'unlock-check' | 'noop'`), not a function. The wiring hook (`use-exercise-session`) reads the tag and invokes the relevant pure derivation plus the relevant edge action (navigation, refresh). No layer hands a closure to a layer above it.
3. **Named typed data is the only stage contract.** Anything crossing a layer boundary must be a plain typed value with an exported type. No shared mutable state, no implicit ordering.
4. **Progress tick granularity is owned by Exercise, not Mode.** WordMatch emits a tick per Step (per pair); SentenceBuilder emits a tick per Slot (per submit); future Exercises declare their own. Total progress bar size for a Session = sum of each Slot's `exerciseTickCount`. Block boundaries on the bar are placed at the cumulative tick count where each Block ends.

## Mode specs

All three Modes share the same SessionMachine; they differ only in what `ModeConfig` they emit.

**Lesson** — `planLessonMode(lessons, stats, upperBoundId)`.
- Shape: `BLOCK_COUNT` Blocks × `LESSON.slotsPerBlock` Slots + optional correction Block.
- Slot type roll: **adaptive**, not fixed — `lessonSlotTypeDistribution` scales the word-match share with how word-heavy the current lesson's remaining backlog is, clamped by `LESSON.wordMatchShare`. See [lesson-throughput](../memory/lesson-throughput.md) for why.
- Upper bound is a single lesson id, compared **lexicographically**; pool = all lessons where `lesson.id <= upperBoundId`. "Start Learning" sets it to the **cursor** — the first unlocked lesson that has not passed, *not* the frontier; picking a specific lesson sets it to that lesson (clamps the pool — picking A1.03 when A1.05 is unlocked draws only from A1.01–A1.03). The clamp is load-bearing: the straggler apparatus (not-yet-mastered bucket + adaptive slot-type split) is scoped to the pool's last lesson, so a frontier-based bound left every earlier unfinished lesson reachable only via the thin `previous` bucket.
- WordMatch Slot: `LESSON.wordMatchPairs` pairs, each drawn by an independent roll over the **three** `LESSON.buckets.wordMatch` buckets — `not-yet-mastered` (current-lesson Elements below the gate) first, then `current`, then `previous`. Re-roll on empty bucket.
- SentenceBuilder Slot: same three-bucket shape via `LESSON.buckets.sentenceLesson`; random phrase within the picked lesson; direction from `LESSON.buckets.direction`.
- **Bucket weights live in `constants.ts` — read them there.** They are tuned per-Mode and change; restating them here has drifted before.
- Outcomes: WordMatch always success (failed pairs → stats only). SentenceBuilder fail → enqueue Slot into correction Block.
- Correction Block: retry queued Slots; retry-fail re-enqueues at back; drain to empty.
- Popups: block-success (after Blocks 1 & 2), session-success (after Block 3 if queue empty, or after correction drain). Every Session ends in success after drain.
- `completionEffect: 'unlock-check'` — wiring hook runs `unlockedSet` after Stats sync.
- **Does not schedule fill-blank Slots.** A lesson's `@fill` Elements therefore never pass the unlock gate from Lesson Mode alone — which is why no course `.letz` carries `@fill` today. Adding one means adding a fill bucket to this planner in the same change, or the lesson becomes unpassable.

**Word Mix** — `planWordMixMode(lessons, stats, persistedUnlocked)`.
- Shape: 3 Blocks × 1 Slot per Block. Each Slot = a WordMatch Exercise of `WORD_MIX.pairsPerSlot` pairs (one Step per pair). No correction Block.
- Pool: all words from lessons up to and including the **frontier** (review must keep covering passed lessons). The `current` bucket, however, is the **cursor** — so the bias lands on the lesson the user is stuck on, while `previous` means "everything else in the pool" (which can include lessons *after* the cursor).
- Per-pair bucket roll, applied independently for **every** pair at plan time over `WORD_MIX.buckets.pairSource`: error pool / current-lesson / previous-lessons. Re-roll on empty. Weights are in `constants.ts`.
- One-shot plan; mid-Session results do not re-bucket later pairs.
- Popups: only on Slot/Block complete (3 total — Slot boundary = Block boundary).
- `completionEffect: 'noop'`.
- Progress bar: one tick per pair across the whole Session, with a milestone at each Slot boundary.
- Words only — Word Mix is pair matching by definition, so it schedules no sentence-builder or fill-blank Slots.

**Fix Errors** — `planFixErrorsMode(lessons, stats, persistedUnlocked)`.
- **Global scope**: `lessons` = all course lessons + exam SubLessons in error scope (played or unlocked — see `loadErrorScopeLessons` in `src/exercise/error-scope.ts`). The planner itself is track-agnostic; the call sites decide the scope. A failed exam Q&A phrase is rebuilt with its `question` in the failed direction.
- Home button disabled when error pool is empty (same global scope via `loadExamErrorLessons`).
- Same Session shape as Lesson (`LESSON.totalSlots` + optional correction). **Its own three-way slot-type roll** (`FIX_ERRORS.buckets.slotType`) — word-match / sentence-builder / fill-blank, **fixed**, not adaptive like Lesson's, because its backlog is by definition all struggling Elements. Fill's share is carved out of sentence-builder's, not word-match's.
- The one Mode that draws from all three error pools — it is where a failed `@fill` gets retried, since neither Lesson nor Word Mix schedules one.
- WordMatch Slot: `LESSON.wordMatchPairs` pairs drawn independently **with replacement** from the word-error pool (duplicates allowed).
- SentenceBuilder Slot: 1 `PhraseError` from sentence-error pool — presented in the **same direction the user failed** (the pool entry carries its direction; no direction roll here).
- FillBlank Slot: 1 `FillError` from the fill-error pool, same failed-direction rule.
- Empty pool for rolled type → re-roll a bounded number of times, then a fixed-order fallback (word → sentence → fill) so a Session still fills when only one pool has content. **A builder must check its pool before consuming any rng** — otherwise a re-roll shifts every later draw and `fakeRng` tests stop describing real Sessions.
- Outcomes & correction Block: identical to Lesson.
- `completionEffect: 'noop'`.

**Exam** — `planExamMode(subLesson)`.
- Input: ONE SubLesson's `Lesson` (loaded via `src/exam/exam-catalog.ts`, never `loadAllLessons`). No stats input — the plan is content-deterministic ("we only shuffle it").
- Shape: every Element exactly once. Words: shuffled, then `chunkIntoWordMatchExercises` (shared Layer 1) with `EXAM.wordMatch` sizing — `pairCount` pairs per Slot, and a trailing chunk below `minChunk` merges into the previous Slot rather than forming a degenerate one. Sentences: one SentenceBuilder Slot each. Fills: one FillBlank Slot each. Combined Slot list shuffled.
- Direction: rolled with the Lesson direction table, then normalized by `resolveSentenceDirection` — a Sentence carrying `question` is **always** en→lu. That rule is Layer 1, not Mode-specific, so course lessons using `@question` behave identically. Fills roll from the same table with nothing to override it (a `@fill` never carries `@question`).
- Elements missing a line on either side (`@lu` or `@en` empty) are skipped rather than planned as a broken Slot — applies to both sentences and fills.
- Block boundaries: `BLOCK_COUNT` near-equal cuts over the queue (deduped for tiny queues). Correction Block: yes (same re-queue mechanic as Lesson).
- Outcomes: same as Lesson. `completionEffect: 'noop'`.
- Pass-gate: `computeExamView` (`src/exam/exam-progression.ts`) unlocks the next SubLesson in a Theme once the previous one is **passed** — `computeLessonProgress(...).isComplete`, i.e. every Element at `correct >= MASTERY_CORRECT_COUNT`. Same gate and same constant as the course track. `passed` implies `unlocked`, so the chain advances exactly one step at a time.
- Played-marker (edge, in `AppExercise.flushProgress`): a **completed** exam Session pushes its SubLesson's manifest id through `newlyUnlockedLessons`; abandoning marks nothing. That id no longer opens the next step — it keeps the SubLesson unlocked (sticky access) and puts it in the content-load / error-pool scope.

## Unlock rule (both tracks)

One rule gates progression on the course track (lesson → next lesson) and on the exam track (SubLesson → next SubLesson in its Theme). For each Element defined in the lesson's `.letz` file:
- Element passes iff `correct >= MASTERY_CORRECT_COUNT`. There is **no** accuracy ratio and **no** minimum-shown gate — enough correct answers passes the Element regardless of how many times it was missed (`isElementMastered` in `progression.ts`).
- For a **Sentence**, the two presentation directions are summed first: a phrase passes iff `enLu.correct + luEn.correct` clears the same constant (`combinedElementStats`). Both directions count toward the one phrase Element.

The lesson unlocks the next lesson iff `passingElements / totalElements >= UNLOCK_LESSON_THRESHOLD` — currently **1.0**, i.e. every Element must pass (see [mastery-and-unlock](../memory/mastery-and-unlock.md)). Read the value from `constants.ts`; the fact that it *is* 1.0 is load-bearing for content sizing, so it is stated once here and nowhere else.

Unlock is **sticky**: `correct` is monotonic, so once a lesson passes the threshold it stays unlocked without storing an `unlockedLessons` set. Don't introduce one; deriving from stats stays correct as long as stats are append-only.

> `MIN_ANSWERS` still gates the **live** `classifyWord` label and the error pool — not the pass gate. The two systems are intentionally separate (see [mastery-and-unlock](../memory/mastery-and-unlock.md)).

## Centralized error pool

`selectErrorPool(stats, lessons)` returns `{ words, phrases, fills }`. **Single source of truth** for "struggling content" across the app — Fix Errors planner consumes all three pools; Word Mix planner consumes `words` for its `[0, 0.25]` bucket; future features that need "things the user is bad at" consume the same function.

The function is scope-agnostic: the `lessons` argument defines the scope. Fix Errors passes the **global** scope (course + exam, via `src/exercise/error-scope.ts`); Word Mix passes course-lessons-up-to-frontier only.

`phrases` is `PhraseError[]` and `fills` is `FillError[]` — each entry is `{ sentence | fill, direction }` keyed by its **directional** stat key, so an element failed in `en-lu` and the same element failed in `lu-en` are distinct error entries. Fix Errors rebuilds the exact failed direction. (Mastery sums the directions; the error pool keeps them apart — this is deliberate.)

- Primary: elements with `shown >= MIN_ANSWERS` AND `correct / (correct + incorrect) < ERROR_THRESHOLD`.
- Fallback (when primary is empty): all elements with `incorrect > 0`, worst accuracy first.

The accuracy formula is the same one `classifyWord` uses — **not** `correct/shown`. Read the value of `ERROR_THRESHOLD` from `constants.ts`; don't restate it here.
- The three kinds are **independent**: each computes its own primary/fallback, so a struggling fill surfaces even when the word pool's primary criteria are already satisfied. A phrase and a fill sharing the same English text are distinct Elements — the key prefix separates them.

Do not re-implement this rule inline; if you need a different definition, add a separate named function in the same module — don't fork.

## Post-Session refresh invariant

**The auth and guest progress paths must produce byte-identical local state and must both refresh Home without a page reload after a Session completes.**

- **Guest path:** `useGuestProgress` writes to localStorage; `AppExercise.goHome()` calls `refreshGuestProgress()` to notify subscribers; Home re-reads and re-renders.
- **Auth path:** `useProgress.syncBatch` applies the same client-side `mergeWordStats`/`mergeDailySession` (`src/lib/stats-merge.ts`) to `AuthContext` state optimistically before POSTing to `/api/progress/sync`. `computeStreak` (shared between worker and client in `src/lib/streak.ts`) is re-run on the locally-merged daily activity. The POST stays fire-and-forget; the local merge is the byte-identical mirror of the server merge that runs in `worker/lib/user.ts`.

If you change the merge logic on one side (worker or client), change it on the other side in the same commit. The byte-identity test in `tests/src/context/auth-stats-delta.test.ts` is the guarantee.

## Adding a new Exercise type

Three touch points, nothing else:
1. **Type:** extend the `Exercise` union in `src/exercise/types.ts` with the new variant (`{ type: 'fill-blank', … }`).
2. **Logic + UI:** add `src/exercise/<NewType>/` containing the pure logic module and the React component, parameterized by the variant's data shape. Declare the Exercise's progress tick rate (per-Step or per-Slot) at the same time.
3. **Router:** add a `currentExercise?.type === 'fill-blank' && <FillBlank … />` branch in `src/page/AppExercise.tsx`.

The SessionMachine and Mode planners are untouched. If a Mode wants to schedule the new Exercise type in its Slots, the matching Mode planner adds a builder call (the only place that knows which Exercises feed which Modes).

> ⚠️ **This recipe covers a new *mechanic* over existing content.** A new Exercise type that also introduces a new **Element kind** (a new `.letz` block with its own stat key) is a much wider change — it ripples past the three touch points into the parser (`lexer.ts`/`parser.ts`/`visitor.ts`), `progression.ts` (key family, mastery, `computeOverallStats`), `error-pool.ts`, `lesson-rows.ts`, the Mode planners, `worker/lib/validators.ts`, and every matching test. `@fill` (Aug 2026) was the first such addition. See [mastery-and-unlock](../memory/mastery-and-unlock.md) § key family for the two traps it paid down (`isWordKey` vs `!isPhraseKey`, validator-first) and [fill-in-words-exercise](../memory/fill-in-words-exercise.md) for the full record.
