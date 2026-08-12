# Security — binding reference

Read this before adding a new endpoint, a new persisted field, or a new external resource. The full rationale and incident history is in [.claude/security-plan.md](../security-plan.md). The rules below are the load-bearing ones that prevent regressions.

## Trust boundaries

- **Anything from the client is hostile until validated.** That includes request bodies, query params, cookies, and `Origin`/`Referer` headers. The Worker is the only place validation matters; frontend checks are UX, not security.
- **Anything from a third-party API is hostile until inspected.** Google OAuth's `verified_email` must be `true` (`worker/lib/oauth/google.ts`). Don't trust `email` from any provider that doesn't verify it.
- **`userId` resolved by the router is trustworthy** — it's the output of a KV session lookup keyed by the HttpOnly cookie. Use `ctx.userId` over anything client-supplied.

## Validate before merge — `/api/progress/sync` contract

`worker/lib/validators.ts` is the gate. **Never call `mergeWordResults` / `mergeDailySession` with unvalidated input.** Concrete bounds (enforced; do not relax without a documented threat-model update):

| Field | Bound |
|---|---|
| `wordResults` length | ≤ 200 |
| `wordResults[].key` | matches `{lu}\|{en}` (≤64+64) OR `{kind}:(en-lu\|lu-en):{firstEn}` (≤64) for each kind in `KEYED_ELEMENT_PREFIXES` (`phrase`, `fill`) |
| `shown`, `correct`, `incorrect` | integer, [0, 100] |
| `durationSeconds` | integer, [0, 3600] |
| `date` | `YYYY-MM-DD`, within `[today-2, today+1]` UTC |

If you add a new field, add a validator clause AND a test in `tests/worker/lib/validators.test.ts` in the same change.

## KV blob caps (prevent slow-leak attacks)

`worker/lib/user.ts` enforces `MAX_WORD_KEYS = 10_000` and `MAX_DAILY_SESSIONS = 1825`. New keys are dropped at the word cap; oldest dates are pruned at the daily cap. **These caps exist because Cloudflare KV has a 25 MB per-value hard limit — hitting it permanently breaks the user account.** If you add a new `Record<string, …>` field on `UserData`, give it a cap in the same change.

## Cookies — always all four

Every cookie the Worker sets must have **`HttpOnly`, `Secure` (over HTTPS), `Path=/`, `SameSite=Lax`**, and the `__Host-` prefix when over HTTPS (forces no-Domain, Path=/, Secure). The session helpers in `worker/lib/session.ts` already do this; if you need a new cookie, copy `buildCookie` rather than inventing one. Never set `Domain=` — keep cookies host-scoped.

## CSRF — two layers

State-changing requests are gated by two independent checks; both must pass:

1. **`SameSite=Lax` on the session cookie** — browser-enforced, blocks cross-site POSTs.
2. **`Origin` header check in `worker/router.ts`** — `isOriginAllowed` rejects any non-GET/HEAD whose `Origin` is missing or doesn't equal `env.APP_URL`. Don't bypass this in handlers. If you add a webhook (legitimately origin-less), narrow the exemption to its single path and use a shared-secret header.

For OAuth, **two state checks** must pass on `/callback`:
1. The `__Host-oauth-state` cookie matches the `state` query param (defeats login-CSRF).
2. The `csrf:{state}` KV row exists (defeats replay and forged states).

Don't remove either.

## No PII in logs

`worker/lib/log.ts` is the only logging path. The contract: **never pass `email`, `name`, raw IP, or any free-text user-supplied string** to `log.*`. Safe to log: `userId` (opaque UUID), event names, counters, validation reason strings (`"date: outside window"` etc.). When in doubt, omit.

## Adding a new API endpoint — checklist

1. Add to `worker/index.ts` route table. Pick HTTP verb based on semantics (POST for state-changing → gets the `Origin` check automatically).
2. If authenticated, branch on `ctx.userId === null` → 401. Never read userId from the request body.
3. Parse the body with `await request.json().catch(() => null)` — never let a malformed body throw a 500.
4. **Validate before doing anything.** Add a function in `worker/lib/validators.ts` and a test in `tests/worker/lib/validators.test.ts`.
5. On rejection: 400 + `log.warn("<event>_rejected", { userId, reason })`. No body details to the client.
6. If you read+write KV for the same key, bump `userData.version` and rely on the existing lost-update logging in `progress.ts` as a template (`worker/handlers/progress.ts`).
7. If the endpoint touches a new external service, add its domain to `connect-src` in `public/_headers`.

## Adding a new external resource (script, font, image, API)

`public/_headers` defines CSP. Any new origin needs a corresponding directive:

| Resource type | Directive to extend |
|---|---|
| `<script src>` | `script-src` |
| `<link rel="stylesheet">` | `style-src` |
| `@font-face` URL | `font-src` |
| `<img src>` | `img-src` |
| `fetch()` / `XMLHttpRequest` / WebSocket | `connect-src` |
| Web Worker / Service Worker | `worker-src` |
| `<iframe>` source | `frame-src` |

**Test the CSP in preview before prod** — a missing directive shows up as a blocked-resource error in the browser console, not as a server error.

## Secrets handling

- Secrets live in Cloudflare Worker secrets (`npx wrangler secret put NAME`), not in `wrangler.toml` and not in env files.
- `[vars]` in `wrangler.toml` is for non-sensitive values (public site keys, public URLs). Treat anything in `[vars]` as visible to attackers.
- Never `console.log` an env value, even at debug level. Never include one in a response body.
- The PostHog project key (`phc_…`) is *intentionally* public — it's a write-only ingestion key. The Personal API Key (`phx_…`) is not public; never expose it in frontend code.

## Rate limiting lives at the edge, not in code

Cloudflare WAF Rate Limiting Rules (configured in the dashboard, see `.claude/security-plan.md` A2) cap traffic per endpoint per IP. **Don't write in-Worker rate limit logic** — it's expensive (KV write per request) and easy to get wrong. If a new endpoint needs a tighter limit, add a new WAF rule.

## Tests for security-critical code

The no-mocks rule (see `.claude/reference/testing.md`) applies, but security-critical pure functions especially need tests:
- Validators (`worker/lib/validators.ts`)
- Cookie builders/parsers (`worker/lib/session.ts`)
- Merge functions with caps (`worker/lib/user.ts`)

If you can't write a test without a mock, the code isn't on-pattern — extract the pure decision into a separate function.
