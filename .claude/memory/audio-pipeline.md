# Audio pipeline — ElevenLabs TTS, R2 as source of truth

**Status: generated and backed up, but NOT wired into the build and NOT consumed
by the app.** The `prebuild` hook was removed — it wasted ~30 s and emitted R2 403
noise on machines without credentials, for files nothing reads yet. Restore the
hook (or replace it with a Worker route serving R2) when the app starts playing
mp3s.

Commands are in CLAUDE.md; scripts are `scripts/{generate,sync}-audio.mjs`.

## Coverage: sentences only

Only `@lu` lines inside `@sentence` blocks are voiced. `@word` entries are
deliberately excluded — sentences are the higher-value listening practice and
vocabulary lookups don't need it. Adding word audio later is another generator
pass, not a redesign.

Each `@lu` variant gets its own file: variants are different phrasings (formal vs
informal) and warrant separate audio.

## Storage: R2, not git

Files live in three states — local (gitignored), R2 (`roude-leiw-audio`, mirroring
the local path), and copied into `dist/` at build time.

| Alternative | Why not |
|---|---|
| Commit to git | mp3s bloat the repo and ElevenLabs output is regeneratable; full coverage of 100 lessons ≈ 200 MB |
| Local-only, ship via deploy | loses audio if the checkout disappears, forcing re-spend on API credits |
| Serve from R2 via a Worker route | production-grade, but needs a route + frontend URL change; deferred until deploy size or build time hurts (~50+ lessons) |

R2 is the durable backup and egress inside Cloudflare is free, so build-time
fetching is essentially free.

## Slugs are deterministic from the phrase

NFD-normalize → strip combining marks → lowercase → non-alphanumeric runs to `-` →
trim. `"Wéi geet et?"` → `wei-geet-et`.

Two phrases collapsing to the same slug **share one file** by design — the audio is
for the slug, not the punctuation.

**Editing a phrase changes its slug**, so regenerate and re-upload; the old key
becomes a dead R2 object. No auto-cleanup; storage cost is negligible.

## Tolerant degradation

`sync-audio:download` detects auth failures and downgrades to a warning rather than
failing the build, so a fresh `clone && install && build` succeeds for someone who
just wants to run the dev server. The deployed site simply lacks audio, visible in
the build log.

## Why `.mjs`, and why the wrangler CLI

- **Plain ESM Node, not TypeScript:** zero build infrastructure, zero new
  devDependencies, and the logic is simple enough that types aren't pulling weight.
  The shared lib re-implements `@lu` extraction line-by-line rather than importing
  the Chevrotain parser, to keep scripts independent of the bundler-targeted tree.
- **`wrangler r2 object` rather than the S3 SDK:** the SDK would be faster (no
  ~0.5 s CLI boot per call) but needs R2 access keys — an extra dashboard step and
  an extra secret — plus a heavyweight dep. Concurrency 4 amortizes the boot cost,
  measured at a ~4× speedup on a full lesson's worth of files.

## CI auth

Pages CI has no `wrangler login` cookie, so it needs `CLOUDFLARE_API_TOKEN` (with
`Workers R2 Storage: Read`) and `CLOUDFLARE_ACCOUNT_ID` set in Pages → Settings →
Variables and Secrets. A `⚠ Cloudflare credentials not found` line in a deploy log
means the token is missing or scoped wrong.

**Why `prebuild` was the right hook when enabled:** Cloudflare Pages git
integration runs `npm run build`, not `npm run deploy`, so hooking `deploy` would
only help local CLI deploys. `predev` deliberately does not exist, so the dev
server starts instantly without touching R2.

## Voice defaults

Jessica (`cgSgspJ2msm6clMCkdW9`), model `eleven_multilingual_v2` — stable, and
Luxembourgish is in ElevenLabs' listed languages. `eleven_v3` is more expressive
but alpha and may be access-restricted; override via `ELEVENLABS_MODEL_ID`.
