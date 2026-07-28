# LOD MCP server — authoritative Luxembourgish translation checks

**What:** `tools/lod-mcp/` is a zero-dependency MCP stdio server wrapping the
official Lëtzebuerger Online Dictionnaire public API ([lod.lu](https://lod.lu)).
Registered in repo-root `.mcp.json` as server `lod`. Restart Claude Code to load it.

**Why:** When authoring/curating `.letz` content, translations and grammatical
**gender** (which fixes the LU article) should come from the official dictionary,
not LLM guessing. Built June 2026 after finding that A1.1 sentences draw heavily on
vocabulary never taught as `@word` pairs (sentence-token coverage was 5–37% per
lesson) — see that gap analysis when curating word pools.

**Tools:**
- `lod_lookup { word, locale?=en, maxEntries?=3 }` → entries with `lemma`,
  `partOfSpeech`, `gender` (`m`/`f`/`n`), `ipa`, `meanings[]` (translations,
  clarifiers, examples).
- `lod_suggest { word, locale? }` → spellchecker suggestions.

**How to apply:**
- Inflected forms, typos, and proper names return `found: 0` (graceful, not an
  error) — this auto-filters non-lemmas during a gap pass. Use `lod_suggest` to
  recover the correct lemma.
- Watch polysemy/homographs: e.g. `Bank` = bank *and* bench (`Bänk`), `Kéis` =
  cheese *and* nonsense, `Post` masc/fem. First sense isn't always right — needs a
  human/context pass.

**API recipe** (if rebuilding): docs at <https://lod.lu/api/doc> (OpenAPI at
`/api/doc.json`). Lookup is two calls — `GET /api/{locale}/advanced-search?query=<w>`
→ `results[].id`, then `GET /api/{locale}/entry/<lod_id>`. Translations live at
`entry.microStructures[].grammaticalUnits[].meanings[].targetLanguages[locale].parts[]`
filtered to `type=="translation"`. `partOfSpeechLabel` tail (`SUBST+N/M/F`) gives gender.

Pure client: `lib/lod-client.mjs`. Protocol wiring only: `server.mjs`. Relates to
the `letz-content-generator` skill (content authoring source of truth).
