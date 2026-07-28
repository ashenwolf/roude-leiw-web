---
name: home-cascade-async-words
description: AppHome lesson cascade must depend on live words/unlockedLessons, not mount-time refs — auth resolves after mount
metadata:
  type: project
---

**Regression (June 2026):** On a hard reload while authenticated, a completed lesson showed its green check but the next lesson stayed locked-and-unloaded.

**Cause:** `AppHome.tsx` Phase 2 cascade (`loadLessonsUpToCursor`) snapshotted `words` + `unlockedLessons` into `useRef` at mount and only depended on `[lessonMetas]`. But `/api/auth/me` resolves *after* AppHome mounts, so the cascade ran against empty stats, stopped at lesson 1, and never re-ran when stats arrived. The Home view then read live `words` for the green check but stale (one-lesson) `lessons` for the unlock set — the two disagreed. The `unlockedLessons` sticky backstop was frozen empty by the same mechanism, so both safety nets failed together. Guest mode never hit this (localStorage is synchronous at mount).

The old comment ("AppHome remounts on every navigation, so we always get the latest stats") held for in-app navigation but was false on a hard reload.

**Fix:** Depend on live `[lessonMetas, words, unlockedLessons]`; drop the refs. An `AbortController` (a `const` handle — honors the no-mutable rule, no `let cancelled`) drops a stale resolution if `words` changes again mid-fetch.

**Rule:** Any effect that derives loadable content from `words`/`unlockedLessons`/streak must treat them as values that arrive *after* first render (async auth). Never freeze them in a mount-time ref. **Why:** auth state is empty on the first render of any hard page load. **How to apply:** put the live values in the dependency array; guard async resolution with an AbortController.

Verified by reproducing the timing: mock `/api/auth/me` with a 600ms delay returning lesson-1-mastered + `unlockedLessons: []`, confirm lesson 2 unlocks. Related: [[stats-and-xp-redesign]] (sticky unlock, two mastery systems).
