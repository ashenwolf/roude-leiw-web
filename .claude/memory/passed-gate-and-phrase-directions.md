---
name: passed-gate-and-phrase-directions
description: Pass gate simplified to correct>=3; phrases store per-direction stats but mastery sums both directions; error pool keeps direction to repeat the exact failed one.
metadata:
  type: project
---

Two coupled changes landed 2026-06-16 (see [[stats-and-xp-redesign]]).

## 1. "Passed" gate is now just `correct >= 3`

`isElementMastered` was `correct >= 4 AND shown >= 5`; now it is **only** `correct >= MASTERY_CORRECT_COUNT` where `MASTERY_CORRECT_COUNT = 3` (a plain constant in `constants.ts`, no longer derived from `0.8 × MIN_ANSWERS`). No accuracy ratio, no minimum-shown gate. Drives lesson progress, lesson unlock, XP, "Learned X/Y".

`classifyWord` (live label) and the error pool are **unchanged** — they still use `MIN_ANSWERS` (5) + accuracy. The two-system split is still intentional.

## 2. Phrases: per-direction storage, one-element mastery, direction-aware errors

The original request was "one ID for both directions / both directions count to one phrase entry." The follow-up clarified the error pool must repeat the **exact** direction the user failed. Those can't both be literal single-key storage, so:

- **Storage stays per direction:** `phrase:en-lu:{firstEn}` and `phrase:lu-en:{firstEn}` (validator regex unchanged).
- **Latent bug fixed:** `buildSentenceExercise` used to record *every* sentence under `en-lu` regardless of how it was presented, so `lu-en` failures were never tracked. It now records under the actual presented `direction`. This is the reason the old "count only `phrase:en-lu:*`" logic looked correct — the other key was always empty.
- **Mastery/progress treats a phrase as ONE element** by summing both directions: `combinedPhraseStats(userWords, firstEn)` adds the two keys; a phrase passes iff combined `correct >= 3`. `computeOverallStats` groups directional keys via `phraseIdentity` and counts each sentence once.
- **Error pool keeps direction:** `selectErrorPool().phrases` is now `PhraseError[] = { sentence, direction }[]`, registering both directions as separate candidates. Fix Errors rebuilds the exact failed direction (no direction roll). `word-mix` is unaffected (consumes `.words` only).

**Why:** practising either way should advance the one phrase (less grindy), but drilling errors must reproduce the specific direction the user got wrong.

**How to apply:** never reintroduce a direction-agnostic phrase key — the error pool depends on the directional split. When counting phrases for progress/mastery, always go through `combinedPhraseStats`/`phraseIdentity`, never a single directional key. If you change the pass gate, change `MASTERY_CORRECT_COUNT` in `constants.ts` only.

**Migration note (not handled):** existing users' historical phrase stats are all under `phrase:en-lu:*` (because of the latent bug). After the fix, `lu-en` practice writes new keys; old en-lu stats still count via the combined sum, so nothing is lost. No data migration needed.
