# Luxembourgish grammar for `.letz` authoring

The language facts that bite while authoring, all LOD-verified. Referenced from
`SKILL.md` and from `.claude/memory/*`; keep it the single copy.

Verification tooling: the `lod` MCP server (`lod_lookup`, `lod_suggest`) — see
`.claude/memory/lod-mcp.md`.

---

## 1. Eifeler Regel (the n-drop)

Final `-n`/`-nn` **drops** before a word starting with anything **outside**
U N I T E D Z O A H.

```
ech ginn mat menger Famill   →  ech gi mat …        (m — drops)
ech kucken just              →  ech kucke just      (j — drops)
ech kafen dacks              →  ech kafen dacks     (d — keeps)
ech sichen e Kaddo           →  ech sichen e Kaddo   (e — keeps)
```

**Two exemptions that are easy to get wrong:**

| Exemption | Why | Example |
|---|---|---|
| The rule does **not cross a comma** | it is phonological sandhi across an unbroken stream; a clause boundary is a pause | `Wann ech Zäit hunn, ginn ech akafen.` keeps `hunn` |
| **Diacritics fold first** | `é`/`ë`/`ä` are E/A and *are* in the list | `Ech iessen, éier …` keeps `-n` on both counts |

**It applies to verbs, not just nouns** — this is the failure mode. `sinn` / `hunn`
/ `ginn` before an adjective or adverb is the **highest-frequency bug site** in
descriptive content, because predicative adjectives are exactly what the
`@sentence` register pushes you toward (`si sinn laang` → `si si laang`).

**Prefer rewriting the clause over teaching a form the learner must un-learn.**
Two shipped precedents: `si sinn laang` became `Hir Hoer sinn net kuerz.` with
`laang` demoted to a distractor; `Ech gesinn kee Reen` became
`Op dem Bild ass kee Reen.`

**Audit it, don't eyeball it:** `npm run check-content` flags every `-n`-final word
followed by a non-ZOAH word. It over-reports by design. Known false positives —
the rule applies to *inflectional* final n, not stem-final:

- stem-final `-nn` nouns — `D'Sonn schéngt`, `d'Bunn`, `de Mann`
- plural noun before a noun — `Wochen Congé`
- proper names — `Spuenien geflunn`

**`@fill` corollary:** a blank directly after an `-n`-final word makes the correct
frame depend on which tile is placed, so no fixed frame is correct — the frame is
*unfixable*, not merely wrong. Keep a determiner in the frame
(`gesinn ech e [Chantier]`) or put the blank after a comma. The audit script cannot
catch this: the authored frame looks fine.

---

## 2. Conjunctions — verb goes last

All LOD-verified as `CONJ`. Mixing these up with the connecting words in §3 *is*
the characteristic B1 error, so content must keep them apart.

| Form | Meaning | Example |
|---|---|---|
| `well` | because | `Ech iesse kee Fleesch, well ech Vegetarier sinn.` |
| `wann` | if / when (certain) | `Wann ech Zäit hunn, ginn ech akafen.` |
| `falls` | if (in case) | `Ech bleiwen doheem, falls et reent.` |
| `ob` | whether / if (uncertain) | `Ech weess net, ob ech kommen.` |
| `datt` / `dass` | that | `Ech denken, datt Fleesch gesond ass.` |
| `obwuel` | although | `Ech maache Sport, obwuel ech midd sinn.` |
| `säit` / `säitdeem` | since (**time**, not cause) | `Ech fille mech besser säitdeem ech méi fréi schlofen.` |
| `éier` / `bevir` | before | `Ech iessen, éier ech op d'Aarbecht fueren.` |
| `wärenddeems` | while | `Ech lauschtere Musek, wärenddeems ech lafen.` |
| `nodeems` | after | `Ech duschen, nodeems ech trainéiert hunn.` |
| `bis` | until | `Ech waarden, bis den Dokter mech rifft.` |
| `andeems` | by (doing) | `Ech verbessere mech, andeems ech vill üben.` |

⚠️ **Class handouts circulate two wrong forms.** A handout is a teaching aid, not a
dictionary:

- **`säitdeems`** → `säitdeem` or `säit`. LOD returns `found: 0`; the `-s` is
  analogy from `nodeems`/`andeems`/`wärenddeems`, which genuinely carry it.
- **`befir`** → `bevir`. LOD returns `found: 0` and suggests `bevir`.

`datt` and `dass` are both valid. Pick one per theme rather than teaching both as
separate Elements.

---

## 3. Connecting words — order-neutral

`an` (and) · `oder` (or) · `mee` / `awer` (but). They join two **main** clauses and
**cannot themselves cause inversion** — they sit outside the clause's word order.
To get inversion you need an adverb in first position:

- ✗ `Ech gi moies akafen an ech ginn an de Fitness.`
- ✓ `Ech gi moies akafen an **dono** ginn ech an de Fitness.`

Verified adverbial connectors: `dono` (afterwards), `dofir` (that's why), `deemno`
(therefore).

**Content must demonstrate both inversion patterns:**

1. **Subordinate clause second** — `[main], well [subject … verb]`.
2. **Subordinate clause first → main clause inverts** — `Wann ech Zäit hunn, ginn
   ech akafen.` The leading clause occupies first position, so the main verb
   precedes its subject. **This is the harder half and the one content usually
   omits — include it deliberately.**

---

## 4. Homograph traps for word-match glosses

Word-match shows several pairs at once, so an ambiguous gloss makes a pair
unmatchable-by-reasoning. Disambiguate these explicitly:

| Word | Collides with |
|---|---|
| `mee` (but) | `Mee` (m, "May") |
| `awer` (but) | also ADV "nevertheless", and a modal particle |
| `wann` (if/when) | two nouns (`Wann` f "winch"; "field bindweed") |
| `éier` (before) | `Éier` (f, "honour") |
| `Bank` | bank *and* bench (`Bänk`) |
| `Kéis` | cheese *and* nonsense |
| `Post` | masculine *and* feminine entries |
| `schéngen` | "to shine" *and* "to seem" |
| `Wand` | m "wind" *and* f "wall" |
| `Aarm` (m, arm) | `aarm` (poor) |

---

## 5. Noun entries

Always use the **definite article** form, and confirm gender with `lod_lookup`
rather than inferring it from a source PDF: `m` → `de`/`den`, `f` → `d'`,
`n` → `d'`/`den`.

Split singular and plural into separate `@word` entries — the assembled tile must
be a word the learner was actually taught. But teach **only the number a sentence
actually uses**: an unused singular is a free Element standing between the learner
and the 100% pass gate.

The indefinite form is **not** a separate entry — it duplicates the definite for no
learning value (this was cleaned out of the A1 course; see
`.claude/memory/lesson-throughput.md`).
