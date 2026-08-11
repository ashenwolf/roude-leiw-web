# Content verification — the checklist

Every check below has caught a real defect that eye-review had already passed.
Run them in order: cheapest and highest-yield first.

Bounds and error messages: `content-contract.md`. Grammar facts:
`luxembourgish-grammar.md`.

---

## Before authoring

- [ ] **Decide the theme `kind`** (`topic` | `picture`) — it selects the whole
      content contract. See `SKILL.md`.
- [ ] **Topic themes only: interview the user.** REQUIRED, not optional. Ask the
      theme's exam questions conversationally and use *their* answers. Never invent
      exam answers. Record in the file header that the answers are personal, or a
      later cleanup pass will neutralize them.
- [ ] **Check what the theme already teaches** — a later sub-lesson must not
      re-teach an earlier one's word. The pass-gate makes it a prerequisite and stat
      keys are shared app-wide.

## While authoring

- [ ] **LOD every `@word` LU side** *and* **every inflected form inside a `@lu`
      sentence.** The sentences are where the mistakes hide. "Zero results **with**
      suggestions" is the error signal; a bare `found: 0` is normal for legitimate
      plurals (`Grompere`, `Bicher`, `Kanner`, `Beem`) and compounds
      (`Keessebong`, `Wiesselgeld`).
- [ ] **Watch the German-cognate traps** — `Vierdergrond` not `Virdergrond`,
      `warscheinlech` not `wahrscheinlech`. See `luxembourgish-grammar.md` § 4 for
      the homograph list too.
- [ ] **Distinct EN gloss per entry**, even for LU synonyms the dictionary
      translates identically (`d'Geld` / `de Su` both "the money" → one becomes "the
      coin").
- [ ] **`@fill`: keep determiners and prepositions in the fixed frame**, and check
      every distractor against **every** blank. No test can see either rule.

## Before committing

Run all four. The first two are one command each.

- [ ] **`npx vitest run tests/integration`** — bracket balance, blank/distractor
      counts, tile distinctness, R5 adjacency, `@fill`/`@sentence` disjointness,
      stat-key collisions, theme contracts, image budget, duplicate `@word` within a
      theme. Fails the build, names the file.
- [ ] **`npm run check-content`** — the Eifeler-Regel n-drop audit. Advisory: it
      over-reports and you adjudicate. Known false positives are printed with the
      results.
- [ ] **Distractor audit through the real builder.** `buildSentenceExercise`
      silently drops any distractor token colliding with an answer token, so a
      multi-word EN distractor like "at the top" against an answer containing
      "at"/"the" degrades to a bare "top" tile. Invisible in the source.
      - Signature: `(entry, requestedDirection, lessonVocab)` — no rng argument.
      - Build the accepted-token set with the exported `tokenizeSentence(answer,
        lang)`, **not** a whitespace split, or `d'Posch`-style tokens make the dump
        over-report.
      - Parser entry point is **`parseLetz(content, fallbackId)`** from
        `src/lib/letz-parser/index.ts` — the only export there. (`parseLetzContent`
        is the async wrapper in `src/exercise/letz-parser.ts`; guessing the wrong one
        costs a run.)
      - A throwaway harness must live under `tests/` to be picked up by the vitest
        config. The same dump is the cheapest place to assert `item.question` is
        undefined across a picture theme.
- [ ] **`npm run build`** before claiming done (runs tests + lint + typecheck).

---

## Why these are split between a script and tests

| Check | Where | Why |
|---|---|---|
| bracket/blank/distractor counts, disjointness, key collisions, theme contracts, image budget, duplicate `@word` | integration tests | exactly decidable → gate the build |
| Eifeler-Regel n-drop | `scripts/check-content.mjs` | heuristic with unavoidable false positives (stem-final `-nn`, proper names) → a build gate would need an allowlist growing with every file |
| distractor survival | throwaway harness | needs the real builder over content that changes shape per theme |
| LOD verification | MCP tools, by hand | network-dependent and needs human judgement on polysemy |

**A vacuously green test proves nothing.** The `@fill` rules were verified by
planting a deliberately broken probe file and confirming each rule fires by name —
necessary at the time, because no content existed to run them against. They now run
over the Schueberfouer picture theme's 10 blocks, but a *new* rule is vacuous until
proven otherwise: **if you extend them, re-plant a probe.**

**The distractor-survival harness is not optional for `@fill`.** Both real
ambiguity bugs in the first authored fills were invisible to every build gate and
surfaced only by dumping the tiles the builder actually produces — see
[[fill-in-words-exercise]] § First content shipped.
