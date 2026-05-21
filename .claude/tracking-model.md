# Tracking Model

Everything the app records about a user, how it is stored, where it is computed,
and what appears in the UI. Updated after the May 2026 stats-audit pass.

---

## 1. Raw element stats — `WordStats`

**What it is.** Every learnable element (vocabulary pair or sentence phrase) gets
a stat entry in a flat map keyed by a string id.

```
key format
  word:    "{lu}|{en}"              e.g. "Moien|hello"
  phrase:  "phrase:{dir}:{firstEn}" e.g. "phrase:en-lu:Good morning!"
```

**Three counters per key.**

| Counter | Incremented when |
|---------|-----------------|
| `shown` | The element first appears on screen in a slot (WordMatch: on init + each time a new pair surfaces from the pool; SentenceBuilder: `shown = 1` always, regardless of retries within the same slot) |
| `correct` | The element is answered correctly (WordMatch: on a matching click; SentenceBuilder: on a correct submit) |
| `incorrect` | The element is answered incorrectly (WordMatch: `+1` on the clicked pair only; SentenceBuilder: `+1` on incorrect submit — UI lock prevents multiple submits in one attempt) |

**Important asymmetries.**
- `correct + incorrect` is NOT guaranteed to equal `shown`. A word can be
  shown once (`shown = 1`) and missed zero times before being matched (`correct = 1,
  incorrect = 0`). A sentence can be shown once but attempted and failed
  (`shown = 1, correct = 0, incorrect = 1`).
- For WordMatch: every slot exits with `correct = 1` for every pair that appeared,
  because the slot only completes when all pairs are matched. `incorrect` accumulates
  wrong attempts but doesn't stop completion.
- For SentenceBuilder: a failed sentence exits with `correct = 0, incorrect = 1`.
  It is re-queued for the correction block; when re-attempted in the same session,
  a brand-new game state starts (`shown = 1` again), so repeated retries add to
  the cumulative `shown` count across syncs.

**Where it lives.**
- Auth users: `user:{userId}` KV blob → `words` map (server-canonical). Merged
  by `mergeWordResults` in `worker/lib/user.ts`.
- Guest users: `localStorage["roude-leiw-guest"]` → `words` map. Merged by
  `mergeWordStats` in `src/lib/stats-merge.ts`. Same arithmetic.
- In-memory during a session: `AuthContext.words` (React state) receives an
  optimistic local merge the moment a slot completes, before the POST returns.

**Server caps.**  `MAX_WORD_KEYS = 10 000`. New keys are silently dropped when
the map reaches this limit; existing keys keep accumulating.

---

## 2. Element classification (`classifyWord`)

Derived from a single `WordStats` entry. Source: `src/exercise/progression.ts`.

| Class | Condition |
|-------|-----------|
| `unseen` | `stats` absent OR `shown = 0` |
| `mastered` | `correct >= 3` (regardless of `incorrect` count) |
| `struggling` | `shown >= 3` AND `correct / (correct + incorrect) < 0.6` AND not yet mastered |
| `learning` | everything else (seen but not mastered, not struggling) |

**Key point.** "Mastered" is purely a count of correct answers (≥ 3), not an
accuracy ratio. Once you get something right 3 times it is classified mastered
forever, even if you then miss it 100 times. This makes the UI mastery label
very lenient, which is intentional.

---

## 3. Lesson progress & unlock

### Element-level pass check

An element "passes" the unlock gate iff:
- `shown >= 5` (MIN\_ANSWERS)
- `correct / shown >= 0.8` (UNLOCK\_ELEMENT\_THRESHOLD)

This check uses `correct / shown` (not `correct / (correct + incorrect)`).
It is stricter than the mastery classification (which only requires 3 correct)
but more forgiving than the accuracy formula (which counts every wrong attempt).

### Lesson-level completion

```
passing = count of elements that pass the element check
total   = words + sentences (en-lu direction only for sentences)
percentage = passing / total
isComplete = total > 0 AND percentage >= 0.8
```

Source: `computeLessonProgress` in `src/exercise/progression.ts`.

### Unlock (access to the next lesson)

Lesson N+1 becomes accessible if lesson N's `percentage >= 0.8`.

**Sticky unlock.** Once a lesson is unlocked it stays in the accessible set
even if stats drift below the threshold later (`correct/shown` is not monotonic
— missed answers grow `shown` without growing `correct`). The persisted
`unlockedLessons: string[]` list, stored in both KV (`UserData`) and
localStorage (`GuestData`), is the source of truth for stickiness.

Each slot sync sends `newlyUnlockedLessons` (the diff between previously
persisted and the newly computed union). Server takes the union and persists.
Client applies the union optimistically in `AuthContext`.

### "Current lesson" / CTA target

The last entry in the computed unlocked list. Because the list only grows, this
is always the user's frontier (the most recently unlocked lesson, complete or
not).

---

## 4. Overall stats (Home screen numbers)

Source: `computeOverallStats` in `src/exercise/progression.ts`.

All computations are scoped to **valid keys** (keys that exist in currently
loaded lessons). Keys for elements removed from `.letz` files are excluded so
orphaned stats don't inflate the numerator.

| Displayed as | What it counts |
|---|---|
| `Learned X/Y` | X = `masteredWords` (word keys where `correct >= 3`); Y = `totalWords` (sum of `@word` entries across loaded lessons) |
| `Accuracy N%` | `totalCorrect / (totalCorrect + totalIncorrect)` across all word keys only (phrase keys excluded). Each correct answer contributes `+1`; each missed attempt contributes `+1` to the denominator. |

**Not currently displayed but computed:**
- `learningWords`, `strugglingWords`
- `totalPhrases`, `masteredPhrases`

---

## 5. XP & levels

Source: `computeXP` + `computePlayerLevel` in `src/exercise/xp.ts`.

### XP per element

XP is a snapshot of the current classification, not an accumulator:

| Class | XP |
|---|---|
| `unseen` | 0 |
| `learning` | 10 |
| `struggling` | 5 |
| `mastered` | 100 |

XP is summed over **all** valid keys (words + both phrase directions). A phrase
practiced in both en→lu and lu→en directions has two separate keys, so it can
contribute up to 200 XP (100 per direction) vs 100 XP for a vocabulary word.

If a word regresses from `mastered` back to `learning` (e.g. `correct` is still
≥ 3 so it stays mastered — in practice this cannot regress because `mastered` is
a count, not a ratio). XP is therefore monotonically non-decreasing once a word
is mastered.

### Level thresholds

| Level | Title | XP required |
|---|---|---|
| 1 | Beginner | 0 |
| 2 | Explorer | 200 |
| 3 | Learner | 500 |
| 4 | Practitioner | 1 000 |
| 5 | Scholar | 2 000 |
| 6 | Adept | 4 000 |
| 7 | Expert | 7 000 |
| 8 | Master | 12 000 |

---

## 6. Time tracking

Source: `useActivityTimer` in `src/exercise/use-activity-timer.ts`.

### How time is measured

The timer accumulates "interaction gaps" — the time between two consecutive user
interactions (a match click, a token tap, a submit).

```
gap = now - lastInteractionAt
     clamped to [0, IDLE_THRESHOLD_S]   (IDLE_THRESHOLD_S = 30 s)
accumulatedS += gap
```

Gaps longer than 30 seconds are clamped (not dropped). This counts ~30 s of
"thinking time" for a user who stepped away and returned, while not awarding
hours for an abandoned tab.

**First interaction.** `timer.start()` is called each time a new slot becomes
visible (wired to `currentSlotIndex` changes in `AppExercise`). The anchor gives
the first interaction something to measure against, so think-time before the
first click is counted.

### What counts as an interaction

| Exercise | Events that tick the timer |
|---|---|
| WordMatch | Each correct match (via `onMatch` → `handleSlotProgress` → `registerInteraction`) |
| SentenceBuilder | Each token tap + assembled-area tap + submit button press (via `onInteraction` prop) |

### When time is flushed

`getElapsedSeconds()` is read and `reset()` is called at the start of
`handleSlotSync` (slot completion), just before `syncBatch` is called. The
captured duration is sent as `durationSeconds` in the POST body.

### Where duration is stored

`dailySessions[date].durationSeconds` — accumulated per day. The today figure
on Home (`todayMinutes`) is `dailySessions[today]?.durationSeconds / 60`.

### Known limitation

Only the time spent on slots is counted. Time in popups, loading screens, and
the Home screen is not counted.

---

## 7. Streaks

Source: `computeStreak` in `src/lib/streak.ts` (shared between worker and client).

### What counts as "a day"

Any date key present in `dailySessions`. A date is added when at least one slot
sync completes with that day as the `date` field. Dates are UTC `YYYY-MM-DD`.

### Current streak

Days of consecutive play ending today (or yesterday — streak is not broken until
the second day is missed). Computed by walking backwards from today through
`dailySessions` keys.

```
hasToday     = lastDate === today
hasYesterday = !hasToday AND lastDate === yesterday

if neither → current = 0
else count back through consecutive days
```

### Longest streak

The longest consecutive run in the entire `dailySessions` history, computed in
the same pass. Note: `dailySessions` is capped at `MAX_DAILY_SESSIONS = 1825`
(5 years). Days pruned beyond that limit are lost, so longest streak can
theoretically shrink after 5 years of play.

### Guest vs auth

- **Auth:** streak is returned by the server on `/api/auth/me` and recomputed
  locally in `AuthContext` on every slot sync (`applyStatsDelta`).
- **Guest:** computed client-side in `useProgress` from `guest.dailySessions`
  using the same `computeStreak` function. Shown in the UI the same way.

### Display

`StreakBadge` in the Home header shows `current`. `longest` is computed but not
currently displayed anywhere.

---

## 8. Daily sessions

Stored in `dailySessions: Record<"YYYY-MM-DD", DailySession>`.

```ts
type DailySession = {
  totalItems: number;    // sum of `shown` across all word results in the day
  durationSeconds: number;
  correct: number;
  incorrect: number;
};
```

These are cumulative per day (each slot sync adds to the existing entry).
`totalItems` / `correct` / `incorrect` are not currently displayed on Home —
only `durationSeconds` (→ `todayMinutes`) is shown.

---

## 9. Unlocked lessons (sticky)

Stored as `unlockedLessons: string[]` in both `UserData` (KV) and `GuestData`
(localStorage). Persisted separately from `words` so unlock never regresses.

**Growth rule.** After each slot completes:
1. Client computes `computeUnlockedLessonIds(sessionLessons, mergedWords, currentPersistedUnlocked)`.
2. Diffs against `currentPersistedUnlocked` → `newlyUnlockedLessons`.
3. `newlyUnlockedLessons` is sent in the sync payload; server takes the union.
4. Client applies the union optimistically in `AuthContext` / `GuestData`.

**Never shrinks.** The server always unions (`mergeUnlockedLessons` in
`worker/lib/user.ts`). The client also only ever adds.

**Cap.** `MAX_UNLOCKED_LESSONS = 500`.

---

## 10. Key derivations — summary table

| UI element | Source function | Input |
|---|---|---|
| Streak badge | `computeStreak` | `dailySessions`, today |
| XP bar | `computeXP` + `computePlayerLevel` | `words`, `validKeys` |
| Learned X/Y | `computeOverallStats` | `words`, `validKeys` |
| Accuracy % | `computeOverallStats` | `words`, `validKeys` |
| Today minutes | inline | `dailySessions[today].durationSeconds` |
| Lesson % bars | `computeLessonProgress` | lesson, `words` |
| Locked/unlocked grid | `computeUnlockedLessonIds` | lessons, `words`, `unlockedLessons` |
| Fix Errors availability | `selectErrorPool` | `words`, lessons |
| Word mastery label | `classifyWord` | single `WordStats` |

---

## 11. Two accuracy formulas in the codebase

There are intentionally two different accuracy calculations. Be careful not to
conflate them:

| Formula | Used for | Numerator | Denominator |
|---|---|---|---|
| `correct / shown` | Unlock gate (element passes at ≥ 0.8) | correct answers | exposures (times shown on screen) |
| `correct / (correct + incorrect)` | Displayed "Accuracy %" | correct answers | all attempts including wrong ones |

The unlock formula is more lenient: if you eventually match a word correctly it
passes, regardless of how many wrong tries preceded it. The displayed accuracy
penalises every wrong attempt.
