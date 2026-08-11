# Frontend decisions — React features, bundle, caching, layout

## React 19: only Error Boundary and route `React.lazy` were adopted

All seven modern features were evaluated; the rest are intentionally skipped.
**When a future task proposes "modernize with Suspense/`use()`", point here.** The
architecture resists these features by design, not by oversight.

| Feature | Why not |
|---|---|
| Suspense | replaces named loading states with implicit promise-pending state; the discriminated state machines (`SessionStatus`, `AuthState`) *are* the contract |
| `use()` | the pipeline keeps Promises at exactly three edges; `use()` smears them back into consumers |
| `useOptimistic` | would force a rewrite of the byte-identical client/server merge, which is more sophisticated than it allows and is guarded by a byte-identity test |
| `useTransition` / `useDeferredValue` | solve >50ms render jank that doesn't exist here — the data set per render is small enough that these computations are sub-frame |
| `useActionState` / `useFormStatus` | form APIs; there are no forms |

A single Suspense boundary would also break the two-phase progressive Home load
(manifest cards immediately → cascade-load only unlocked `.letz`) by forcing a
waterfall.

Re-evaluate only if (a) a screen with deep async trees lands, (b) forms are added,
or (c) the producer/consumer split is being abandoned deliberately.

## Bundle: three chunks

Splitting on two seams cut initial paint by roughly 80% — the parser turned out to
be **three to five times the size of everything Home needs**, so keeping it out of
the eager tree is the whole win. Current figures come from `npm run build`; they
drift with every dependency bump and are deliberately not recorded here.

1. **Main (eager)** — Home, auth, persistence, ui, manifest loader. Renders Home
   immediately from manifest titles.
2. **Chevrotain parser** — the largest chunk by far, loaded dynamically inside
   `parseLetzContent` on the first `fetchLesson`, so it parallelizes with the
   `.letz` fetch itself.
3. **AppExercise** — exercises, mode planners, reducer, popups, via `React.lazy`.

**Rules:**
- **Never statically import anything from `src/lib/letz-parser` into a module
  reachable from Home's eager tree** — it pulls Chevrotain back into the main
  bundle. `parseLetzContent` is `async` precisely because the dynamic import inside
  it *is* the split point; don't "simplify" it to a sync call.
- Type-only imports of `Lesson`/`WordEntry` are fine everywhere (erased).
- The Error Boundary in `AppWrapper` catches chunk-load failures from both
  `React.lazy` and dynamic imports — don't remove it.
- New heavy module → dynamic import at the call site, not a swollen main bundle.

## Service-worker caching

**Never `CacheFirst` an index file.** A blanket `CacheFirst` over
`/assets/lessons/` meant a new `manifest.json` took **up to 7 days** to reach
returning users: `registerType: "autoUpdate"` only refreshes the precached app
shell, not runtime-cached entries, and `CacheFirst` never hits the network while an
unexpired entry exists.

Current shape: the manifest is `NetworkFirst` with a short network timeout;
`.letz` files are `StaleWhileRevalidate` (instant load + background freshness);
`/api/` is `NetworkOnly`.

- **`CacheFirst` is only for content addressed by a stable identifier**, where "if I
  have it, it's correct" holds. `.letz` files are borderline — the path is stable
  but contents get edited.
- **Bump `cacheName` when changing strategy.** Workbox's expiration plugin only
  manages caches it currently owns, so renaming is the clean way to invalidate on
  next activation instead of waiting out the old TTL. Old caches dangle harmlessly.
- **Rules match in order** — specific (manifest) before broad (`*.letz`).

## Bottom-pinned bars and the shell's scroll padding

`<main>` (the app's only scroll container) intentionally has **horizontal and top
padding but no bottom padding**; pages own their own bottom spacing.
**Do not "tidy" that back into a uniform `p-6`.**

**The bug it fixes:** a `sticky bottom-0` element can never be offset past its
containing block. With bottom padding on `<main>`, that padding lives *outside* the
page wrapper, so Home's practice-mode bar parked 24px above the scrollport bottom
**at every scroll position**, leaving a strip through which the lesson grid showed —
card bottoms rendering *below* the bar read as a floating strip pasted over the
grid. Measured: `main.bottom - bar.bottom === 24` at scrollTop 0, mid, and max.

**Rejected: a negative bottom margin on the sticky child.** A negative margin
shrinks the *parent's* height accounting but does not extend the containing-block
clamp that bounds a sticky box. Same for growing the bar's own padding (moves its
top up, bottom stays clamped) and `min-h-[calc(100%+3rem)]` + negative margin
(works, but hardcodes the shell's padding in the page). **The containing block has
to actually reach the scrollport bottom; nothing else is load-bearing.**

**Also rejected: hoisting the bar into `AppWrapper`** as a flex sibling of
header/main. Structurally nicest — the scroll area would shrink instead of the grid
scrolling under the bar — but `AppWrapper` wraps `<App/>`, so a page-owned bar needs
a context slot or a portal. Real machinery for one page's bar; revisit if a second
page wants one.

**Safe-area insets:** the bar's bottom padding is
`max(0.5rem, env(safe-area-inset-bottom))`. `viewport-fit=cover` means the frame
extends under the iOS home indicator; the header already handled the top. The
`0.5rem` floor also keeps buttons off the desktop phone-frame's rounded corner,
which zero padding clipped.

Related: [[persistence-and-sync]] (the optimistic merge `useOptimistic` would
break), [[picture-description-theme]] (the full-bleed image and its vertical
budget).
