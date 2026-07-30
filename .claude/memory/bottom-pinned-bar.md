# Bottom-pinned bars & the shell's scroll padding (July 2026)

## The constraint

`AppWrapper`'s `<main>` (the app's only scroll container) intentionally has
**`px-6 pt-6` and no bottom padding**. Pages own their own bottom spacing:

| Page | Bottom spacing |
|---|---|
| `AppHome` | none on the content wrapper — the pinned practice-mode bar *is* the bottom edge |
| `AppExam` | `pb-10` on the root (= the old `pb-4` + the shell's former `pb-6`) |
| `AppExercise` | `pb-6` on `ExerciseActive`'s root; the short centered states (`py-8`/`py-16`) don't need it |

**Do not "tidy" `px-6 pt-6` back into `p-6`.** It reintroduces the bug below.

## Why — the bug it fixes

A `sticky bottom-0` element can never be offset past its containing block. With
`p-6` on `<main>`, the scroll container's 24px bottom padding lives *outside*
the page wrapper, so Home's practice-mode bar parked 1.5rem above the
scrollport bottom **at every scroll position**, leaving a 24px strip through
which the scrolling lesson grid showed — card bottoms rendered *below* the bar,
which read as a floating strip pasted over the grid rather than a footer.
Reported from an iPhone screenshot; reproduces identically in Chromium
(measured: `main.bottom - bar.bottom === 24` at scrollTop 0, mid, and max).

## Rejected: `mb-[-1.5rem]` on the sticky child

That's what the original code did (`mt-auto sticky bottom-0 … pb-0
mx-[-1.5rem] mb-[-1.5rem]`), on the theory that a negative bottom margin lets
the bar spill into the scroll container's bottom padding. It does not — a
negative margin shrinks the *parent's* height accounting but does not extend
the containing-block clamp that bounds a sticky box, so the bar's border box
still stopped at the wrapper's bottom edge. Same for the variants: growing the
bar's own `pb` just moves its top up (the bottom stays clamped), and
`min-h-[calc(100%+3rem)]` + negative margin works but hardcodes the shell's
padding in the page. The containing block has to actually reach the scrollport
bottom; nothing else is load-bearing.

Also rejected: hoisting the bar out of `<main>` into `AppWrapper` as a flex
sibling of header/main. Structurally the nicest (the scroll area would shrink
instead of the grid scrolling under the bar) but `AppWrapper` wraps `<App/>`
from `main.tsx`, so a page-owned bar needs a context slot or a portal — real
machinery for one page's bar. Revisit if a second page wants a pinned bar.

## Safe-area insets

The bar carries `pb-[max(0.5rem,env(safe-area-inset-bottom))]`. `index.html`
sets `viewport-fit=cover`, so on iOS the frame extends under the home indicator
/ floating browser bar; the header already handles `safe-area-inset-top`, the
bottom was unhandled. The `0.5rem` floor also keeps the buttons off the
desktop phone-frame's `rounded-[2.5rem]` corner, which `pb-0` clipped.
