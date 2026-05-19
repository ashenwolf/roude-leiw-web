---
name: bundle-code-splitting
description: Code-splitting boundaries in the bundle — what's lazy-loaded, what stays eager, and why. Initial paint is ~40 KB gzipped (was 189 KB).
metadata:
  type: project
---

Three chunks after May 2026 split (verified by `npm run build`):

1. **Main (eager, ~40 KB gzipped)**: AppHome + AuthContext + persistence + ui/* + manifest loader + lesson-loader (light). Renders Home immediately from manifest titles.
2. **Chevrotain parser chunk (~136 KB gzipped)**: `src/lib/letz-parser/*`. Loaded dynamically inside `parseLetzContent` (`src/exercise/letz-parser.ts`) on first `fetchLesson` call. Parallelizes with the `.letz` fetch itself.
3. **AppExercise chunk (~15 KB gzipped)**: `WordMatch`, `SentenceBuilder`, `modes/*`, `session-reducer`, popups, debug panel. `React.lazy()` in `src/App.tsx`.

**Why:** Initial paint dropped 189 KB → 40 KB gzipped (~79% reduction). User intuition: section buttons + stats can render without progress while parser + lessons load.

**How to apply:**
- Never add a static `import` of `parseLetzContent` or anything from `src/lib/letz-parser` to a module reachable from `AppHome`'s eager tree — it would pull Chevrotain back into the main bundle.
- `parseLetzContent` is `async` for this reason; the dynamic `import("../lib/letz-parser")` inside is the split point. Don't "simplify" it to a sync call.
- When adding a new heavy module (parser, large lib, etc.), prefer dynamic import at the call site and a separate chunk over swelling the main bundle.
- The Error Boundary in `src/ui/AppWrapper.tsx` catches chunk-load failures from both `React.lazy` and dynamic imports — don't remove it.

Type-only imports of `Lesson`/`WordEntry`/etc. from `src/exercise/letz-parser.ts` are fine everywhere (erased at compile time). Runtime imports of `entriesToWordPairs` from that file are fine in the AppExercise tree.

Related: [[react-19-features-evaluation]] — the broader decision context for what we adopted.
