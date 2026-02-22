# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Vite dev server
npm run build        # TypeScript compile + Vite build (tsc -b && vite build)
npm run lint         # ESLint
npm run preview      # Preview production build locally
npm run deploy       # Build and deploy to Cloudflare Pages
```

No test runner is configured.

## What This App Is

**Roude Leiw** is a Luxembourgish language learning SPA. Users match Luxembourgish words to their English translations across levels (A1–C2) in themed lessons. There's also a "madness" mode that mixes all levels.

Deployed to Cloudflare Pages as a fully static React app (no backend).

## Tech Stack

- React 19 + TypeScript (strict) + Tailwind CSS 4
- Vite 7 with Babel React Compiler (automatic memoization)
- Chevrotain for parsing `.letz` lesson files
- Cloudflare Pages (deployment target)

## Architecture

### Navigation

Context-based router (`src/context/`). Only two pages: `"home"` and `"exercise"`. The `NavigationContext` holds `currentPage` + `params` (exercise mode: `"lesson"` | `"madness"`). Navigate by calling `setPage()` from `useNavigation()`.

### Exercise Session Flow

`src/exercise/use-exercise-session.ts` is the main orchestrator. It:
1. Calls `lesson-loader.ts` to fetch the lesson manifest (`/assets/lessons/manifest.json`), then individual `.letz` files
2. Parses `.letz` files via `src/lib/letz-parser.ts` (a facade over the Chevrotain parser in `src/lib/letz-parser/`)
3. Splits word pairs into 3 batches of ~20 pairs
4. Tracks time only while the browser tab is focused

### Game State Machine

`src/exercise/WordMatch/use-game.ts` manages the matching game. Key concepts:
- 5 visible slots per side (left: Luxembourgish, right: English)
- Slot states are a discriminated union: `active → selected → (match/fail) → fading → empty`
- Incorrect matches reset after 1 second
- When a round completes, unmatched pairs reshuffle into remaining fading slots

### Persistence

`src/persistence/PersistContext.tsx` wraps a localStorage adapter. It provides hooks for reading/writing `UserProgress`, `UserPreferences`, and `LearningStatistics`. Uses schema versioning (`CURRENT_SCHEMA_VERSION`) with a migration system in `src/persistence/migrations/`. Updates are optimistic with rollback on failure.

Word mastery is calculated per-lesson from per-word stats (`correctCount`, `incorrectCount`, `timesShown`) via `src/persistence/utils/mastery.ts`. A lesson must be mastered before the next unlocks.

### Lesson File Format (`.letz`)

Custom DSL parsed by Chevrotain. Files live at `/assets/lessons/{level}/{filename}.letz`. Structure: metadata block (title, level, id) + word entries (`lu`/`en` pairs). The parser lives in `src/lib/letz-parser/` (lexer → parser → visitor → AST). The facade at `src/lib/letz-parser.ts` exposes `entriesToWordPairs()` and `combineAndShuffleEntries()`.

### Development

- Try to analyze several ideas and provide options to human to pick from.
- With every implementation check if it can be generalized and reused.

### Self-improvement

- Every time user makes a correction, the lessons learnt is added to the .claude/lessons.md, and check thsi file to to prevent repeating mistakes.
