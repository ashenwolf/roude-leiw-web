# Project Memory — Index

Persistent notes for this codebase. Loaded by Claude every session via the rule in `CLAUDE.md` § "Memory — required reading and writing".

This is the **canonical** location. The home-dir auto-memory at `~/.claude/projects/-Users-gulenoks-Personal-roude-leiw-web/memory/` is a redirect to here and must not be edited.

## Memories

- [React 19 features evaluation](react-19-features-evaluation.md) — why Suspense/`use()`/`useOptimistic`/`useTransition`/etc. are intentionally NOT adopted; only Error Boundary + route lazy-load were taken
- [Bundle code-splitting](bundle-code-splitting.md) — Chevrotain dynamic-imported via `parseLetzContent`; AppExercise via `React.lazy`; initial paint is 40 KB gzipped
- [Audio pipeline](audio-pipeline.md) — ElevenLabs TTS for sentence audio; gitignored locally, R2 as source of truth. **Build hook disabled 2026-05-21** until app actually consumes audio.
- [PWA caching](pwa-caching.md) — service-worker runtime cache rules for `/assets/lessons/`; why we don't blanket-`CacheFirst` an index file, how to invalidate on deploy
- [Stats and XP redesign](stats-and-xp-redesign.md) — two mastery systems (live vs monotonic), sticky unlock, event-based XP, timer fixes, double-incorrect fix, orphan filtering (May 2026)
- [Progress sync on focus](progress-sync-on-focus.md) — visibility/focus/online listener refetches `/api/auth/me` for cross-device sync; 10s throttle; POST failures logged to PostHog (no retry queue yet, deliberate)
- [Under-exposed bucket](under-exposed-bucket.md) — Lesson Mode adds 30% bucket for current-lesson Elements with `shown < MIN_ANSWERS` so RNG can't strand stragglers below the unlock gate; binary cliff chosen over weighted 1/(1+shown) for consistency with the gate

## Maintenance rules

Update these files when:
- A design decision documented here is reversed or refined (update the file in the same commit)
- A file path or function name cited here is renamed, moved, or removed (update the citation)
- A new architectural decision lands that future sessions would benefit from remembering — write a new file and link it from this index

Do NOT write things derivable from reading current code or `git log`. Save what would otherwise be lost between sessions: design rationale, conscious tradeoffs, "we considered X and decided no, here's why."

## Lessons Learned

### Code Style

- **NEVER use `let` or `for` loops.** Always use functional patterns: `reduce`, `map`, `filter`, chaining, recursion. Imperative style is only acceptable when functional becomes genuinely unreadable (almost never).
- This applies to ALL code — backend workers, frontend React, utility functions, everything.

### File Organization

- **Entry points should be thin.** Worker/app entry points wire things together — routing, middleware — but contain no business logic. Split handlers and logic into separate modules.
- Avoid large files that mix concerns. Each file should have a single clear responsibility.
