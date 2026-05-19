---
name: react-19-features-evaluation
description: Why most modern React features (Suspense, use(), useTransition, useOptimistic, useActionState) are intentionally NOT adopted in this codebase despite being on React 19.
metadata:
  type: project
---

We evaluated all seven modern React features in May 2026 and adopted **only** Error Boundary and route-level `React.lazy`. The rest are intentionally skipped.

**Why:**
- The architecture is explicitly built around discriminated state machines (`SessionStatus`, `AuthState`) called out as load-bearing in CLAUDE.md. Suspense replaces named loading states with implicit promise-pending state — easier to write, harder to reason about when the state diagram IS the contract.
- The pure-producer / thin-wiring pipeline (CLAUDE.md "Data Pipeline" section) deliberately keeps Promises at exactly three edges (manifest fetch, lesson fetch, `/api/*` fetch). `use()` smears Promise handling back into consumers — opposite direction.
- `useOptimistic` would force a rewrite of the manually-implemented byte-identical client/server merge (`src/lib/stats-merge.ts` + `applyStatsDelta` in `AuthContext.tsx`). Existing implementation is more sophisticated than `useOptimistic` allows and is guarded by a byte-identity test (`tests/src/context/auth-stats-delta.test.ts`).
- `useTransition`/`useDeferredValue` solve >50ms render jank that doesn't exist here (≤5 lessons, ≤200 words, sub-frame computations).
- `useActionState`/`useFormStatus` are form APIs; there are no forms.
- The two-phase progressive Home load (`AppHome.tsx`: manifest cards immediately → cascade-load only unlocked `.letz` files) would be broken by a single Suspense boundary forcing a waterfall.

**How to apply:** When a future task or PR proposes "let's modernize with Suspense/use()", point back to this evaluation. The architecture resists these features by design, not by oversight. Re-evaluate only if (a) a new screen with deep async trees lands, (b) forms are added, or (c) the producer/consumer split is intentionally being abandoned.

Related: [[bundle-code-splitting]] — the two features we DID adopt.
