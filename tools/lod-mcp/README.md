# LOD MCP server

Exposes the official **Lëtzebuerger Online Dictionnaire** ([lod.lu](https://lod.lu))
public API as Model Context Protocol tools, so Claude Code (or any MCP client)
can verify Luxembourgish translations, part of speech, and **grammatical gender**
when authoring `.letz` lesson content.

Zero runtime dependencies — pure Node (18+), no SDK, no `npm install`. Speaks the
MCP stdio transport (newline-delimited JSON-RPC 2.0).

## Registration

Already wired in the repo-root `.mcp.json`:

```json
{ "mcpServers": { "lod": { "command": "node", "args": ["tools/lod-mcp/server.mjs"] } } }
```

Restart Claude Code (or reload MCP servers) to pick it up.

## Tools

| Tool | Arguments | Returns |
|---|---|---|
| `lod_lookup` | `words[]` (≤60, preferred) or `word`, `locale?` (`en`/`de`/`fr`/`pt`/`nl`/`lb`, default `en`), `maxEntries?` (1–10, default 3), `verbose?` (default `false`) | `{ locale, results[] }`; each result is `{ word, found, entries[] }` with `lemma`, `pos`, `gender` (`m`/`f`/`n`) and `senses[]` — or `{ word, found: 0, suggestions[] }` on a miss. |
| `lod_suggest` | `words[]` (≤60, preferred) or `word`, `locale?` | `{ locale, results[] }`; each result `{ word, suggestions[] }` or `{ word, error }`. Rarely needed directly — `lod_lookup` already returns suggestions for a miss. Use it to spellcheck words you are *not* also looking up, e.g. inflected forms inside a `@lu` sentence. |

### Batch, and keep it slim

Two properties exist to keep an authoring pass cheap; both matter because the
caller is an LLM paying per token and per round trip.

**Pass the whole word list in one call.** `words: [...]` deduplicates, runs 6
lookups concurrently, and preserves input order. Verifying 30 words one call at
a time costs 30 model round trips — the network is ~200 ms per word, the
inference cycles around it are the real expense.

**The default response is slim** (~60 tokens/word vs ~450 verbose). Dropped:
`examples` (empty for every entry in every locale — measured, pure waste),
`ipa`, `declensionInfo`, and sense numbering. Kept: `senses[]`, where each
sense folds the translation together with its **clarifier** —
`"coffee (beans)"`, `"bank (financial institute)"`. Clarifiers are deliberately
retained: they are what distinguishes `Kaffi` = *coffee* from `Kaffi` =
*breakfast*, so dropping them would reintroduce the first-sense-wins error the
dictionary check exists to prevent. Pass `verbose: true` for the full shape.

### Reading a miss

A word with no entries returns `found: 0` **with spellchecker suggestions
already filled in**, so no follow-up call is needed:

- 0 results **with** suggestions → misspelled (`Lëtzebuesch` → `Lëtzebuergesch`).
- 0 results with **no** suggestions → usually a legitimate inflected form or
  compound (`Kanner`, `Beem`, `Keessebong`) and not an error.

One unreachable word yields `{ word, error }` for that entry only; the rest of
the batch still returns.

### ⚠️ The upstream spellchecker is nondeterministic

lod.lu's `/spellchecker/suggestions/` endpoint returns **different bodies for
identical requests**. Measured on `Lëtzebuesch`: 6 of 12 calls returned `[]`,
the rest `["Lëtzebuergesch"]` — all HTTP 200, with a clean bimodal latency split
(~349 ms → `[]`, ~436 ms → the answer). It is not an encoding or normalization
artifact; the bytes we send are identical across runs. Most likely an
inconsistent backend node behind their nginx.

This is a correctness problem, not just noise, because an **empty list carries
meaning** in this repo: the authoring contract reads "no suggestions" as
*legitimate inflected form, not an error*. A flaky empty therefore doesn't
degrade gracefully — it silently converts a real misspelling into an all-clear.

`suggest()` compensates by retrying while the list is empty
(`SUGGEST_ATTEMPTS = 3`). Measured recovery: 1 attempt 36% → 2 → 64% → 3 → 93%.
Words that genuinely have no suggestion still return `[]`, so the retry never
invents one. Concurrency absorbs the cost: a 12-word batch that is mostly clean
runs ~122 ms/word amortized.

**Do not treat a single empty result as authoritative** if the word looks
suspicious — ask again, or cross-check with `lod_lookup`.

## Files

- `lib/lod-client.mjs` — pure LOD API client (`search`, `getEntry`, `lookup`, `lookupMany`, `suggest`) plus the pure projections `slimEntry` and `wordList`. No MCP, no I/O wiring.
- `server.mjs` — MCP stdio JSON-RPC wiring only. Logic lives in the client.
- `tests/tools/lod-client.test.ts` — covers `slimEntry` and `wordList`. Network calls are untested by design (the no-mocks rule); verify those with the smoke test below.

## Underlying API

- Docs: <https://lod.lu/api/doc> · OpenAPI: <https://lod.lu/api/doc.json>
- Lookup is two calls: `GET /api/{locale}/advanced-search?query=<word>` → `results[].id`,
  then `GET /api/{locale}/entry/<lod_id>`.

## Manual smoke test

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"lod_lookup","arguments":{"words":["Brout","Kaffi","Lëtzebuesch"]}}}' \
  | node tools/lod-mcp/server.mjs
```

`Lëtzebuesch` should come back `found: 0` with `Lëtzebuergesch` suggested —
that exercises the miss path in the same call.
