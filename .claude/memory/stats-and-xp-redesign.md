---
name: stats-and-xp-redesign
description: Full audit and redesign of user statistics, XP, mastery, and progress tracking (May 2026)
metadata:
  type: project
---

Comprehensive stats-system overhaul. Key decisions and their rationale below.

**Why:** audited all stats and found systematic bugs (time undercounted, streak missing for guests, double-counting, orphan data, lesson progress non-monotonic, XP could decrease).

## Two classification systems — on purpose

`classifyWord` (live) and `isElementMastered` (monotonic) coexist intentionally. They answer different questions:

| | `classifyWord` | `isElementMastered` |
|---|---|---|
| Formula | `correct / (correct + incorrect) >= 0.8` AND `shown >= 5` | `correct >= 3` |
| Monotonic? | No — can fluctuate | Yes — can only become `true` |
| Used for | Error pool selection, UI labels | Lesson progress, XP, "Learned X/Y" |

A word can simultaneously be `isElementMastered=true` (lesson progress doesn't regress) and `classifyWord=struggling` (it's in the error pool for drill). That's intentional.

**Updated 2026-06-16:** the pass gate was simplified from `correct >= 4 AND shown >= 5` to **just `correct >= 3`** — no accuracy ratio, no min-shown. `MASTERY_CORRECT_COUNT = 3` is now a plain constant (no longer derived from `0.8 × MIN_ANSWERS`). `MIN_ANSWERS` (5) still gates `classifyWord` and the error pool, just not the pass gate. See [[passed-gate-and-phrase-directions]].

## Why `isElementMastered` and not stored `masteredKeys`

Storing a `masteredKeys: string[]` set was considered (like `unlockedLessons`). Rejected because the condition `correct >= 3` is already naturally non-reversible given that `correct` only grows. No extra storage needed.

## Lesson progress is now guaranteed monotonic

`isElementPassing` delegates to `isElementMastered`. Lesson progress percentage can never decrease as the user keeps practising because the gate depends only on monotonically increasing counters.

## Sticky unlock (`unlockedLessons: string[]`)

Lesson unlock was previously derived purely from `correct/shown >= 0.8` which is NOT monotonic. Now:
- `computeUnlockedLessonIds(lessons, userWords, persistedUnlocked)` takes a third argument
- Persisted set is stored in `UserData.unlockedLessons` (KV) and `GuestData.unlockedLessons` (localStorage)
- Server unions on every sync; client applies optimistically
- Each slot sync computes the diff and sends `newlyUnlockedLessons` in the POST body
- `findCurrentLessonId` returns the last item in the unlocked list (user's frontier)

## XP is now event-based, not snapshot-based

Old: `computeXP(words)` — summed per-element mastery XP. Could decrease if word reclassified. Removed entirely.

New: 100/90/80 XP per completed session (Lesson/FixErrors/WordMix). Awarded once on session complete (CelebrationPopup dismiss → `awardXP(SESSION_XP[mode.kind])`).

Storage:
- `UserData.totalXP: number` — cumulative, server-side, immune to the 1825-session pruning window
- `DailySession.xp: number` — per-day history for "XP Today" display
- Guests derive `totalXP` from `sum(dailySessions[*].xp)`

Level table: 20 levels. A1-B2 completion (~384 sessions at avg 97 XP) reaches level 12-13. Levels 6/9/11/13 mark approximate A1/A2/B1/B2 completion.

## Two accuracy formulas — still both present

- `correct / shown` — **NOT** used for display or error pool after this redesign. Removed from primary usage.
- `correct / (correct + incorrect)` — used everywhere (unlock gate via isElementMastered uses correct counts; error pool uses accuracy; displayed accuracy uses this).

## Overall stats now include sentences

`StatsRow` "Learned X/Y":
- Y = `totalElements` from `HomeLessonsView` (words + sentences per loaded lesson)
- X = `masteredElements` from `computeOverallStats` (mastered words + mastered phrases)

Accuracy includes all valid elements (both phrase directions).

**Updated 2026-06-16:** a phrase is one Element whose stats are the **sum of both directions** (`combinedPhraseStats`). `computeOverallStats` groups the two directional keys by `phraseIdentity` and counts each sentence once; a sentence is mastered when its combined `correct >= 3`. (Previously only `phrase:en-lu:*` keys counted, which under-counted because `lu-en` practice was never tracked at all — see [[passed-gate-and-phrase-directions]].)

## Guest users now get a streak

Previously `streak: null` for guests. Fixed: `useProgress` computes `computeStreak(guest.dailySessions, today)` client-side and returns it as `StreakInfo`. Same function used server-side for auth users.

## Timer fixes

- Gap clamped at 30s (not dropped) — thinking time up to 30s counts
- `timer.start()` called on slot mount (on `currentSlotIndex` change in `active` state) so time before first click is measured
- SentenceBuilder token taps wired to `onInteraction` so sentence slots record time

## Double-incorrect bug fixed

WordMatch mismatch used to call `markIncorrect` for both pairs involved. Changed to mark only the pair the user just clicked (the one they selected second). One mistake = one incorrect count.

## Orphan stats filtered

`collectLessonKeys(lessons)` derives the set of valid keys from loaded lessons. Passed as `validKeys` to `computeOverallStats` and `computeXP` so stats for elements removed from `.letz` files don't inflate Learned counts or XP.

## Validators updated

`validateProgressSync` now validates:
- `xpEarned?: integer [0, 500]`
- `newlyUnlockedLessons?: string[]` (≤ 500, lesson-id format)
Both are optional for backward compatibility with older clients.

## Legacy `DailySession` shape normalized at read

Pre-April 2026 records used `{ totalPairs, durationMs, correctMatches, incorrectMatches }` (no `xp`). The current shape is `{ totalItems, durationSeconds, correct, incorrect, xp? }`. Older user blobs still in KV have one or both of those legacy rows mixed in.

Decision: normalize at the **read boundary** (`getUser` in `worker/lib/user.ts`) via `normalizeDailySession`/`normalizeDailySessions`. Pure + idempotent — new-shape records pass through unchanged. Considered alternatives:
- **Defensive reads at merge sites** — keeps the bug latent for any *new* code that sums fields across all dates.
- **One-shot KV migration script** — operational burden; the normalizer still needs to exist defensively for any blob that didn't run through it.

`mergeDailySession` previously produced `NaN` if a sync targeted a date already stored in the legacy shape (e.g. `existing.totalItems = undefined` → `undefined + n = NaN`). The validator's `[today-2, today+1]` window kept this latent, but a future "lifetime stats" sum would have hit it.

The next `saveUser` write naturally persists the clean shape, so the legacy normalizer becomes removable once all live KV blobs have rolled over.
