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
- Chevrotain 11 for parsing `.letz` lesson files
- Cloudflare Pages (deployment target)

## Project Structure

```
src/
├── main.tsx                          # App entry point (React root + providers)
├── App.tsx                           # Root component, page routing
├── App.css                           # Global app styles
├── index.css                         # Tailwind imports & theme config
│
├── context/                          # Navigation state
│   ├── navigation.ts                 # Types: AppPages, NavigationContext
│   ├── NavigationContext.tsx         # Context provider
│   └── useNavigation.ts              # Hook: useNavigation()
│
├── page/                             # Top-level page components
│   ├── AppHome.tsx                   # Home/lesson selection page
│   └── AppExercise.tsx              # Exercise/game page
│
├── exercise/                         # Core game logic
│   ├── use-exercise-session.ts       # Main orchestrator hook
│   ├── lesson-loader.ts              # Fetches manifest + .letz files
│   ├── letz-parser.ts                # Facade: entriesToWordPairs(), combineAndShuffleEntries()
│   └── WordMatch/                    # Matching game
│       ├── index.tsx                 # Game UI (left/right columns)
│       ├── use-game.ts               # Game state machine
│       └── types.ts                  # WordPair, SlotState, GameState
│
├── lib/                              # Shared libraries
│   └── letz-parser/                  # Chevrotain parser implementation
│       ├── index.ts                  # Main exports
│       ├── lexer.ts                  # Tokenizer
│       ├── parser.ts                 # Grammar definition
│       └── visitor.ts                # AST visitor → structured data
│
└── ui/                               # Reusable UI components
    ├── index.ts                      # Barrel exports + color maps
    ├── AppWrapper.tsx                # App shell (header, mobile frame)
    ├── Button.tsx                    # Primary action button
    ├── Pill.tsx                      # Status pill (blanc/selected/success/fail)
    ├── FadingPill.tsx                # Pill with fade-out animation
    ├── ProgressBar.tsx               # Segmented batch progress indicator
    └── Popup.tsx                     # Modal (milestone & celebration variants)

public/
└── assets/lessons/
    ├── manifest.json                 # Lesson index by CEFR level
    └── A1/                           # Currently only A1 lessons exist
        ├── 01_greetings.letz
        ├── 02_numbers.letz
        ├── 03_family.letz
        ├── 04_food.letz
        └── 05_basic_words.letz
```

## Architecture

### Navigation

Context-based router (`src/context/`). Only two pages: `"home"` and `"exercise"`. The `NavigationContext` holds `currentPage` + `params` (exercise mode: `"lesson"` | `"madness"`). Navigate by calling `setPage()` from `useNavigation()`.

### Exercise Session Flow

`src/exercise/use-exercise-session.ts` is the main orchestrator. It:
1. Calls `lesson-loader.ts` to fetch the lesson manifest (`/assets/lessons/manifest.json`), then individual `.letz` files
2. Parses `.letz` files via `src/exercise/letz-parser.ts` (a facade over the Chevrotain parser in `src/lib/letz-parser/`)
3. Splits word pairs into 3 batches of ~20 pairs
4. Tracks time only while the browser tab is focused

### Game State Machine

`src/exercise/WordMatch/use-game.ts` manages the matching game. Key concepts:
- 5 visible slots per side (left: Luxembourgish, right: English)
- Slot states are a discriminated union: `active → selected → (match/fail) → fading → empty`
- Incorrect matches reset after 1 second
- When a round completes, unmatched pairs reshuffle into remaining fading slots

### Persistence

Not yet implemented. `src/persistence/` does not exist. Progress, preferences, and statistics are not currently persisted between sessions.

### Lesson File Format (`.letz`)

Custom DSL parsed by Chevrotain. Files live at `public/assets/lessons/{level}/{filename}.letz`. Structure: metadata block + word entries (`lu`/`en` pairs).

```
@lesson A1.01 "Basic Greetings"

Moien = good morning
Äddi = bye
Merci = thanks
```

The parser lives in `src/lib/letz-parser/` (lexer → parser → visitor → AST). The facade at `src/exercise/letz-parser.ts` exposes `entriesToWordPairs()` and `combineAndShuffleEntries()`.

### Development

- Try to analyze several ideas and provide options to human to pick from.
- With every implementation check if it can be generalized and reused.

### Self-improvement

- Every time user makes a correction, the lessons learnt is added to the `.claude/lessons.md`, and check this file to prevent repeating mistakes.
