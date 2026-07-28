---
name: lesson-content-sizing
description: A1 lesson element counts, the noun-form duplication cleanup, and why the progress bar felt stuck
metadata:
  type: project
---

# Lesson content sizing & the "stuck percentage" symptom

The Home progress bar is `mastered / total` Elements per lesson. Big lessons make it crawl: each session masters only a handful of new Elements, so a 197-Element lesson moves ~1–2%/session. This — not a bug in the math — is the main driver of the "stuck at a percentage, moves really slow" feeling.

## Noun-form triplication (cleaned up 2026-07-21)

The A1 `.letz` files stored most nouns **three times** as separate `@word` Elements:

```
@word eng Saach = thing     # indefinite
@word d'Saach = thing       # definite
@word Saachen = things      # plural
```

The indefinite form is a pure duplicate of the definite (same stem, same English gloss), so it tripled the count for no learning value. **Decision (user): keep definite + plural, drop indefinite.** Removed 103 indefinite duplicates across 5 files via stem+gloss matching (an indefinite entry was dropped only when a definite entry shared both the normalized noun stem and the exact gloss — this protected gendered pairs like `e Frënd`/`eng Frëndin` both glossed "friend", which each have their own definite form). Multi-word indefinite phrases with no definite counterpart (`e Kaffi fir matzehuelen`, `eng Dosen Eeër`) were kept.

Element counts after cleanup (words + sentences):

| Lesson | Before | After |
|---|---|---|
| A1.01 Greetings | 88 | 88 |
| **A1.02 Introductions** | **243** | **197** |
| A1.03 Numbers | 47 | 45 |
| A1.04 Things/Weather | 117 | 100 |
| A1.05 Work/Days | 62 | 62 |
| A1.06 Hobbies/Time | 64 | 64 |
| A1.07 Food/Shopping | 145 | 119 |
| A1.08 Places | 74 | 62 |
| A1.09 Verbs | 23 | 23 |

## Still oversized — deferred

A1.02 (197) and A1.07 (119) are still far larger than A1.03/A1.09 (~23–45). The unlock gate is `correct >= 3` on 80% of Elements, so A1.02 needs ~470 correct answers concentrated on the right Elements — many sessions. **Splitting oversized lessons into ~40–60-Element lessons** (via the `letz-content-generator` skill + manifest + audio updates) is the biggest remaining lever but was not done in the 2026-07-21 pass. If progress still feels stuck after the cleanup + the [[not-yet-mastered-bucket]] fix, splitting is the next step.

## Related algorithm fix

The [[not-yet-mastered-bucket]] change (same day) fixes a separate *permanent-stuck* bug: hard Elements that were shown a lot but never reached `correct >= 3` used to drop out of every priority bucket and cap the lesson below the 80% gate forever. That's distinct from "big lesson = slow bar" — content sizing is about *speed*, the bucket fix is about *reachability of the gate*.
