# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Vite dev server (includes local worker + KV emulation)
npm run build        # TypeScript compile + Vite build (tsc -b && vite build)
npm run lint         # ESLint
npm run preview      # Preview production build locally
npm run deploy       # Build and deploy to Cloudflare Pages
```

No test runner is configured.

## What This App Is

**Roude Leiw** is a Luxembourgish language learning SPA. Users match Luxembourgish words to their English translations across levels (A1–C2) in themed lessons. There's also a "madness" mode that mixes all levels.

Deployed to Cloudflare Pages with a Cloudflare Worker backend for auth and persistence.

## Tech Stack

- React 19 + TypeScript (strict) + Tailwind CSS 4
- Vite 7 with `@cloudflare/vite-plugin` + Babel React Compiler (automatic memoization)
- Chevrotain 11 for parsing `.letz` lesson files
- Cloudflare Workers (backend API) + KV (persistence + sessions)
- Google OAuth 2.0 for authentication

## Project Structure

```
src/
├── main.tsx                          # App entry point (React root + providers)
├── App.tsx                           # Root component, page routing
├── App.css                           # Global app styles
├── index.css                         # Tailwind imports & theme config
│
├── context/                          # App-wide state (React Context)
│   ├── navigation.ts                 # Types: AppPages, NavigationContext
│   ├── NavigationContext.tsx         # Navigation provider
│   ├── useNavigation.ts              # Hook: useNavigation()
│   ├── auth.ts                       # Types: User, AuthState, AuthContextType
│   ├── AuthContext.tsx               # Auth provider (fetches /api/auth/me on mount)
│   └── useAuth.ts                    # Hook: useAuth()
│
├── page/                             # Top-level page components
│   ├── AppHome.tsx                   # Home/lesson selection page
│   └── AppExercise.tsx              # Exercise/game page (wires progress sync)
│
├── exercise/                         # Core game logic
│   ├── use-exercise-session.ts       # Main orchestrator hook
│   ├── lesson-loader.ts              # Fetches manifest + .letz files
│   ├── letz-parser.ts                # Facade: entriesToWordPairs(), combineAndShuffleEntries()
│   └── WordMatch/                    # Matching game
│       ├── index.tsx                 # Game UI (left/right columns)
│       ├── use-game.ts               # Game state machine + word result tracking
│       └── types.ts                  # WordPair, SlotState, GameState, WordResultMap
│
├── persistence/                      # Backend sync
│   └── hooks/
│       └── use-progress-sync.ts      # Syncs word results to /api/progress/sync
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
    ├── AppWrapper.tsx                # App shell (header, mobile frame, wraps AuthProvider)
    ├── UserMenu.tsx                  # Sign-in button / user avatar
    ├── Button.tsx                    # Primary action button
    ├── Pill.tsx                      # Status pill (blanc/selected/success/fail)
    ├── FadingPill.tsx                # Pill with fade-out animation
    ├── ProgressBar.tsx               # Segmented batch progress indicator
    └── Popup.tsx                     # Modal (milestone & celebration variants)

worker/
├── index.ts                          # Worker entry point (thin: router wiring only)
├── router.ts                         # Table-driven router + session middleware
├── types.ts                          # Shared types (Env, UserData, KV shapes, API types)
├── handlers/
│   ├── auth.ts                       # Google OAuth handlers (initiate, callback, me, logout)
│   └── progress.ts                   # Progress sync handler
└── lib/
    ├── session.ts                    # KV session CRUD + cookie helpers
    ├── user.ts                       # KV user CRUD + pure data transforms (merge, streak)
    └── oauth/
        ├── types.ts                  # OAuthUserInfo type
        └── google.ts                 # Google OAuth (auth URL + code exchange)

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

### Authentication

Google OAuth 2.0 via Cloudflare Worker. Flow:
1. User clicks "Sign in" → `GET /api/auth/google` → redirects to Google
2. Google redirects back to `/api/auth/callback` with authorization code
3. Worker exchanges code for user profile, upserts user in KV, creates session
4. Session ID stored in HttpOnly cookie (7-day TTL in KV)
5. Frontend fetches `GET /api/auth/me` on mount to restore auth state

Guest mode is preserved — the app works without login; auth is additive.

### Persistence (KV)

All user data stored as a single JSON blob per user in Cloudflare KV:

```
Key: "user:{userId}" → { profile, words, dailySessions }
Key: "email:{email}" → userId (login lookup)
Key: "session:{id}"  → { userId, createdAt } (TTL 7 days)
Key: "csrf:{state}"  → { provider } (TTL 10 min)
```

**Word tracking**: Each word keyed as `"{lu}|{en}"` with `{ shown, correct, incorrect }` counters.

**Lesson completion** (computed, not stored): A lesson is cleared when every word in it has `shown >= 5` and `correct / (correct + incorrect) >= 0.80`.

**Streaks**: Computed on-the-fly from `dailySessions` keys (dates). No separate streak field.

**Daily sessions**: Keyed by date (`"YYYY-MM-DD"`). Same-day activity aggregates into one entry.

### Navigation

Context-based router (`src/context/`). Only two pages: `"home"` and `"exercise"`. Navigate by calling `navigateTo()` from `useNavigation()`.

### Exercise Session Flow

`src/exercise/use-exercise-session.ts` is the main orchestrator. It:
1. Calls `lesson-loader.ts` to fetch the lesson manifest, then individual `.letz` files
2. Parses `.letz` files via the Chevrotain parser facade
3. Splits word pairs into 3 batches of ~20 pairs
4. Tracks per-word results (shown/correct/incorrect) via `WordResultMap` in game state
5. Syncs word results to backend after each batch via `useProgressSync`

### Game State Machine

`src/exercise/WordMatch/use-game.ts` manages the matching game. Key concepts:
- 5 visible slots per side (left: Luxembourgish, right: English)
- Slot states are a discriminated union: `active → selected → (match/fail) → fading → empty`
- Incorrect matches reset after 1 second
- When a round completes, unmatched pairs reshuffle into remaining fading slots
- `wordResults` tracked atomically in `GameState` — correct/incorrect/shown per word pair

### API Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/auth/google` | No | Redirect to Google OAuth |
| GET | `/api/auth/callback` | No | OAuth callback → create session |
| GET | `/api/auth/me` | No | Current user + progress (or null) |
| POST | `/api/auth/logout` | Yes | Clear session |
| POST | `/api/progress/sync` | Yes | Merge word results + daily session |

### Lesson File Format (`.letz`)

Custom DSL parsed by Chevrotain. Files live at `public/assets/lessons/{level}/{filename}.letz`.

```
@lesson A1.01 "Basic Greetings"

Moien = good morning
Äddi = bye
Merci = thanks
```

### Development

- Try to analyze several ideas and provide options to human to pick from.
- With every implementation check if it can be generalized and reused.

### Self-improvement

- Every time user makes a correction, the lessons learnt is added to the `.claude/lessons.md`, and check this file to prevent repeating mistakes.
