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
- `lod_lookup { words[]|word, locale?=en, maxEntries?=3, verbose?=false }` →
  `{ locale, results[] }`; each result `{ word, found, entries[] }` with `lemma`,
  `pos`, `gender` (`m`/`f`/`n`), `senses[]` — or `{ word, found: 0, suggestions[] }`.
- `lod_suggest { words[]|word, locale? }` → `{ locale, results[] }`, each
  `{ word, suggestions[] }`. Rarely needed now that a `lod_lookup` miss returns
  them inline — use it for words you are *not* looking up, e.g. inflected forms
  inside a `@lu` sentence.

**How to apply:**
- **Always batch.** Pass the whole word list as `words: [...]` (≤60, deduped,
  6-way concurrent, order preserved). One call per word costs one model round
  trip per word; that — not the ~200 ms of network — is what made verification
  passes slow. Batching + the slim default took a 14-word pass from ~6.3k
  tokens to ~800.
- **A miss already carries its suggestions.** 0 results *with* suggestions =
  misspelled; 0 results with *no* suggestions = usually a legitimate inflected
  form or compound (`Kanner`, `Beem`, `Keessebong`). Don't chase it with a
  second `lod_suggest`.
- **`senses[]` folds in the clarifier** (`"coffee (beans)"`), which is how the
  slim shape stays safe for polysemy: `Bank` = bank *and* bench (`Bänk`), `Kéis`
  = cheese *and* nonsense, `Post` masc/fem. First sense still isn't always right
  — needs a human/context pass. `verbose: true` restores `ipa`/`declensionInfo`.

**⚠️ The upstream spellchecker is nondeterministic (found Aug 2026).**
`/spellchecker/suggestions/` returns **different bodies for identical
requests**. Measured on `Lëtzebuesch`: 6/12 calls returned `[]`, the rest
`["Lëtzebuergesch"]` — all HTTP 200, bimodal latency (~349 ms → `[]`, ~436 ms →
answer). Not an encoding/normalization artifact (identical bytes sent); looks
like an inconsistent backend node behind lod.lu's nginx.

This is a **correctness** issue, not noise, because an empty list is *meaningful*
here: the authoring contract reads "no suggestions" as "legitimate inflected
form, not an error" (`Kanner`, `Beem`, `Keessebong`). A flaky empty silently
converts a real misspelling into an all-clear — the exact failure the
dictionary check exists to prevent. `suggest()` now retries while empty
(`SUGGEST_ATTEMPTS = 3`; recovery 36% → 64% → 93%); true negatives still return
`[]`, so it never invents a suggestion. Retry policy is extracted as the pure
`retryWhileEmpty(fetchList, attempts)` and tested with a stub.

**How to apply:** a single empty result on a *suspicious-looking* word is still
not proof it is correct — ask again or cross-check with `lod_lookup`. The
"0 results with no suggestions = fine" rule in
`.claude/skills/letz-content-generator/references/content-contract.md` holds
only because of this retry; don't lower the attempt count without re-measuring.

**Why the response is slim (Aug 2026):** measured `lod_lookup` at ~450 tokens
per word, of which ~96% was unused for authoring an `@word` gloss. `examples` is
empty for *every* entry in *every* locale, and `ipa`/`declensionInfo`/sense
numbering are never consulted to choose a gloss, so all four are dropped by
default. `clarifiers` were explicitly **kept** — they are the only thing
separating `Kaffi` = coffee from `Kaffi` = breakfast, so dropping them would
have reintroduced the first-sense-wins error the dictionary check exists to
prevent. Pure parts (`slimEntry`, `wordList`) are tested in
`tests/tools/lod-client.test.ts`; network paths stay untested per the no-mocks
rule — use the README smoke test.

**API recipe** (if rebuilding): docs at <https://lod.lu/api/doc> (OpenAPI at
`/api/doc.json`). Lookup is two calls — `GET /api/{locale}/advanced-search?query=<w>`
→ `results[].id`, then `GET /api/{locale}/entry/<lod_id>`. Translations live at
`entry.microStructures[].grammaticalUnits[].meanings[].targetLanguages[locale].parts[]`
filtered to `type=="translation"`. `partOfSpeechLabel` tail (`SUBST+N/M/F`) gives gender.

Pure client: `lib/lod-client.mjs`. Protocol wiring only: `server.mjs`. Relates to
the `letz-content-generator` skill (content authoring source of truth).
