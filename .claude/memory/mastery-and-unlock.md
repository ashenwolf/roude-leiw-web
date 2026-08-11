# Mastery, unlock, and stat keys

Why progression works the way it does.

Current values live in `src/exercise/constants.ts` — read them there, not here.

## Two classification systems, on purpose

| | `classifyWord` (live) | `isElementMastered` (monotonic) |
|---|---|---|
| Formula | `shown >= MIN_ANSWERS` AND accuracy `>= ERROR_THRESHOLD` | `correct >= MASTERY_CORRECT_COUNT` |
| Accuracy is | `correct / (correct + incorrect)` | not used |
| Monotonic? | no — fluctuates | yes — only false → true |
| Drives | error pool, UI mastery labels | lesson progress, unlock, XP, "Learned X/Y" |

A word can be `isElementMastered` **and** `struggling` at once: progress must not
regress, but the user should still drill it. Don't collapse the two.

The pass gate was once `correct >= 4 AND shown >= 5`. It is now **just a correct
count** — no ratio, no minimum-shown. That simplification is what makes progress
monotonic, since `correct` only grows.

## Derive, don't store

Storing a `masteredKeys` set was considered and rejected: `correct >= N` is
already irreversible, so the set would be redundant state to keep in sync.

The one exception is `unlockedLessons`, which **is** persisted — see below.

## Sticky unlock

Unlock was originally derived from live accuracy, which is not monotonic, so a
lesson could re-lock after a bad session. Now `computeUnlockedLessonIds` takes a
persisted set as a third argument, stored in `UserData` (KV) and `GuestData`
(localStorage). The server unions on every sync; the client applies optimistically.

At a 1.0 threshold the derived set would be sticky anyway, but the persisted set
is what protects users who unlocked lessons under the older 0.8 gate. Don't
remove it.

## Cursor vs frontier — two functions, deliberately

| | Means | Used as |
|---|---|---|
| `findFrontierLessonId` | max unlocked id | the bound of a **pool** (Word Mix reviews everything unlocked) |
| `findCurrentLessonId` | first unlocked lesson **not passed** | the **focus** (Lesson Mode's `upperBoundId`, Word Mix's `current` bucket) |

The frontier was once used for both, and that was a real bug: Lesson Mode scopes
its whole straggler apparatus to `pool[pool.length - 1]`, so with a frontier
cursor every earlier unfinished lesson was reachable only through the thin
`previous` bucket — ~0.01 draws per element per Session. Simulated on a 9-lesson
sticky-unlocked state: **1/9 lessons complete after 60 Sessions** vs **9/9** with
the first-incomplete cursor.

Two edge cases the implementation must keep: element-less lessons are skipped
(`progress.total > 0`), or one captures the cursor permanently; unlocked ids with
no loaded `Lesson` are skipped rather than treated as unfinished.

`planWordMixMode` / `planFixErrorsMode` take `persistedUnlocked` for this reason
— without it a planner cannot see sticky unlock, which is exactly the state the
bug needed.

## Phrases and fills: per-direction keys, one Element

The request was "both directions count as one phrase" *and* "drilling an error
must repeat the exact direction failed". Those cannot both be literal single-key
storage, so:

- **Storage is per direction** — `phrase:en-lu:…` and `phrase:lu-en:…` are
  separate rows.
- **Mastery sums them** — `combinedElementStats` adds both; the phrase passes on
  the combined count. `computeOverallStats` groups by identity so a sentence is
  counted once.
- **The error pool keeps them apart** — `PhraseError`/`FillError` carry their
  direction, and Fix Errors rebuilds that exact direction with no roll.

Never reintroduce a direction-agnostic key: the error pool depends on the split.
Never count phrases through a single directional key: mastery depends on the sum.

**Latent bug this fixed:** `buildSentenceExercise` used to record every sentence
under `en-lu` regardless of presentation, so `lu-en` failures were untracked —
which is why the old "count only `phrase:en-lu:*`" logic looked correct. Old
en-lu stats still count via the combined sum, so no migration was needed.

## The key family is a list, not a copy-paste

`KEYED_ELEMENT_PREFIXES` in `progression.ts` drives key building, identity, and
combined stats. A new keyed kind costs one string in that list.

Two traps, both already paid for — do not undo them:

- **`isWordKey` is an explicit "matches no known prefix" check**, never
  `!isPhraseKey`. The negation is only correct while exactly one keyed family
  exists; with `fill:` present it counted fills as vocabulary and inflated
  `totalWords`/`masteredWords` on Home.
- **`worker/lib/validators.ts` must admit each prefix.** A missing regex makes
  the server reject **the whole sync batch** containing one such result — not
  graceful degradation but total progress loss for that Session.

## One gate for both tracks

The exam track's SubLesson chain uses the *same* rule and the same constant as
the course track: a step opens the next when every Element of it has passed.

- The exam track originally used a **play**-gate, rejected mastery-gating because
  content-addressed word keys (`lu|en`) could pre-master a SubLesson the user
  never opened. At a 1.0 threshold that objection dissolves (`@sentence` Elements
  are unique per SubLesson), and `toSubLessonView` computes
  `passed = unlocked && isComplete` so a locked node can never open the next one.
- **The play-marker stayed** and now means "opened": it keeps sticky access (the
  stricter gate can never take back a step a user already had) and defines the
  content-load and error-pool scope. Removing it breaks both for no gain.
- `selectSubLessonsToLoad` keys on played-ness, not the gate. Making it
  gate-aware needs `words` and turns the theme page's fetch into a self-feeding
  cascade. Accepted gap: mastering a SubLesson while abandoning every Session
  unlocks the next with no progress ring until its first completed Session.

## XP is event-based

`computeXP(words)` summed per-element mastery XP and could *decrease* when a word
was reclassified. Removed. XP is now a fixed award per completed Session
(`SESSION_XP`), granted once on celebration dismiss.

`UserData.totalXP` is cumulative server-side so it survives the daily-session
pruning window; `DailySession.xp` keeps per-day history for display. Guests
derive the total by summing days.

## Orphan stats are filtered

`collectLessonKeys(lessons)` derives the valid key set from loaded lessons and is
passed as `validKeys` to the overall-stats computation, so stats for Elements
deleted from a `.letz` file don't inflate counts.

## Legacy `DailySession` shape

Pre-April-2026 rows used `{ totalPairs, durationMs, correctMatches,
incorrectMatches }`. Normalizing happens at the **read boundary** (`getUser`),
pure and idempotent. Rejected: defensive reads at each merge site (keeps the bug
latent for new code) and a one-shot KV migration (operational burden, and the
normalizer would still be needed defensively). The merge produced `NaN` on a
legacy date before this; the validator's narrow date window kept it latent.

Removable once every live blob has rolled over.

Related: [[lesson-throughput]] (what makes the last stragglers reachable),
[[persistence-and-sync]] (merge parity, guest migration).
