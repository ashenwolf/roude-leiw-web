# Security & Reliability Hardening Plan

Status legend: `[ ]` todo  `[x]` done  `[~]` in progress  `[!]` blocked

Two tracks below:
- **Track A — Owner tasks**: require dashboard access, billing, external accounts, or DNS. Detailed step-by-step instructions included.
- **Track B — Code tasks**: changes inside this repo. Can be implemented by Claude (or anyone with repo access). Each has a short scope note.

Work top-down within each phase; phases are ordered by ROI.

---

## Progress snapshot

**Owner (Track A) — all blocked on you:** A1 A2 A3 A4 A5 A6 A7 A8 A9 — none started.

**Code (Track B) — 12 of 18 shipped, 4 gated on Track A, 2 deferred:**
- Shipped: B1 B2 B3 B5 B6 B7 B8 B9 B12 B13 B15 B16
- Gated on owner task: B4 (A4) · B10 (A5) · B11 (A6) · B14 (A7)
- Deferred (Phase 5): B17 B18

**Next bottleneck:** A1 + A2 + A3. The shipped code closes the data-corruption and account-takeover paths but does nothing about the cash-loss attack — rate limiting + billing alerts are dashboard-only and only you can do them.

---

## Phase 1 — Stop the bleeding (this week)

### Track A — Owner tasks

#### A1. [x] Set Cloudflare billing alerts (10 min)
Prevents an attack-driven invoice surprise. **Do this first** — it's the only thing that bounds worst-case cost while you implement everything else.

1. Log into https://dash.cloudflare.com → pick your account.
2. Top right account menu → **Billing** → **Notifications** (or **Manage Notifications**).
3. Add a notification:
   - Type: **Billing Usage**
   - Service: **Workers Paid** (and **KV** if listed separately)
   - Threshold: $5
   - Delivery: email to `graywolfs@gmail.com`
4. Add two more notifications at $20 and $100.
5. Save. Confirm the email subscription if Cloudflare sends a confirmation link.

Note: Cloudflare does not offer a hard spend cap on the Workers Paid plan. These are alerts only — if one fires, your action is to ship A2 (rate limits) or disable the Worker (`wrangler deployments rollback` or unbind the route).

#### A2. [x] Enable Cloudflare WAF Rate Limiting on `/api/*` (30 min)
1. Cloudflare dashboard → select the zone for `roudeleiw.app` (or whatever the parent domain is).
2. **Security** → **WAF** → **Rate limiting rules** → **Create rule**.
3. Create four rules in order. For each: name it, paste the expression, set the action to **Block**, response code **429**, duration **10 seconds**.

   | Rule name | Expression | Requests | Period |
   |---|---|---|---|
   | api-global | `(starts_with(http.request.uri.path, "/api/"))` | 120 | 1 minute |
   | api-auth-init | `(http.request.uri.path eq "/api/auth/google")` | 10 | 1 minute |
   | api-auth-callback | `(http.request.uri.path eq "/api/auth/callback")` | 20 | 1 minute |
   | api-progress-sync | `(http.request.uri.path eq "/api/progress/sync")` | 60 | 1 minute |

   "Characteristics" for each rule: **IP address**. (We'll switch progress-sync to "cookie: session" later in B-track.)

4. After saving each rule, smoke-test from your machine:
   ```
   for i in {1..15}; do curl -s -o /dev/null -w "%{http_code}\n" https://web.roudeleiw.app/api/auth/google; done
   ```
   You should see `302` for the first 10 and `429` afterwards.

#### A3. [x] Enable Bot Fight Mode (5 min)
1. Cloudflare dashboard → zone → **Security** → **Bots**.
2. Toggle **Bot Fight Mode** → **On**. (Free; "Super Bot Fight Mode" requires Pro and is optional.)
3. No other config needed. Verify the site still loads in a normal browser.

### Track B — Code tasks

- [x] **B1. Validate and bound `/api/progress/sync` payload.** Done — `worker/lib/validators.ts` + 12 tests in `tests/worker/lib/validators.test.ts`. Caps array at 200, validates key shape (`{lu}|{en}` or `phrase:(en-lu|lu-en):*`), bounds counts to [0,100], duration to [0,3600], date to `[today-2, today+1]` UTC. Returns 400 + structured `progress_sync_rejected` log on failure.
- [x] **B2. Cap stored map sizes in `mergeWordResults` / `mergeDailySession`.** Done — `MAX_WORD_KEYS = 10_000`, `MAX_DAILY_SESSIONS = 1825`. New keys are dropped at the word cap (existing keys still accumulate); oldest dates pruned when daily cap is exceeded. Two new tests cover both behaviors.
- [x] **B3. Rename session cookie to `__Host-session` and always set `Secure`.** Done — `worker/lib/session.ts` uses `__Host-session` over HTTPS, plain `session` over HTTP (dev). `parseSessionId` reads both. **Note on rollout: existing browser sessions will be invalidated on first deploy** because the old cookie name still works via the parser, but the cookie is `Set-Cookie`'d under the new name only. Users see one re-login.

---

## Phase 2 — Close auth & data-integrity holes (next week)

### Track A — Owner tasks

#### A4. [ ] Provision a Turnstile site key for `/api/auth/google` (15 min)
Optional but cheap defense if A2's IP-based limit isn't enough.
1. Cloudflare dashboard → **Turnstile** → **Add site**.
2. Domain: `web.roudeleiw.app`. Widget mode: **Invisible** (or **Managed** if you want a visible challenge).
3. Copy the **Site Key** and **Secret Key**.
4. Add the secret to the Worker:
   ```
   npx wrangler secret put TURNSTILE_SECRET
   ```
   Paste the secret when prompted.
5. Add the site key to `wrangler.toml` under `[vars]`:
   ```
   TURNSTILE_SITE_KEY = "0x4AAA..."
   ```
6. Tell Claude to ship B4.

### Track B — Code tasks

- [ ] **B4. Wire Turnstile verification on `/api/auth/google`.** Frontend renders the widget on the sign-in button; backend verifies the token against `https://challenges.cloudflare.com/turnstile/v0/siteverify` before issuing the redirect. Touches `src/ui/UserMenu.tsx`, `worker/handlers/auth.ts`, adds `worker/lib/turnstile.ts`. Gated on A4.
- [x] **B5. Verify `email_verified` from Google.** Done — `worker/lib/oauth/google.ts` now requires `verified_email === true` and throws otherwise. Callback handler catches the throw and redirects to `?error=oauth_failed` with a `oauth_exchange_failed` log line.
- [x] **B6. Bind OAuth `state` to a pre-session cookie.** Done — `__Host-oauth-state` set on `/api/auth/google`, checked on `/callback` before the KV CSRF check, cleared after successful login. Both the cookie and the KV row must match — two independent checks.
- [x] **B7. Require matching `Origin` header on all POST `/api/*` routes.** Done — `isOriginAllowed` in `worker/router.ts` rejects with 403 + `origin_rejected` log when a non-GET/HEAD request lacks a matching `Origin` header.
- [x] **B8. Best-effort race protection on email→user linking.** Done — `handleCallback` claims the email row by writing the candidate uuid, then re-reads to discover which uuid won. Loser's candidate is discarded silently. Comment in code explains the eventually-consistent caveat.
- [x] **B9. `version` field for lost-update detection.** Done — `UserData.version?: number` on `worker/types.ts`. `handleProgressSync` reads, bumps, writes, then re-reads and logs `lost_update_detected` when the observed version differs from the one we just wrote. Logging-only.

---

## Phase 3 — Observability & backups (within 2 weeks)

### Track A — Owner tasks

#### A5. [ ] Create an R2 bucket for KV backups (15 min)
1. Cloudflare dashboard → **R2** → **Create bucket**.
2. Name: `roude-leiw-backups`. Location: **Automatic**.
3. After creation, copy the bucket name.
4. Bind it to the Worker by editing `wrangler.toml`:
   ```toml
   [[r2_buckets]]
   binding = "BACKUPS"
   bucket_name = "roude-leiw-backups"
   ```
5. Enable a Worker cron trigger by adding to `wrangler.toml`:
   ```toml
   [triggers]
   crons = ["0 3 * * *"]
   ```
6. Tell Claude to ship B10.

#### A6. [ ] Provision PostHog for backend observability (10 min)
PostHog is already used on the frontend. We'll reuse it for backend exception tracking and event logging instead of adding Sentry — one less tool, one less account, and session replays will correlate with backend errors via shared `distinct_id`.

1. Log into https://app.posthog.com → pick the project you already use for the frontend.
2. **Project settings** → **Project API key** → copy the key (starts with `phc_`). This is the same key the frontend uses; safe to reuse server-side because it's public-write.
3. Note the **API host** (likely `https://us.i.posthog.com` or `https://eu.i.posthog.com`).
4. Add both as a Worker var in `wrangler.toml`:
   ```toml
   [vars]
   APP_URL = "https://web.roudeleiw.app"
   POSTHOG_KEY = "phc_..."
   POSTHOG_HOST = "https://us.i.posthog.com"
   ```
5. Enable **Error tracking** in PostHog: left sidebar → **Error tracking** → if it asks to enable, click enable. (No code needed yet; B11 wires it.)
6. Tell Claude to ship B11.

Note: PostHog covers exceptions and custom events. For raw request-level log tail ("what just happened in the Worker right now?"), use **Cloudflare Workers Logs** — it's already enabled by default. View at: Cloudflare dashboard → **Workers & Pages** → your worker → **Logs**, or `npx wrangler tail` locally. No setup needed.

### Track B — Code tasks

- [ ] **B10. KV → R2 backup Worker (scheduled).** New file `worker/cron/backup.ts`. List all `user:*` keys, fetch values in batches, gzip + write to `r2://roude-leiw-backups/{YYYY-MM-DD}/users.jsonl.gz`. Keep 30 days (delete older). Add cron handler in `worker/index.ts`. Gated on A5.
- [ ] **B11. PostHog backend integration in the Worker.** Install `posthog-node`, add `worker/lib/posthog.ts` that exports `captureEvent(ctx, event, props)` and `captureException(ctx, err, props)`. Wrap the fetch handler in `try/catch` → `captureException`. Use `ctx.waitUntil(posthog.flush())` so capture doesn't block responses. Events to emit: `auth_failed`, `auth_succeeded` (no PII), `progress_sync_rejected` (with reason), `kv_write_failed`, `google_api_failed`, `unhandled_exception`. Use `distinct_id = userId` when known, else `anonymous_id` from a frontend-set cookie if available, else IP hash. Gated on A6.
- [x] **B12. Structured logging via `console.log`.** Done — `worker/lib/log.ts` with `log.info/warn/error(event, props)`. Already used by B1/B6/B7/B8/B9. PII excluded by convention; only `userId` (opaque uuid), event names, and bounded counters.
- [x] **B13. Security response headers via `public/_headers`.** Done — CSP (with PostHog EU host allowed), HSTS preload, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `X-Content-Type-Options: nosniff`. Headers ride along on every static response; verified in `dist/client/_headers`. **Test in preview before prod** — first request after deploy will tell you if CSP breaks anything; the browser console shows blocked resources.

---

## Phase 4 — Supply chain & deploy hygiene (within a month)

### Track A — Owner tasks

#### A7. [ ] Create a Cloudflare API token for GitHub Actions (15 min)
1. Cloudflare dashboard → top-right profile → **My Profile** → **API Tokens** → **Create Token**.
2. Use template **Edit Cloudflare Workers** if available; otherwise **Custom token** with permissions:
   - Account → Workers Scripts → Edit
   - Account → Cloudflare Pages → Edit
   - Account → Workers KV Storage → Edit
   - Zone → Workers Routes → Edit (only if you use custom routes)
   - Account Resources: include your account; Zone Resources: include the `roudeleiw.app` zone.
3. **Continue** → **Create Token** → copy the token value (you only see it once).
4. Also copy your Cloudflare **Account ID** from the dashboard sidebar.
5. In GitHub: repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Add:
   - `CLOUDFLARE_API_TOKEN` = the token
   - `CLOUDFLARE_ACCOUNT_ID` = the account id
6. Tell Claude to ship B14.

#### A8. [ ] Enable Dependabot + branch protection (10 min)
1. Repo → **Settings** → **Code security and analysis** → enable:
   - Dependabot alerts: **On**
   - Dependabot security updates: **On**
   - Dependabot version updates: **On** (this requires the config file Claude will add in B15)
2. Repo → **Settings** → **Branches** → **Add branch ruleset** for `main`:
   - Require a pull request before merging
   - Require status checks: select the `check` job from the CI workflow (`.github/workflows/ci.yml`, B16 — appears in this list after the workflow has run once on `main`)
   - Require linear history
   - Restrict deletions
3. Stop running `npm run deploy` from your laptop once B14 is live. The new flow: push to `main` → GitHub Actions deploys.

### Track B — Code tasks

- [ ] **B14. GitHub Actions deploy workflow.** New `.github/workflows/deploy.yml` running on push to `main`: install → typecheck → test → build → `wrangler deploy` using `CLOUDFLARE_API_TOKEN`. Gated on A7.
- [x] **B15. Dependabot config.** Done — `.github/dependabot.yml`, weekly npm + github-actions, minor/patch grouped. Active once A8 is enabled in repo settings.
- [x] **B16. CI checks workflow.** Done — `.github/workflows/ci.yml` on push-to-`main` and every PR: `npm ci` → `npx vitest run` → `npm run lint` → `npx tsc -b` → `npx vite build`, plus an advisory `npm audit --omit=dev --audit-level=high` (`continue-on-error` — the audit endpoint is a third-party service that flakes independently of this repo). Split into named steps rather than one `npm run build` so the run summary names the failing stage. No secrets needed: `src/main.tsx` skips `posthog.init` when `VITE_PUBLIC_POSTHOG_KEY` is absent. Lint, typecheck, and all tests are green as of the workflow landing, so it can be required in branch protection (A8) immediately.

---

## Phase 5 — Nice to have (no urgency)

- [ ] **B17. `POST /api/auth/logout-all`** — scan and delete a user's sessions. Requires a `user:{id}:sessions` index since KV can't query by value; alternative is storing sessionId in `UserData`.
- [ ] **A9. Status page** — sign up for Instatus or Statuspage free tier, link from the app footer. Reputation buffer during incidents.
- [ ] **B18. Switch `/api/progress/sync` rate limit characteristic from IP to session cookie** in the Cloudflare rule (manual change in dashboard). More accurate per-user limit.

---

## Quick reference: how to ask Claude to ship a code task

> "Ship B1 from SECURITY_PLAN.md"

Claude will read this file, find the scope note, implement the change, and tick the box. For code tasks gated on an owner task, Claude will check the gating item is done first.

## Quick reference: when something goes wrong

| Symptom | First action |
|---|---|
| Billing alert fires | Check Cloudflare Analytics → Workers → Requests by route. If `/api/auth/*` is dominant, tighten A2 rule limits temporarily. |
| Users report progress not saving | PostHog → Error tracking, filter event `progress_sync_rejected` or `kv_write_failed`. For raw request details, `npx wrangler tail` or Cloudflare dashboard → Workers → Logs. If KV value-size errors appear, B2 cap logic is failing. |
| Suspected account takeover | Rotate `GOOGLE_CLIENT_SECRET` in Cloudflare dashboard, force-expire all sessions by adding a `minIssuedAt` check (one-line code change). |
| Bad deploy | `npx wrangler deployments list` then `npx wrangler rollback <id>`. |
