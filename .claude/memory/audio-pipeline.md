---
name: audio-pipeline
description: How Luxembourgish audio is generated, stored, and deployed. Files are gitignored; R2 is the source of truth; CI rehydrates them at build time.
metadata:
  type: project
---

We added text-to-speech audio for Luxembourgish phrases in May 2026. Every `@lu` line inside a `@sentence` block in a `.letz` file gets a corresponding `<slug>.mp3` generated via ElevenLabs.

## Coverage: sentences only, not words

Only `@lu` lines inside `@sentence` blocks are voiced. `@word` entries (single-word vocabulary) are deliberately excluded. Rationale: sentences are the higher-value listening practice; vocabulary lookups don't need it. Adding word audio later means another generator pass, not a redesign.

Each `@lu` variant inside a single `@sentence` block produces its own audio file — variants are different phrasings (e.g., formal "Iech" vs informal "dir") and warrant separate audio.

## Storage: R2, not git, not Pages-bundled

Audio files live in three states:

1. **Local** — `public/assets/lessons/<level>/audio/<slug>.mp3`, gitignored via `/**/audio/`
2. **R2** — bucket `roude-leiw-audio`, key `<level>/audio/<slug>.mp3` (mirror of local path under `public/assets/lessons/`)
3. **Deployed** — copied into `dist/` by Vite, served as Pages static assets

Why R2 instead of the alternatives we considered:

- **Committing to git** — rejected because mp3s bloat the repo and ElevenLabs output is regeneratable. Each file is ~50 KB; full coverage of 100 lessons would be ~200 MB in the repo.
- **Local-only, ship via `wrangler pages deploy`** (Option A in the design discussion) — simpler but loses audio if the local checkout disappears, forcing re-spend on ElevenLabs API credits.
- **Serve directly from R2 via a Worker route** (Option C) — production-grade but requires a Worker route + frontend URL change. Deferred until deploy size or build time becomes painful (~50+ lessons).

R2 is the durable backup. Pages CI re-fetches it on every build. R2 egress is free within Cloudflare's network, so build-time fetching is essentially free.

## Slug rules

```
"Wéi geet et?"          -> "wei-geet-et"
"d'Schockela"           -> "d-schockela"
"Ech sinn d'Christine." -> "ech-sinn-d-christine"
```

Algorithm (in `scripts/lib/letz-audio.mjs`): NFD-normalize → strip combining marks (ä→a, é→e, ë→e, ü→u, ö→o, ...) → lowercase → `[^a-z0-9]+` → `-` → trim leading/trailing hyphens.

Slugs are deterministic from the phrase. If two different phrases collapse to the same slug (e.g., "Moien!" and "Moien"), they share one audio file — within a run the second is deduped, across runs the existence check skips it. This is intentional: the audio is for the slug, not the exact punctuation.

**Editing a phrase changes its slug.** If you edit an existing `@lu` line, regenerate + upload the new slug; the old slug-file becomes a dead key in R2. No auto-cleanup; storage cost is negligible.

## ElevenLabs defaults

- **Voice**: Jessica (`cgSgspJ2msm6clMCkdW9`) — first voice featured on https://elevenlabs.io/text-to-speech/luxembourgish
- **Model**: `eleven_multilingual_v2` (stable). `eleven_v3` is more expressive but in alpha and may have access restrictions. Override via `ELEVENLABS_MODEL_ID=eleven_v3` if desired.

Both officially support Luxembourgish (it's in their listed 70+ languages).

## CI integration: currently disabled

**As of 2026-05-21, audio is no longer wired into the build pipeline.** The `prebuild` hook (`npm run sync-audio:download`) was removed because audio is not consumed by the app yet, and the build was wasting ~30 s and emitting R2 403 noise on machines without `CLOUDFLARE_API_TOKEN`.

Scripts remain available for manual invocation:

- `npm run generate-audio -- <letz-file>` — synthesize via ElevenLabs
- `npm run sync-audio:upload -- <letz-file>` — push to R2
- `npm run sync-audio:download` — pull all from R2

When the app actually starts using the mp3s, restore the build hook (or replace it with a Worker route serving R2 directly). Original design rationale below — kept for when we re-enable.

### Original design (pre-2026-05-21): prebuild hook, not deploy hook

Sync ran via `prebuild` in `package.json` so `npm run build` triggered it automatically. Required because:

- **Cloudflare Pages git integration runs `npm run build`, not `npm run deploy`.** Hooking into `deploy` would only help local CLI deploys, not push deploys.
- `prebuild` is a standard npm lifecycle hook — no extra config.
- Local `npm run dev` was unaffected (no `predev`), so the dev server started instantly without touching R2.

## CI auth: API token, not `wrangler login`

Pages CI has no `wrangler login` cookie. Auth is via env vars:

- `CLOUDFLARE_API_TOKEN` — needs `Workers R2 Storage: Read` permission
- `CLOUDFLARE_ACCOUNT_ID`

Both must be set in **Pages → Settings → Variables and Secrets** for the Production (and optionally Preview) environment.

## Tolerant degradation

`sync-audio:download` detects auth failures (`isAuthError` regex on wrangler stderr) and downgrades to a warning instead of failing the build. Rationale: a fresh `git clone && npm install && npm run build` should still succeed for someone who just wants to look at the code or run the dev server, even without R2 access. The deployed site simply lacks audio in that case — visible in the build log via `⚠ Cloudflare credentials not found`.

## Why plain `.mjs` for scripts

Scripts (`scripts/generate-audio.mjs`, `scripts/sync-audio.mjs`, `scripts/lib/letz-audio.mjs`) are plain ESM Node — not TypeScript. Reasons: zero build infrastructure (run with `node` directly), zero new devDependencies (no `tsx`, no `--experimental-strip-types`), and the logic is simple enough that types aren't pulling weight. The shared lib re-implements `extractLuPhrases` line-by-line instead of importing the Chevrotain-based `src/lib/letz-parser` to keep scripts independent of the bundler-targeted source tree.

## Why wrangler CLI for R2 sync, not S3 SDK

R2 supports the S3 protocol and `@aws-sdk/client-s3` would be faster (no per-call wrangler boot ~0.5s). Rejected because it requires generating R2 access keys (extra dashboard step, extra secret to manage) and adds a heavyweight dep. `npx wrangler r2 object put/get` reuses the same auth as the rest of the project (`wrangler login` locally, `CLOUDFLARE_API_TOKEN` in CI). Concurrency=4 in `parallelMap` amortizes the boot cost: 43 files sync in ~10 s instead of ~40 s.

## How to apply

> **2026-05-21 note:** the build hook is currently disabled (see "CI integration" above). Steps 1-3 still work for local generation and R2 backup. Step "CI: ..." does not happen automatically right now — the deployed site has no audio until the prebuild hook (or equivalent) is restored.

When adding a new lesson with audio:

```bash
# 1. Write the .letz file
# 2. Generate audio locally (one-time ElevenLabs cost)
npm run generate-audio    -- public/assets/lessons/A1/A1_NN_<topic>.letz
# 3. Push audio to R2 (durable backup)
npm run sync-audio:upload -- public/assets/lessons/A1/A1_NN_<topic>.letz
# 4. Commit only the .letz file
git add public/assets/lessons/A1/A1_NN_<topic>.letz
git commit -m "Add lesson A1.NN: <topic>"
git push
# CI: clones repo → prebuild pulls audio from R2 → build → deploy
```

When editing an existing phrase: regenerate + upload + push. Old audio becomes orphaned in R2 (acceptable cost).

If push deploy logs `⚠ Cloudflare credentials not found`: the API token is missing or scoped wrong in Pages env vars. Fix in dashboard, retrigger the deploy.
