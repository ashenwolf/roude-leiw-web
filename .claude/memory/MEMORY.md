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
- [Not-yet-mastered bucket](not-yet-mastered-bucket.md) — Lesson Mode 30% bucket for current-lesson Elements with `correct < MASTERY_CORRECT_COUNT` so RNG can't strand stragglers below the unlock gate; **redefined 2026-07-21** from `shown`-based to `correct`-based to fix a permanent-stuck bug where well-shown-but-unmastered elements were abandoned. Also documents the **adaptive word-match/sentence slot-type split** (2026-07-21): Lesson Mode scales word-match share `clamp(unmasteredWords/backlog, 0.2, 0.6)` so word-heavy lessons get more matching practice
- [Lesson content sizing](lesson-content-sizing.md) — A1 lessons store nouns 3× (indefinite/definite/plural); dropped indefinite duplicates 2026-07-21; A1.02 still oversized at ~197 elements (progress bar crawls); definite+plural kept by design
- [Guest migration chunking](guest-migration-chunking.md) — guest→auth migration split into validator-bound chunks, clear-on-success; rejected server-side daily-history migration and client dedup state (June 2026); also phraseKey 64-char truncation + empty-pool dead-end guards
- [Home cascade & async words](home-cascade-async-words.md) — AppHome lesson cascade must depend on live words/unlockedLessons, not mount-time refs; auth resolves after mount so freezing them left next-lesson locked after a hard reload (June 2026 regression fix)
- [LOD MCP server](lod-mcp.md) — `tools/lod-mcp/` wraps the official lod.lu dictionary API as MCP tools (`lod_lookup`, `lod_suggest`) for authoritative LU translations + gender when authoring `.letz` content; zero-dep stdio server registered in `.mcp.json`
- [Passed gate & phrase directions](passed-gate-and-phrase-directions.md) — pass gate simplified to `correct>=3`; phrases stored per-direction but mastery sums both; error pool keeps direction to repeat the exact failed one (June 2026)
- [Bottom-pinned bar](bottom-pinned-bar.md) — `<main>` deliberately has no bottom padding (pages own their bottom spacing) so Home's sticky practice-mode bar can reach the frame's bottom edge; why the old `mb-[-1.5rem]` trick left a 24px strip of grid showing under the bar, and why the bar isn't hoisted into `AppWrapper` (July 2026)
- [Exam track](exam-track.md) — Sproochentest Prep design: parallel theme-first catalog (rejected pseudo-level), play-gate via `unlockedLessons` channel (**superseded 2026-08-01**, see below), manifest id authoritative over in-file id, deterministic chunk+shuffle planner, `@question` directive; Fix Errors is global across both tracks (`error-scope.ts`), Word Mix + Home stats stay course-scoped; LOD verification of shipped vocab still pending (July 2026)
- [Sentence endgame throughput](sentence-endgame-throughput.md) — the "stuck at 98%" bug: sentences were capped at one appearance per Session (+1 `correct` max) while words had no cap, so a sentence tail froze the lesson percentage for 3–5 Sessions; measurements, the `SentenceBudget` fix, and the known-but-unfixed cursor/feedback issues (Aug 2026)
- [Exam & lesson pass-gate](exam-and-lesson-pass-gate.md) — one unlock rule for both tracks: `UNLOCK_LESSON_THRESHOLD` 0.8 → **1.0**, and the exam track's play-gate becomes a pass-gate; why the play-marker stayed (sticky access + load/error scope), why `passed` implies `unlocked`, and why 100% raises the priority of splitting oversized lessons (Aug 2026)

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
