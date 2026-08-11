# Persistence, sync, and guest migration

The *mechanics* are in CLAUDE.md § Data Persistence; this is the reasoning behind
the awkward parts.

## Sync is fire-and-forget, and that is a measured choice

`useProgressSync` POSTs without awaiting for the UI flow. No retry, no
idempotency key — a failed request loses that batch's delta.

Failures are logged to PostHog (`progress_sync_failed`, with a reason). **The
decision is to measure first.** If the rate is non-trivial, the follow-up is a
localStorage-backed pending-deltas queue replayed on `online` + focus. Don't build
it speculatively: rolling back the optimistic local merge on failure would make XP
appear then disappear on screen, which is worse than a silent drop.

## Focus/visibility refetch — cross-device sync

`AuthProvider` re-calls `/api/auth/me` on `visibilitychange`, `focus`, and
`online`. Without it, server state is fetched only at mount, so a long-lived tab
never sees another device's writes. It also patches a lost POST: the next focus
event pulls authoritative state back.

- **10s throttle, not debounce.** Tab-switching fires `visibilitychange` and
  `focus` back-to-back; throttling drops the redundant call. Short enough to feel
  live, long enough to ignore noise.
- **Authenticated-only** — guests have no server state; their in-tab refresh is
  `refreshGuestProgress()`.
- **No request-counter against in-flight POSTs.** The client already tolerates
  "server lagging client" via optimistic merge, so a refresh that beats a POST
  shows slightly-older state and self-heals on the next event.

## Guest→auth migration: chunked, clear-on-success

The migration used to POST lifetime guest totals as **one** request and then clear
localStorage unconditionally. Lifetime totals routinely exceed the per-batch
validator bounds, and the sync swallowed failures — so long-term guest data was
being wiped without ever reaching KV.

`buildMigrationChunks` (pure, tested) now splits guest data so each chunk
satisfies every bound; chunks POST sequentially; localStorage clears only if all
succeed.

- **Round-based chunking:** a key with counters over the per-key cap is split into
  slices across *different* chunks (round r holds slice r of every key), so a key
  never appears twice in one chunk and the server's additive merge reconstructs
  exact totals. No clamping, no loss.
- **Bounds are mirrored constants, not imported** from the worker — keeps `src/`
  free of worker imports. A comment in each file points at the other; change both
  in the same commit.
- **Rejected: server-side support for daily-history migration.** The validator's
  narrow date window means per-day guest history (streak, per-day XP) cannot be
  replayed — all migrated progress lands on today. Relaxing the window or adding a
  migration endpoint would expand attack surface for one rare event. Streak-history
  loss on login is accepted.
- **Rejected: client-side idempotency state for partial failures.** If chunk N
  fails, earlier chunks are already merged; the next page load re-sends them and
  double-counts. Accepted as rare and low-harm rather than inventing persistent
  dedup bookkeeping.

## Async auth arrives *after* first render

**Regression worth not repeating:** on a hard reload while authenticated, a
completed lesson showed its green check but the next lesson stayed
locked-and-unloaded.

`AppHome`'s cascade snapshotted `words` + `unlockedLessons` into refs at mount and
depended only on `[lessonMetas]`. But `/api/auth/me` resolves *after* mount, so the
cascade ran against empty stats, stopped at lesson 1, and never re-ran. Home then
read live stats for the green check but stale lessons for the unlock set — the two
disagreed, and the sticky-unlock backstop was frozen empty by the same mechanism,
so both safety nets failed together. Guest mode never hit it (localStorage is
synchronous at mount).

**Rule:** any effect deriving loadable content from `words` / `unlockedLessons` /
streak must treat them as values that arrive after first render. Never freeze them
in a mount-time ref; put the live values in the dependency array and guard the
async resolution with an `AbortController` (a `const` handle — no `let cancelled`).

Related: [[mastery-and-unlock]] (sticky unlock, key validation).
