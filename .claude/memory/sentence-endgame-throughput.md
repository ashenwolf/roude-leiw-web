# Sentence throughput in the lesson endgame — the "stuck at 98%" bug (Aug 2026)

**Date:** 2026-08-03 · **Branch:** `claude/lessons-98-percent-stuck-56uga5`

User report: *"I am reaching 98% on lessons and then it does not move. At least after 3 rounds it should move as I would definitively have certain exercises shown 3 times."* — then, after the first round of investigation: *"I am tapping the lesson, and it is still at 98% after 3 rounds."*

## Root cause: words and sentences had different per-session throughput

A **word** can be drawn by several word-match Slots in one Session — `pickUniquePairs` dedupes only *within* one 5-pair Slot. A straggler word routinely goes `correct` 0 → 4 in a single Session and clears `MASTERY_CORRECT_COUNT` immediately.

A **sentence** was capped at one appearance per Session by `usedSentenceKeys` (the 2026-06-03 variety guarantee), and earns at most +1 `correct` per appearance. So a lesson whose remaining backlog was sentences had a **hard floor of 3 Sessions** before its percentage could move at all — and because the `not-yet-mastered` bucket is probabilistic (30%), usually 4–5.

Compounding it: `UNLOCK_LESSON_THRESHOLD` is 1.0 and the lesson card renders `mastered/total`, so `correct = 1/3` and `2/3` are indistinguishable from `0/3`. The number is **literally frozen** for those Sessions while the Session is in fact working.

That also explains the shape of the whole grid: lessons climb smoothly to ~98% and then stall, because **what survives into the tail is disproportionately sentences** — words clear fast, sentences didn't.

Measured on real A1.02 (147 words + 45 sentences), 200 trials, tapping the lesson directly:

| tail remaining | nothing after 3 rounds (before) | (after) | median rounds to 100% |
|---|---|---|---|
| 4 sentences | **61%** | 7% | 6 → 4 |
| 2 sentences | **48%** | 3% | 3 → 2 |
| 4 words | 0% | 0% | 2 → 2 |
| 2 words + 2 sentences | 0% | 0% | 4 → 3 |

## The fix (Fix A — the only one taken)

`SentenceBudget` in `modes/lesson.ts` replaces `usedSentenceKeys: Set<string>`. A not-yet-mastered sentence may be scheduled `MASTERY_CORRECT_COUNT` times per Session **when fewer than `LESSON.totalSlots` of them remain**; everything else keeps the cap of 1. Details and rationale in [[not-yet-mastered-bucket]] § "Session-level sentence deduplication".

Chosen over a flat "always allow 3": with a fresh 45-sentence lesson, a flat allowance would let ~1 sentence repeat per Session for no benefit, regressing the documented variety guarantee. The pool-size gate targets exactly the case where variety is impossible anyway.

## Known and NOT fixed (user scoped this change to Fix A)

Recorded so they aren't re-derived:

1. **The cursor targets the last unlocked lesson, not the first unfinished one.** `findCurrentLessonId` returns `unlocked[unlocked.length - 1]` (`progression.ts:225`), and `planLessonMode` scopes the whole straggler apparatus — the 30% bucket *and* the adaptive slot-type split — to `pool[pool.length - 1]`. Everything earlier falls into the `previous` bucket (15% of word picks / 20% of sentence picks) spread over ~700 words and ~250 sentences, i.e. ~0.01 draws per element per Session. Simulated on a 9-lesson sticky-unlocked state: **1/9 lessons complete after 60 Sessions**; with the cursor pointed at the first incomplete lesson instead, **9/9**. This is latent for a clean user (with a 1.0 gate the unlocked set is a prefix and only the last member is incomplete) but bites every user who unlocked lessons under the old 0.8 gate — see [[exam-and-lesson-pass-gate]]. Sticky unlock keeps those lessons open forever at 80–99%.
2. **No sub-mastery feedback anywhere.** The lesson card shows a frozen percentage; "N elements left" would remove the dead zone.
3. **`DebugPanel` lists only `lesson.entries`** (`DebugPanel.tsx:101-108`) — sentences are invisible, so a sentence-only tail shows all-green words. It is also `hidden md:block`, i.e. desktop-only. Both made this bug much harder to self-diagnose.
4. **Neither fallback Mode reaches a never-drawn straggler.** Word Mix only ever builds word-match Exercises (`modes/word-mix.ts:58`), so a stuck sentence is unreachable there. `selectErrorPool` needs `shown >= MIN_ANSWERS` or `incorrect > 0`, and tail stragglers typically have `shown: 0, incorrect: 0`.

## Ruled out during the investigation — do not re-check

- **The planner can reach every Element.** A perfect player converges to 100% on all nine A1 lessons.
- **All sentences are solvable.** Every sentence in both directions can be assembled from its tiles and accepted by `applySubmit` (checked across the whole course + exam catalog).
- **No stat key can trip the sync validator.** All `.letz`-derived keys pass `WORD_KEY_RX`/`PHRASE_KEY_RX`; no duplicate or colliding keys after the 64-char `phraseKey` truncation.
- **WordMatch homonym cross-matching self-corrects.** `isValueMatch` accepts an LU-or-EN match, and `markCorrect` credits only `leftPairIndex` — but each left tile is removed exactly once per Session, so every pair receives exactly one `correct`.
- **Client and server merges are additive and consistent**, and the KV caps are nowhere near being hit.
- **No cross-lesson Element overlap** (0–2%) that could auto-complete a later lesson and skip the chain.
