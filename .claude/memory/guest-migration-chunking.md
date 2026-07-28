# Guest→auth migration: chunked sync, clear-on-success (June 2026)

## What changed

The one-time guest→auth migration (`src/persistence/hooks/use-progress.ts`) used to POST the guest's lifetime totals as ONE `/api/progress/sync` request and then `guest.clear()` unconditionally. Lifetime totals routinely violate the per-batch validator bounds (`durationSeconds ≤ 3600`, `wordResults.length ≤ 200`, per-key counters ≤ 100, `xpEarned ≤ 500`), and `syncProgress` swallows failures — so long-term guest data was being wiped without ever reaching KV.

Now: `buildMigrationChunks` (`src/persistence/migration.ts`, pure, fully tested) splits guest data into chunks that each satisfy every validator bound; chunks POST sequentially; `guest.clear()` runs only if all chunks succeed. Guest XP (previously dropped entirely) is carried via `xpEarned` slices.

## Design decisions and rationale

- **Round-based chunking**: a key with counters > 100 is split into ≤100 slices across *different* chunks (round r holds slice r of every key) so a key never appears twice in one chunk's map and the server's additive merge reconstructs exact totals. No clamping, no data loss.
- **Bounds are mirrored constants**, not imported from `worker/lib/validators.ts` — keeps src/ free of worker imports; comment in each file points at the other. If validator bounds change, change `migration.ts` in the same commit.
- **Considered and rejected: server-side changes for daily-history migration.** The validator's date window `[today-2, today+1]` means per-day guest history (streak, per-day XP) cannot be replayed; all migrated progress lands on "today". Relaxing the window or adding a dedicated migration endpoint would expand attack surface for one rare event — decided no. Streak history loss on login is an accepted tradeoff.
- **Considered and rejected: client-side idempotency/dedup state for partial failures.** If chunk N fails, earlier chunks are already merged server-side; a retry (next page load) re-sends them and double-counts (additive merge, no idempotency key). Accepted as rare + low-harm rather than inventing persistent dedup bookkeeping. `migrationDone` stays true for the tab session to avoid same-session re-posts.

## Related fixes landed in the same change set

- `syncProgress` now returns `Promise<boolean>` (success), still fire-and-forget safe for slot syncs.
- `phraseKey` (`src/exercise/progression.ts`) truncates `firstEn` to 64 chars, in lockstep with `PHRASE_KEY_RX` in `worker/lib/validators.ts` — previously one >64-char sentence made every batch containing it 400-reject (whole-batch silent loss). Prefix collisions between sentences sharing the first 64 chars are an accepted tradeoff (their stats merge).
- `isValidKey` no longer applies the phrase-key length cap (77) to word keys; the regexes are the single source of truth (word key ≤ 129 incl. pipe).
- Fix Errors button on Home is disabled when `selectErrorPool` is empty; `AppExercise` renders an empty-state instead of Start when `totalSlots === 0` (dead-end guard for all modes).
