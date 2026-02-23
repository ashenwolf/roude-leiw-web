# Roude Leiw

A Luxembourgish language learning web application built with React, TypeScript, and Tailwind CSS. The name "Roude Leiw" (Red Lion) references Luxembourg's national symbol.

## Overview

Roude Leiw is a mobile-first language learning app that helps users learn Luxembourgish vocabulary through interactive exercises. The app features a clean, Duolingo-inspired UI with gamified learning elements.

### Features

- **Word Matching Exercise**: Match Luxembourgish words with English translations
  - Slot-based state machine with smooth animations
  - Dynamic pair replacement (matched pairs fade out, new pairs appear)
  - Fail state with auto-reset after 1 second
  - Per-word tracking (shown, correct, incorrect)

- **Lesson System**: Dynamic lesson loading from `.letz` files
  - Custom `.letz` file format for word pairs
  - Manifest-based lesson organization by CEFR levels (A1-C2)
  - Lesson completion: word seen 5+ times with 80%+ accuracy

- **Exercise Sessions**: Batch-based learning progression
  - 3 batches of ~20 pairs per session
  - Milestone popups between batches, celebration on completion
  - Progress synced to backend after each batch

- **Authentication**: Google OAuth 2.0
  - Guest mode preserved (app works without login)
  - Session-based auth via HttpOnly cookies

- **Persistence**: Per-word stats, daily sessions, streaks (computed from activity)

## Tech Stack

- **Frontend**: React 19, TypeScript (strict), Tailwind CSS 4, Vite 7
- **Backend**: Cloudflare Workers
- **Storage**: Cloudflare KV
- **Auth**: Google OAuth 2.0
- **Parser**: Chevrotain 11 (custom `.letz` lesson format)

## Local Development

```bash
npm install
npm run dev
```

Starts Vite with the Cloudflare plugin, which emulates the Worker and KV locally. Opens at `http://localhost:5173`.

## Deployment

### Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up)
- Node.js 18+
- Google Cloud project with OAuth 2.0 credentials

### Step 1: Login to Cloudflare

```bash
npx wrangler login
```

### Step 2: Create KV Namespace

```bash
npx wrangler kv namespace create KV
```

Copy the output `id` and update `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "KV"
id = "<your-kv-namespace-id>"
```

### Step 3: Configure Google OAuth

1. Go to [Google Cloud Console > Credentials](https://console.cloud.google.com/apis/credentials)
2. Create an OAuth 2.0 Client ID (Web application type)
3. Add authorized redirect URI: `https://<your-domain>/api/auth/callback`
4. For local dev, also add: `http://localhost:5173/api/auth/callback`

### Step 4: Set Secrets

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

### Step 5: Update APP_URL

In `wrangler.toml`, set your production domain:

```toml
[vars]
APP_URL = "https://your-app.pages.dev"
```

### Step 6: Deploy

```bash
npm run deploy
```

Builds the frontend + worker and deploys to Cloudflare.

## Project Structure

```
src/                  # React frontend (SPA)
├── context/          # Auth + navigation contexts
├── page/             # Page components (Home, Exercise)
├── exercise/         # Game logic + word matching
├── persistence/      # Backend sync hooks
├── lib/              # Chevrotain parser for .letz files
└── ui/               # Reusable UI components

worker/               # Cloudflare Worker backend
├── handlers/         # Auth + progress API handlers
└── lib/              # Session, user, OAuth helpers

public/assets/lessons/ # Static .letz lesson files
```

See [CLAUDE.md](./CLAUDE.md) for detailed architecture documentation.

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

Create a `.letz` file in `public/assets/lessons/{level}/`:

```
@lesson A1.05 "Colors"

rout = red
gréng = green
blo = blue
giel = yellow
```

Register it in `public/assets/lessons/manifest.json`:

```json
{
  "levels": [
    {
      "id": "A1",
      "lessons": [
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

const variantStyles = {
  default: "bg-gray-100 text-gray-700",
  success: "bg-green-100 text-green-700",
  warning: "bg-yellow-100 text-yellow-700",
} as const;

export const Badge = ({ label, variant = "default" }: BadgeProps) => (
  <span className={`px-2 py-1 rounded-full text-sm font-medium ${variantStyles[variant]}`}>
    {label}
  </span>
);
```

2. **Export from index** in `src/ui/index.ts`:

```tsx
export { Badge } from "./Badge";
```

### Using the WordMatch Exercise

The `WordMatch` component accepts word pairs and tracks per-word results:

```tsx
import { WordMatch } from "../exercise/WordMatch";

import type { WordPair, WordResultMap } from "../exercise/WordMatch/types";

const pairs: WordPair[] = [
  ["Moien", "Hello"],
  ["Äddi", "Goodbye"],
  ["Merci", "Thank you"],
  ["Jo", "Yes"],
  ["Nee", "No"],
  // Add as many pairs as you want — only 5 are shown at a time
  ["W.e.g.", "Please"],
  ["Gudde Moien", "Good morning"],
];

export const MyExercise = () => {
  const handleComplete = (wordResults: WordResultMap) => {
    console.log("All pairs matched!", wordResults);
  };

  const handleMatch = (matchedCount: number, totalPairs: number) => {
    console.log(`Progress: ${matchedCount}/${totalPairs}`);
  };

  return (
    <WordMatch
      pairs={pairs}
      onComplete={handleComplete}
      onMatch={handleMatch}
    />
  );
};
```

**Props:**
- `pairs`: Array of `WordPair` tuples (`[string, string]`) — `[Luxembourgish, English]`
- `onComplete`: Optional callback with `WordResultMap` (per-word shown/correct/incorrect stats)
- `onMatch`: Optional callback fired on each match with `(matchedCount, totalPairs)`

**Behavior:**
- Displays up to 5 pairs at a time (configurable via `DISPLAY_SLOTS` constant)
- Slot state machine: `active` → `selected` → `fading` → `active`/`empty`
- Incorrect matches trigger `fail` state with auto-reset after 1 second
- Matched pairs fade out and are replaced with new pairs from the pool
- New pairs appear in cross-randomized positions for variety

### Using the Exercise Session Hook

For full session management with batches, progress tracking, and backend sync:

```tsx
import { useExerciseSession } from "../exercise/use-exercise-session";
import { useProgressSync } from "../persistence/hooks/use-progress-sync";
import { WordMatch } from "../exercise/WordMatch";
import { ProgressBar } from "../ui/ProgressBar";
import { MilestonePopup, CelebrationPopup } from "../ui/Popup";

export const MyExercisePage = () => {
  const { syncProgress } = useProgressSync();

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
    onBatchResults: (wordResults) => syncProgress({ wordResults, durationMs: 0 }),
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

**Session States:** `loading` → `ready` → `active` → `batch_complete` → `session_complete`

## Architecture Decisions

### Navigation

Simple React Context-based navigation instead of React Router. Keeps the bundle small and works well for the current scope. The navigation state is managed in `NavigationContext` and consumed via `useNavigation()`.

### UI Component Patterns

- **Status-based styling**: Components like `Pill` accept a `status` prop mapped to predefined color schemes
- **Color maps**: Centralized in `src/ui/index.ts` for consistency
- **Composition**: `FadingPill` wraps `Pill` to add animation behavior

### Mobile-First Design

`AppWrapper` creates a mobile viewport simulation on desktop:
- Full-screen on mobile devices
- Centered 430×932px frame on desktop (iPhone 14 Pro Max dimensions)

### State Management

- **Local state**: Exercise state (selections, answers) lives in exercise components
- **Context**: Navigation + auth state are global via React Context
- **No external state library**: The app is simple enough to not need Redux/Zustand

## UI Color System

Pill statuses in `src/ui/Pill.tsx`:

| Status | Use Case | Colors |
|--------|----------|--------|
| `blanc` | Default/unselected | Gray |
| `selected` | Currently selected | Sky blue |
| `success` | Correct answer | Green |
| `fail` | Wrong answer | Rose/Red |

Progress bar colors:
- **Current batch**: Lime (`bg-lime-400`) with ring indicator
- **Completed batches**: Green (`bg-green-500`)
- **Empty segments**: Gray (`bg-gray-200`)

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (Worker + KV emulated locally) |
| `npm run build` | TypeScript compile + Vite build |
| `npm run lint` | Run ESLint |
| `npm run preview` | Preview production build |
| `npm run deploy` | Build and deploy to Cloudflare |

## License

See [LICENSE.md](./LICENSE.md)
