# Cross-device progress sync — focus/visibility refetch

## What and why

`AuthProvider` (`src/context/AuthContext.tsx`) installs `visibilitychange`, `focus`, and `online` listeners that re-call `fetchMe()` (= `GET /api/auth/me`) when the user returns to the tab/window or reconnects. Without this, `/api/auth/me` is loaded **only at mount** and a long-lived tab on Device B never sees writes made on Device A until a manual reload.

The same listener also patches the "deployed progress not tracked" symptom: even if a fire-and-forget `POST /api/progress/sync` was lost, the next focus event pulls the authoritative server state back into `AuthContext`.

## Design choices worth remembering

- **10s throttle, not debounce.** `lastRefreshAtRef` records each fetch's start time; a new event within 10s is dropped. Tab-switching can fire `visibilitychange` and `focus` back-to-back, plus rapid Alt-Tab cycles; throttling prevents redundant `/api/auth/me` calls. 10s is short enough to feel live for genuine cross-device use, long enough to ignore noise.
- **Authenticated-only gate.** Guests have no server state, so the listener early-returns when `auth.status !== "authenticated"`. Guest path still uses `refreshGuestProgress()` for in-tab post-Session refresh.
- **No request-counter against in-flight POSTs.** The "Post-Session refresh invariant" already established that the client tolerates "server lagging client" via optimistic merge; a focus refresh that beats an in-flight POST briefly shows slightly-older server state and self-heals on the next event. Adding a counter wasn't worth the complexity.
- **No retry queue on POST failures yet — just log.** `useProgressSync` catches errors and emits `progress_sync_failed` to PostHog (with `reason: "network" | "http"` + status/message). The decision is to **measure first**: if the failure rate is non-trivial in PostHog, the follow-up is a localStorage-backed pending-deltas queue replayed on `online` + focus. Don't build the queue speculatively — rolling back the optimistic local merge on POST failure would cause XP to "appear then disappear" on screen, which is worse UX than the silent drop.

## Why this isn't tested

Per CLAUDE.md, hooks/wiring are intentionally not unit-tested. The listener path is wiring around browser events. The optimistic-merge byte-identity test in `tests/src/context/auth-stats-delta.test.ts` still guards the merge invariant.
