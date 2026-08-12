# Project structure — full file tree

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
│   ├── AppExam.tsx                   # Exam-track theme page (Sproochentest Prep)
│   └── AppExercise.tsx              # Exercise/game page (wires progress sync)
│
├── exam/                             # Exam track — parallel to the course catalog
│   ├── exam-catalog.ts               # ExamManifest/SubLessonMeta types + loaders (theme-first, no level)
│   └── exam-progression.ts           # Pure: computeExamView (pass-gate unlock), selectSubLessonsToLoad
│
├── exercise/                         # Core game logic — producer pipeline (see CLAUDE.md Glossary + .claude/reference/mode-specs.md for layers/terms)
│   ├── use-exercise-session.ts       # Hook: thin wiring (load + dispatch only)
│   ├── lesson-loader.ts              # Producer: manifest → LessonMeta[] (cheap); .letz files → Lesson (lazy, per Session)
│   ├── letz-parser.ts                # Facade: entriesToWordPairs()
│   ├── constants.ts                  # All mode/slot/threshold constants — no magic numbers below this
│   ├── mode-config.ts                # Layer 3 contract: SessionMode, ModeConfig, CompletionEffect types
│   ├── session-reducer.ts            # SessionMachine reducer (Mode-agnostic)
│   ├── session-progress.ts           # Pure producer: computeProgressView(blockBoundaries)
│   ├── error-pool.ts                 # Layer 0: selectErrorPool(stats, lessons) → { words, phrases, fills }
│   ├── error-scope.ts                # Producer: loadErrorScopeLessons — global (course + played/unlocked exam) pool
│   ├── lesson-image.ts               # Pure: resolveLessonImage (@image/@image-alt → src or text placeholder)
│   ├── selection.ts                  # Layer 1 primitives (bucketedPick, pickPair, pickSentence, pickFill)
│   ├── exercise-builders.ts          # Layer 1 builders (buildWordMatchExercise/buildSentenceExercise/buildFillExercise, tokenizeSentence)
│   ├── types.ts                      # Exercise discriminated union (word-match | sentence-builder | fill-blank)
│   ├── progression.ts                # Pure derivations: classifyWord, computeLessonProgress, computeUnlockedLessonIds
│   ├── lesson-rows.ts                # Producer: (lessons, userWords) → HomeLessonsView
│   ├── modes/                        # Layer 4 — Mode planners (each returns ModeConfig; specs in .claude/reference/mode-specs.md)
│   │   ├── lesson.ts
│   │   ├── word-mix.ts
│   │   ├── fix-errors.ts
│   │   └── exam.ts
│   ├── FillBlank/                    # Fill-in-words game — index.tsx (UI), use-fill-game.ts (wiring), fill-logic.ts (pure), types.ts
│   ├── SentenceBuilder/              # Sentence assembly game — same split as FillBlank
│   └── WordMatch/                    # Matching game — same split as FillBlank
│
├── persistence/                      # Backend sync
│   ├── migration.ts                  # Pure: buildMigrationChunks — splits guest totals into validator-bound sync payloads
│   └── hooks/
│       └── use-progress-sync.ts      # Syncs word results to /api/progress/sync (returns success boolean)
│
├── lib/                              # Shared libraries
│   ├── shuffle.ts                    # Single Fisher–Yates shuffle for the whole app
│   ├── streak.ts                     # Shared computeStreak — imported by both worker and client
│   ├── stats-merge.ts                # Client-side mergeWordStats/mergeDailySession (mirrors worker merge)
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
    ├── SubLessonPath.tsx             # Exam theme path (vertical node list, play/lock states)
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
└── assets/
    ├── lessons/
    │   ├── manifest.json             # Course index by CEFR level → sections → lessons
    │   └── A1/A1.1/*.letz            # Course content (A1 lessons)
    └── exam/
        ├── manifest.json             # Exam index: themes → subLessons; each theme has
        │                             #   kind: "topic" | "picture" (no level dimension)
        ├── vacation/*.letz           # topic theme: 01_vocabulary, 02_phrases, 03_questions
        ├── family/*.letz             # same three-step pattern per topic theme
        └── picture/                  # picture themes — one directory per photo
            └── schueberfouer/
                ├── 0{1,2,3}_*.letz   # general / people / weather, all describing one photo
                └── img/*.webp        # optimized: 16:9, ≤880px (see .claude/memory/picture-description-theme.md for the recipe)
```
