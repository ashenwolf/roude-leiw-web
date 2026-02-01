# Roude Leiw

A Luxembourgish language learning web application built with React, TypeScript, and Tailwind CSS. The name "Roude Leiw" (Red Lion) references Luxembourg's national symbol.

## Overview

Roude Leiw is a mobile-first language learning app that helps users learn Luxembourgish vocabulary through interactive exercises. The app features a clean, Duolingo-inspired UI with gamified learning elements.

### Current Features

- **Lesson System**: Dynamic lesson loading from `.letz` files
  - Custom `.letz` file format for word pairs (Luxembourgish = English)
  - Manifest-based lesson organization by CEFR levels (A1, A2, B1, etc.)
  - 4 A1 lessons included: Greetings, Numbers, Family, Food
  - Support for multiple translations per word
  - Automatic lesson shuffling for variety

- **Exercise Session Management**: Batch-based learning progression
  - Configurable batch size (default: 20 pairs) and count (default: 3 batches)
  - Session states: `loading` → `ready` → `active` → `batch_complete` → `session_complete`
  - Progress tracking within and across batches
  - Milestone popups between batches with auto-dismiss
  - Celebration popup on session completion

- **Word Matching Exercise**: Match Luxembourgish words with English translations
  - Slot-based state machine: `active` → `selected` → `fading` → `active`/`empty`
  - Displays up to 5 pairs at a time (configurable via `DISPLAY_SLOTS`)
  - Dynamic pair replacement: matched pairs fade out and are replaced with new pairs
  - Cross-randomization: new pairs appear in reshuffled positions for variety
  - Fail state with auto-reset after 1 second for incorrect matches
  - Match progress callback for real-time progress tracking

- **Progress Bar**: Segmented visual progress indicator
  - Shows all batches as segments with individual fill states
  - Current batch highlighted with ring indicator
  - Smooth animations for progress updates

- **Visual Feedback**: Color-coded pill status (`blanc`, `selected`, `success`, `fail`)
- **Smooth Animations**: Fading effects for matched pairs, slide-up popups
- **Mobile-First Design**: Optimized for mobile devices with desktop preview frame

## Tech Stack

- **React 19** with React Compiler enabled
- **TypeScript** for type safety
- **Vite 7** for fast development and building
- **Tailwind CSS 4** for styling
- **Cloudflare Pages** for deployment

## Project Structure

```
src/
├── main.tsx              # App entry point with providers
├── App.tsx               # Root component with page routing
├── App.css               # Global app styles
├── index.css             # Tailwind imports and theme
│
├── context/              # React Context for global state
│   ├── navigation.ts     # Navigation types and context definition
│   ├── NavigationContext.tsx  # Navigation provider component
│   └── useNavigation.ts  # Navigation hook for consuming context
│
├── page/                 # Page components (screens)
│   ├── AppHome.tsx       # Home/landing page
│   └── AppExercise.tsx   # Exercise page with session management
│
├── exercise/             # Exercise components (learning activities)
│   ├── letz-parser.ts          # Parser for .letz lesson files
│   ├── lesson-loader.ts        # Lesson fetching and manifest handling
│   ├── use-exercise-session.ts # Session state management hook
│   └── WordMatch/              # Word matching game
│       ├── index.tsx           # UI component with WordColumn sub-component
│       ├── use-game.ts         # Game state hook (slot machine, matching logic)
│       └── types.ts            # Type definitions (WordPair, SlotState, GameState)
│
└── ui/                   # Reusable UI components
    ├── index.ts          # UI exports and color maps
    ├── AppWrapper.tsx    # App shell with header and mobile frame
    ├── Button.tsx        # Primary action button
    ├── Pill.tsx          # Status-aware pill/chip component
    ├── FadingPill.tsx    # Pill with fade-out animation
    ├── ProgressBar.tsx   # Segmented batch progress indicator
    └── Popup.tsx         # Modal/popup with milestone & celebration variants

public/
└── assets/
    └── lessons/
        ├── manifest.json       # Lesson index by level
        └── A1/                 # A1 level lessons
            ├── 01_greetings.letz
            ├── 02_numbers.letz
            ├── 03_family.letz
            └── 04_food.letz
```

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Opens at `http://localhost:5173`

### Build

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Extending the Application

### Adding a New Page

1. **Create the page component** in `src/page/`:

```tsx
// src/page/AppProfile.tsx
import { useNavigation } from "../context/useNavigation";
import { Button } from "../ui/Button";

export const AppProfile = () => {
  const { navigateTo } = useNavigation();
  return (
    <div>
      <h1>Profile</h1>
      <Button onClick={() => navigateTo("home")}>Back</Button>
    </div>
  );
};
```

2. **Register the page** in `src/context/navigation.ts`:

```tsx
export type AppPages = "home" | "exercise" | "profile"; // Add new page
```

3. **Add to the page mapper** in `src/App.tsx`:

```tsx
import { AppProfile } from "./page/AppProfile";

const PageMapper = {
  home: AppHome,
  exercise: AppExercise,
  profile: AppProfile, // Add mapping
};
```

### Adding a New Exercise

1. **Create the exercise component** in `src/exercise/`:

```tsx
// src/exercise/FillBlank.tsx
import { useState } from "react";
import { Pill } from "../ui";

export const FillBlank = () => {
  const [answer, setAnswer] = useState("");
  
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold">Complete the sentence</h2>
      {/* Exercise implementation */}
    </div>
  );
};
```

2. **Use it in a page**:

```tsx
// src/page/AppExercise.tsx
import { FillBlank } from "../exercise/FillBlank";
```

### Adding New Lessons

1. **Create a `.letz` file** in `public/assets/lessons/{level}/`:

```
# public/assets/lessons/A1/05_colors.letz

@lesson A1.05 "Colors"

rout = red
gréng = green
blo = blue
giel = yellow
wäiss = white
schwaarz = black
```

**Format:**
- Lines starting with `#` are comments
- `@lesson ID "Title"` defines lesson metadata
- `LU = EN` defines word pairs (Luxembourgish = English)
- Same LU word can have multiple EN translations (add multiple lines)

2. **Register in manifest** (`public/assets/lessons/manifest.json`):

```json
{
  "levels": [
    {
      "id": "A1",
      "lessons": [
        { "id": "01_greetings", "file": "01_greetings.letz" },
        { "id": "05_colors", "file": "05_colors.letz" }
      ]
    }
  ]
}
```

### Adding a New UI Component

1. **Create the component** in `src/ui/`:

```tsx
// src/ui/Badge.tsx
type BadgeProps = {
  label: string;
  variant?: "default" | "success" | "warning";
};

export const Badge = ({ label, variant = "default" }: BadgeProps) => {
  const variantStyles = {
    default: "bg-gray-100 text-gray-700",
    success: "bg-green-100 text-green-700",
    warning: "bg-yellow-100 text-yellow-700",
  };

  return (
    <span className={`px-2 py-1 rounded-full text-sm font-medium ${variantStyles[variant]}`}>
      {label}
    </span>
  );
};
```

2. **Export from index** in `src/ui/index.ts`:

```tsx
export { Badge } from "./Badge";
```

### Using the WordMatch Exercise

The `WordMatch` component accepts word pairs as props and supports dynamic replacement:

```tsx
import { WordMatch } from "../exercise/WordMatch";

import type { WordPair } from "../exercise/WordMatch/types";

const WordPairs: WordPair[] = [
  ["Moien", "Hello"],
  ["Äddi", "Goodbye"],
  ["Merci", "Thank you"],
  ["Jo", "Yes"],
  ["Nee", "No"],
  // Add as many pairs as you want - only 5 are shown at a time
  ["W.e.g.", "Please"],
  ["Gudde Moien", "Good morning"],
];

export const MyExercise = () => {
  const handleComplete = () => {
    console.log("All pairs matched!");
  };

  const handleMatch = (matchedCount: number, totalPairs: number) => {
    console.log(`Progress: ${matchedCount}/${totalPairs}`);
  };

  return (
    <WordMatch 
      pairs={WordPairs} 
      onComplete={handleComplete}
      onMatch={handleMatch}
    />
  );
};
```

**Props:**
- `pairs`: Array of `WordPair` tuples (`[string, string]`) - `[Luxembourgish, English]`
- `onComplete`: Optional callback fired when all pairs are successfully matched
- `onMatch`: Optional callback fired on each successful match with `(matchedCount, totalPairs)`

**Behavior:**
- Displays up to 5 pairs at a time (configurable via `DISPLAY_SLOTS` constant)
- Each slot has a state machine: `active` → `selected` → `fading` → `active`/`empty`
- Incorrect matches trigger `fail` state with auto-reset after 1 second
- When a pair is matched, it fades out and is replaced with a new pair from the pool
- New pairs appear in cross-randomized positions for variety (Duolingo-inspired)

### Using the Exercise Session Hook

For full session management with batches and progress tracking:

```tsx
import { useExerciseSession } from "../exercise/use-exercise-session";
import { WordMatch } from "../exercise/WordMatch";
import { ProgressBar } from "../ui/ProgressBar";
import { MilestonePopup, CelebrationPopup } from "../ui/Popup";

export const MyExercisePage = () => {
  const {
    state,
    currentBatch,
    totalBatches,
    currentBatchPairs,
    batchProgress,
    startSession,
    handleBatchComplete,
    handleMatchProgress,
    dismissMilestone,
    resetSession,
  } = useExerciseSession({
    userLevel: "A1",  // Load A1 lessons
    batchSize: 20,    // 20 pairs per batch
    batchCount: 3,    // 3 batches total
  });

  if (state === "ready") {
    return <button onClick={startSession}>Start</button>;
  }

  return (
    <>
      <ProgressBar
        batchProgress={batchProgress}
        currentBatch={currentBatch}
        totalBatches={totalBatches}
      />
      <WordMatch
        key={`batch-${currentBatch}`}
        pairs={currentBatchPairs}
        onComplete={handleBatchComplete}
        onMatch={handleMatchProgress}
      />
      <MilestonePopup
        visible={state === "batch_complete"}
        onDismiss={dismissMilestone}
        batchNumber={currentBatch + 1}
        totalBatches={totalBatches}
      />
      <CelebrationPopup
        visible={state === "session_complete"}
        onDismiss={() => {}}
        onTryAgain={resetSession}
      />
    </>
  );
};
```

**Session States:**
- `loading`: Fetching lessons from manifest
- `error`: Failed to load lessons
- `ready`: Lessons loaded, waiting to start
- `active`: Exercise in progress
- `batch_complete`: Batch finished, showing milestone popup
- `session_complete`: All batches finished, showing celebration popup

## Architecture Decisions

### Navigation

The app uses a simple React Context-based navigation instead of React Router. This keeps the bundle small and works well for the current scope. The navigation state is managed in `NavigationContext` and consumed via the `useNavigation` hook.

**To add URL-based routing later**: Replace the context-based navigation with React Router while keeping the same `navigateTo` and `currentPage` API.

### UI Component Patterns

- **Status-based styling**: Components like `Pill` accept a `status` prop that maps to predefined color schemes
- **Color maps**: Centralized in `src/ui/index.ts` for consistency
- **Composition**: `FadingPill` wraps `Pill` to add animation behavior

### Mobile-First Design

The `AppWrapper` component creates a mobile viewport simulation on desktop:
- Full-screen on mobile devices
- Centered 430×932px frame on desktop (iPhone 14 Pro Max dimensions)
- Consistent experience across devices

### State Management

- **Local state**: Exercise state (selections, answers) lives in exercise components
- **Context**: Navigation state is global via React Context
- **No external state library**: The app is simple enough to not need Redux/Zustand

## UI Color System

Colors are defined in `src/ui/index.ts`:

```tsx
export const UiColorMap = {
  primary: ["bg-lime-300", "hover:bg-lime-500", "inset-shadow-lime-500"],
  secondary: [],
};
```

Pill statuses in `src/ui/Pill.tsx`:

| Status | Use Case | Colors |
|--------|----------|--------|
| `blanc` | Default/unselected | Gray |
| `selected` | Currently selected | Sky blue |
| `success` | Correct answer | Green |
| `fail` | Wrong answer | Rose/Red |

Progress bar colors:
- **Current batch progress**: Lime (`bg-lime-400`) with ring indicator
- **Completed batches**: Green (`bg-green-500`)
- **Empty segments**: Gray (`bg-gray-200`)

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed Cloudflare Pages deployment instructions.

### Quick Deploy

```bash
# Login to Cloudflare (first time)
npx wrangler login

# Build and deploy
npm run deploy
```

## Future Extension Ideas

- [ ] Multiple exercise types (listening, speaking, fill-in-blank)
- [ ] Progress tracking with local storage
- [ ] Spaced repetition algorithm
- [ ] User accounts and cloud sync
- [x] ~~Lesson categories (greetings, numbers, food, etc.)~~ - Implemented via `.letz` files
- [ ] Audio pronunciation
- [ ] Streak tracking and gamification
- [ ] Additional CEFR levels (A2, B1, B2, C1, C2)
- [ ] Lesson selection UI

## Scripts Reference

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |
| `npm run deploy` | Build and deploy to Cloudflare |

## License

See [LICENSE.md](./LICENSE.md)
