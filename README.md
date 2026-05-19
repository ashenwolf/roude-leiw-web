# Roude Leiw

A Luxembourgish language learning SPA. The name "Roude Leiw" (Red Lion) references Luxembourg's national symbol.

## What It Does

Users practice Luxembourgish vocabulary and grammar through three exercise Modes:

- **Lesson** — focused practice on one lesson and its prerequisites; 3 blocks × 5 slots, with a correction block for failed sentence attempts
- **Word Mix** — broad matching across all unlocked words; 3 blocks × 1 slot (20 pairs each)
- **Fix Errors** — drills on words and phrases the user is struggling with

Two exercise types run inside every Mode: **Word Match** (match Lux ↔ English pairs) and **Sentence Builder** (assemble a translation from token tiles).

Progress is tracked per element (`shown / correct / incorrect`). Lesson unlock and error pool are derived from stats — nothing extra is stored.

## Tech Stack

- **Frontend**: React 19, TypeScript (strict), Tailwind CSS 4, Vite 7
- **Backend**: Cloudflare Workers
- **Storage**: Cloudflare KV (JSON blobs, no D1)
- **Auth**: Google OAuth 2.0 (guest mode preserved)
- **Parser**: Chevrotain 11 (custom `.letz` lesson format)
- **Memoization**: Babel React Compiler (automatic)

## Commands

```bash
npm run dev      # Vite dev server with Worker + KV emulation
npm run build    # TypeScript compile + Vite build
npm run lint     # ESLint
npm run preview  # Preview production build
npm run deploy   # Build and deploy to Cloudflare Pages
npx vitest run  # Run tests
```

## Project Structure

```
src/
├── context/          # Auth + navigation React contexts
├── page/             # AppHome, AppExercise (top-level pages)
├── exercise/         # Session logic: mode planners, SessionMachine, exercise builders
│   ├── modes/        # planLessonMode, planWordMixMode, planFixErrorsMode
│   ├── WordMatch/    # Matching game UI + state machine
│   └── SentenceBuilder/ # Token-tile assembly UI + state machine
├── persistence/      # useProgress (auth + guest), useProgressSync
├── lib/              # Shared utilities (shuffle, streak, stats-merge, letz-parser)
└── ui/               # Reusable components (Button, Pill, ProgressBar, Popup, icons)

worker/
├── handlers/         # Auth + progress API handlers (thin routing)
└── lib/              # Session CRUD, user CRUD, OAuth, validators

public/assets/lessons/
├── manifest.json     # Lesson index by CEFR level
└── A1/               # .letz lesson files
```

See [CLAUDE.md](./CLAUDE.md) for the full architecture, data pipeline, glossary, and contribution rules.

## Deployment

### Prerequisites

- Cloudflare account + Wrangler CLI
- Node.js 22+
- Google Cloud project with OAuth 2.0 credentials

### Steps

```bash
# 1. Login
npx wrangler login

# 2. Create KV namespace and update wrangler.toml with the returned id
npx wrangler kv namespace create KV

# 3. Set secrets
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET

# 4. Set APP_URL in wrangler.toml [vars] to your production domain

# 5. Deploy
npm run deploy
```

For local dev, add `http://localhost:5173/api/auth/callback` to your Google OAuth authorized redirect URIs.

## Lesson Format (`.letz`)

```
@lesson A1.01 "Basic Greetings"

@word Moien = good morning
@word Äddi = bye

@sentence
  @lu Ech sinn de Luca.
  @en I am Luca.
  @distractor-en He is Luca.
  @distractor-lu Du bass de Luca.
```

Files live at `public/assets/lessons/{level}/{filename}.letz`. Register new files in `manifest.json`.

## License

See [LICENSE.md](./LICENSE.md)
