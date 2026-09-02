# Audio pipeline — Sproochmaschinn TTS, R2 as source of truth

**Status: audio is live — generated, backed up, and played by the app.**
SentenceBuilder auto-plays prompt audio on arrival and offers a replay button
(`usePromptAudio` in `src/exercise/SentenceBuilder/index.tsx`): the examiner
question for Q&A sentences, the Luxembourgish phrase for lu→en. Plain en→lu gets
NO audio — the Luxembourgish is the answer and hearing it would leak the tiles
(rule + tests live in `buildSentenceExercise`). The `prebuild` hook is restored
over the full content tree.

Commands are in CLAUDE.md; scripts are `scripts/{generate,sync}-audio.mjs`.

## Coverage: sentences and questions

Two generators, one shared client (`scripts/lib/sproochmaschinn.mjs`):

- `generate-audio.mjs` — `@lu` lines inside `@sentence` blocks, one lesson file at
  a time. `@word` entries are deliberately excluded — sentences are the
  higher-value listening practice and vocabulary lookups don't need it. Adding
  word audio later is another generator pass, not a redesign.
- `generate-question-audio.mjs` — every `@question` examiner prompt under a root
  (default: all content). Questions are always Luxembourgish, so the whole corpus
  is one Sproochmaschinn batch. In practice all `@question` content is exam-track
  topic themes (picture themes forbid it), but the extractor is track-agnostic —
  a course lesson adopting `@question` is covered without a script change.

Each `@lu` variant gets its own file: variants are different phrasings (formal vs
informal) and warrant separate audio.

**`@fill` is a block boundary, never a voiced sentence.** A fill is a different
Element kind that also uses `@lu`, with `[bracketed]` blanks in the line. The
extractor originally reset its sentence flag only on `@lesson`/`@word`, so every
fill was voiced — reading the answer aloud, and keyed to a slug (brackets vanish
in slugification) that no sentence lookup can ever request. That produced 371 dead
files across A1 before it was caught. `BLOCK_BOUNDARIES` in
`scripts/lib/letz-audio.mjs` is the fix; `tests/scripts/letz-audio.test.ts` pins
it. FillBlank has no audio wiring at all — voicing a gapped sentence is an open
design question, not an oversight.

## Layout: audio/ flat for sentences, audio/questions/ for prompts

`<letz-dir>/audio/<slug>.mp3` for sentences, `<letz-dir>/audio/questions/<slug>.mp3`
for questions. The `questions/` subdirectory keeps the two corpora from colliding
(a sentence and a question could slugify identically) and the per-theme/per-level
.letz directories provide the nesting — no single folder collects everything.
Sub-lessons of one exam theme share a directory, so a question repeated across
them is generated once and stored once.

## Storage: R2, not git

Files live in three states — local (gitignored), R2 (`roude-leiw-audio`, keyed by
path relative to `public/assets/`, e.g. `lessons/A1/audio/<slug>.mp3` and
`exam/topic/tourism/audio/questions/<slug>.mp3`), and copied into `dist/` at build
time.

> The R2 key root moved from `public/assets/lessons/` to `public/assets/` when
> question audio arrived (exam content was invisible to the old root). Old
> `A1/audio/…` keys are dead objects; everything was re-uploaded under
> `lessons/A1/audio/…`. No cleanup — storage cost is negligible.

| Alternative | Why not |
|---|---|
| Commit to git | mp3s bloat the repo and Sproochmaschinn output is regeneratable for free; full coverage of 100 lessons ≈ 200 MB |
| Local-only, ship via deploy | loses audio if the checkout disappears, forcing slow regeneration (rate-limited to ~9 phrases/min) |
| Serve from R2 via a Worker route | production-grade, but needs a route + frontend URL change; deferred until deploy size or build time hurts (~50+ lessons) |

R2 is the durable backup and egress inside Cloudflare is free, so build-time
fetching is essentially free.

`pack-audio` is the credential-free alternative for moving audio between
checkouts: one uncompressed tar (mp3 is already compressed) with repo-relative
entries, so `tar -xf … -C <repo root>` lands every file where the app and the
generators expect it. `prune-audio` deletes R2 objects no current `.letz`
expects — dead keys from a renamed phrase, a deleted lesson, or the ElevenLabs
era — over the Cloudflare REST API, so it works without wrangler.

## Playback: URL derived at the load edge, optimistic

`fetchLetzFile` stamps `questionAudioUrl` and `luAudioUrl` onto each sentence
(`<letz-dir>/audio/questions/<slug>.mp3` / `<letz-dir>/audio/<slug>.mp3`) — the
loader is the only place that knows where the file was served from, and both
catalogs (course + exam) share it, so Fix Errors' rebuilt phrases carry the URLs
for free via the error pool's stored entries. `buildSentenceExercise` collapses
them into the single `SentenceBuilderItem.audioUrl` under the leak rule above.
`src/lib/audio-slug.ts` duplicates the scripts' slugify
(plain-Node tree stays import-free from the app); a parity test walks the real
question corpus with both implementations — divergence is a silent 404, which is
also why the URL is optimistic: nothing verifies the file exists, the player
swallows the rejection. Browser autoplay policy can veto the first auto-play
before any gesture on the page; the replay button is the designed fallback, not a
nice-to-have. mp3s are deliberately NOT in the service-worker `globPatterns` —
on-demand fetch, not precache.

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

## Voice provider: Sproochmaschinn (ZLS), not ElevenLabs

`https://sproochmaschinn.lu` — the free TTS service by the Zenter fir d'Lëtzebuerger
Sprooch, with purpose-built Luxembourgish voices. Replaced ElevenLabs because it is
free, keyless, and native-Luxembourgish rather than multilingual-approximate.

- **No API key.** `POST /api/session` returns a `session_id`; everything else is
  authenticated by it. Sessions expire after 10 min idle — the script transparently
  recreates on 404, like the web client does.
- **API is documented inside the SPA** (menu → "API Documentation"), not on a
  separate docs site. Flow: `POST /api/tts/{session_id}` with `{ text, model }` →
  `{ request_id }` → poll `GET /api/result/{request_id}` until `completed`.
  The result carries base64 WAV (22.05 kHz mono PCM); a result is deleted 30 s
  after first retrieval, so read it once and keep the bytes.
- **Rate limit: 10 TTS requests/min/session**, max 10,000 chars per request. The
  generator runs sequentially with ~6.5 s spacing — a full lesson (~50 phrases)
  takes ~6 min. WebSocket progress updates exist but polling is simpler for a batch
  script.
- **Voices:** `claude` (default, VITS2), `max` (male, Coqui), `maxine` (female,
  Coqui). Override via `SPROOCHMASCHINN_MODEL`.
- **mp3 is produced locally via ffmpeg** (`libmp3lame -qscale:a 4`, piped, no temp
  files) since the API only emits WAV. ffmpeg on PATH is a hard prerequisite.
- **Non-commercial use only.** The in-app docs state API access is limited to
  non-commercial use; commercial deployment requires contacting ZLS. Fine for this
  project today; revisit if Roude Leiw ever monetizes.

ElevenLabs (Jessica voice, `eleven_multilingual_v2`) was the original provider —
it worked but cost credits and its Luxembourgish is a multilingual model's
approximation, not a dedicated voice.
