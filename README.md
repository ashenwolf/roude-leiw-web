# Roude Leiw

A Luxembourgish language learning SPA. The name "Roude Leiw" (Red Lion) references Luxembourg's national symbol.

## What It Does

Two parallel tracks. The **course** track teaches CEFR levels from A1 up, lesson by lesson. The
**exam** track ("Sproochentest Prep") drills the Luxembourgish citizenship speaking exam — themed
paths of sub-lessons, no level dimension.

Four Modes run sessions over that content:

- **Lesson** — focused practice on one lesson and its prerequisites; 3 blocks × 5 slots, with a correction block for failed attempts
- **Word Mix** — broad matching across all unlocked words; 3 blocks × 1 slot (20 pairs each)
- **Fix Errors** — drills the elements the user is struggling with; the one *global* Mode, its pool spans both tracks
- **Exam** — one sub-lesson of a theme, covering all of its content

Three exercise types fill the slots: **Word Match** (match Lux ↔ English pairs), **Sentence
Builder** (assemble a translation from token tiles), and **Fill Blank** (drop words into a fixed
sentence frame — exam track only).

Progress is tracked per element (`shown / correct / incorrect`). Lesson unlock and error pool are derived from stats — nothing extra is stored.

## Tech Stack

- **Frontend**: React 19, TypeScript (strict), Tailwind CSS 4, Vite 7
- **Backend**: Cloudflare Workers
- **Storage**: Cloudflare KV (JSON blobs, no D1)
- **Auth**: Google OAuth 2.0 (guest mode preserved)
- **Parser**: Chevrotain (custom `.letz` lesson format)
- **Analytics**: PostHog (optional — the build skips init when the key is absent)
- **Memoization**: Babel React Compiler (automatic)

## Commands

```bash
npm run dev            # Vite dev server with Worker + KV emulation
npm run build          # vitest run && eslint . && tsc -b && vite build — the full gate
npm run lint           # ESLint
npm run preview        # Preview production build
npm run deploy         # Build and deploy to Cloudflare Pages
npm run check-content  # Advisory Eifeler-Regel audit over .letz files
npx vitest run         # Run tests
```

## Project Structure

```
src/
├── context/          # Auth + navigation React contexts
├── page/             # AppHome, AppExam, AppExercise (top-level screens)
├── exam/             # Exam catalog + pure exam progression
├── exercise/         # Session engine: mode planners, SessionMachine, exercise builders
│   ├── modes/        # lesson, word-mix, fix-errors, exam planners
│   ├── WordMatch/    # Matching game — UI + wiring + pure logic + types
│   ├── SentenceBuilder/ # Token-tile assembly — same four-file split
│   └── FillBlank/    # Fill-in-words — same four-file split
├── persistence/      # Server sync + guest localStorage
├── lib/              # Shared utilities (shuffle, streak, stats-merge, letz-parser)
└── ui/               # Reusable components + hand-copied Phosphor icons

worker/
├── handlers/         # Auth + progress API handlers (thin routing)
└── lib/              # Session CRUD, user CRUD, OAuth, validators, logging

public/assets/
├── lessons/          # Course track — manifest.json + .letz files by level/section
└── exam/             # Exam track — manifest.json + topic/ and picture/ themes
```

Start at [AGENTS.md](./AGENTS.md) or [CLAUDE.md](./CLAUDE.md) for the architecture, data pipeline,
glossary, and contribution rules. The conventions behind the layout above are in
[`.claude/reference/project-structure.md`](./.claude/reference/project-structure.md).

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
  @distractor-en He
  @distractor-lu Du
```

Distractors are **single words** — the sentence builder tokenizes a multi-word distractor into that
many loose tiles. The exam track adds `@question` (forces en→lu presentation) and `@fill`
(bracketed blanks over a fixed frame); both are documented in the `letz-content-generator` skill.

Course files live at `public/assets/lessons/{level}/{section}/{filename}.letz`; exam files at
`public/assets/exam/{topic|picture}/{theme}/{filename}.letz`. Register new files in the matching
`manifest.json`.

## License

See [LICENSE.md](./LICENSE.md)
