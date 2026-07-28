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
| `lod_lookup` | `word`, `locale?` (`en`/`de`/`fr`/`pt`/`nl`/`lb`, default `en`), `maxEntries?` (1–10, default 3) | Matching dictionary entries: `lemma`, `partOfSpeech`, `gender` (`m`/`f`/`n`), `ipa`, and `meanings[]` with `translations`, `clarifiers`, `examples`. |
| `lod_suggest` | `word`, `locale?` | Spellchecker suggestions — use to find the correct lemma before `lod_lookup`. |

Inflected forms, typos, and proper names usually return no entries; fall back to
`lod_suggest`.

## Files

- `lib/lod-client.mjs` — pure LOD API client (`search`, `getEntry`, `lookup`, `suggest`). No MCP, no I/O wiring.
- `server.mjs` — MCP stdio JSON-RPC wiring only. Logic lives in the client.

## Underlying API

- Docs: <https://lod.lu/api/doc> · OpenAPI: <https://lod.lu/api/doc.json>
- Lookup is two calls: `GET /api/{locale}/advanced-search?query=<word>` → `results[].id`,
  then `GET /api/{locale}/entry/<lod_id>`.

## Manual smoke test

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"lod_lookup","arguments":{"word":"Brout"}}}' \
  | node tools/lod-mcp/server.mjs
```
