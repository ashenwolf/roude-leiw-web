# Roude Leiw

A Luxembourgish language learning web application built with React, TypeScript, and Tailwind CSS. The name "Roude Leiw" (Red Lion) references Luxembourg's national symbol.

## Overview

Roude Leiw is a mobile-first language learning app that helps users learn Luxembourgish vocabulary through interactive exercises. The app features a clean, Duolingo-inspired UI with gamified learning elements.

### Current Features

- **Word Matching Exercise**: Match English words with their Luxembourgish translations
- **Visual Feedback**: Color-coded status for selected, correct, and incorrect answers
- **Smooth Animations**: Fading effects for matched pairs
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
│   └── AppExercise.tsx   # Exercise page wrapper
│
├── exercise/            # Exercise components (learning activities)
│   └── WordMatch.tsx     # Word matching game
│
└── ui/                   # Reusable UI components
    ├── index.ts          # UI exports and color maps
    ├── AppWrapper.tsx    # App shell with header and mobile frame
    ├── Button.tsx        # Primary action button
    ├── Pill.tsx          # Status-aware pill/chip component
    ├── FadingPill.tsx    # Pill with fade-out animation
    └── Popup.tsx         # Modal/popup component
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

### Adding a New UI Component

1. **Create the component** in `src/ui/`:

```tsx
// src/ui/ProgressBar.tsx
export const ProgressBar = ({ 
  progress, 
  color = "primary" 
}: { 
  progress: number; 
  color?: "primary" | "secondary";
}) => {
  return (
    <div className="w-full h-4 bg-gray-200 rounded-full">
      <div 
        className="h-full bg-lime-400 rounded-full transition-all"
        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
      />
    </div>
  );
};
```

2. **Export from index** in `src/ui/index.ts`:

```tsx
export { ProgressBar } from "./ProgressBar";
```

### Adding Word Pairs

Edit the `WordPairs` array in `src/exercise/WordMatch.tsx`:

```tsx
const WordPairs = [
  ["Hello", "Moien"],
  ["Goodbye", "Äddi"],
  ["Thank you", "Merci"],
  // Add more pairs here
];
```

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
- [ ] Lesson categories (greetings, numbers, food, etc.)
- [ ] Audio pronunciation
- [ ] Streak tracking and gamification

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
