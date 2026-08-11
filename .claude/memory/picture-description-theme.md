# Picture-description themes — frame library, vocabulary, image pipeline

The Sproochentest includes a picture-description task. Structure decisions and the
theme contract are in [[exam-track]]; authoring procedure is in the
`letz-content-generator` skill. This file holds the two things that are neither:
the **`@fill` frame library** and the **LOD-verified vocabulary** with its traps.

Shipped: one theme (Schueberfouer funfair), three sub-lessons, photo committed,
**`@fill` blocks live** — 3 / 3 / 4, the first authored fill content in the app.

## The `@fill` frame library

Extracted from real Sproochentest-style sample answers by **recurrence** — these
appeared across two or more answers, or carry a pattern the exam rewards that no
`@sentence` can teach. They are **photo-independent**, which is the whole point and
why they belong in the frame rather than the blanks. `[…]` marks a blank.

**This is a candidate library, not an inventory of shipped content.** The
Schueberfouer sub-lessons realize ten of these shapes, held to the theme's A1–A2
ceiling (so `Op der Foto gesinn ech vill [Persounen]` shipped as
`Um Bild ass vill [lass]`, and the two-clause B1 rows shipped only as the
`well`-justification). The rest are still just candidates — pick from here when
authoring the next photo rather than re-deriving from samples.

**Existential / inventory** — *Wou?* and *Objete*

| Frame | Blanks drill |
|---|---|
| `Op der Foto gesinn ech vill [Persounen].` | scene nouns, plural |
| `Am Vierdergrond gesinn ech e [Chantier].` | position + object |
| `Am Hannergrond ginn et vill héich [Gebaier].` | position + object |
| `Lénks a riets ginn et vill [Butteker] a [Geschäfter].` | two coordinated nouns |
| `Ausserdeem gesinn ech [Stroosseluuchten] an e puer [Beem].` | additive listing |
| `Zum Beispill gesinn ech och e puer [Rucksäck].` | exemplifying listing |
| `D'Persounen sinn an enger [Foussgängerzon] an der Stad.` | place noun |

**Hedged inference** — *Wéini?*, the register the theme exists to teach

| Frame | Blanks drill |
|---|---|
| `Ech mengen, et ass [d'Groussgaass].` | the guessed thing |
| `Ech géif soen, et ass [mëttes] oder [nomëttes].` | time-of-day pair |
| `Ech sinn net sécher, mee villäicht ass et [Wanter].` | season |
| `Et kéint en normalen [Dag] an der [Woch] sinn.` | day/period nouns |
| `Et gesäit no engem [normalen] [Dag] an der Stad aus.` | the split `gesäit … aus` |
| `Villäicht sinn dat [Schüler], déi no der [Schoul] heemginn.` | who + where |
| `…, well d'[Beem] keng [Blieder] hunn.` | the evidence pair |

**Person description**

| Frame | Blanks drill |
|---|---|
| `Ech beschreiwen d'Fra am Vierdergrond op der [lénkser] Säit.` | side |
| `Si ass ongeféier [fofzeg] bis [siechzeg] Joer al.` | number pair |
| `Si huet [kuerz] [donkel] Hoer an dréit e schwaarze [Brëll].` | two adj + noun |
| `Si dréit eng [wäiss] Jackett an eng [schwaarz] Box.` | colour + garment |
| `Ausserdeem hält si eng [blo] [Posch] an der Hand.` | colour + object |
| `Si gesäit [konzentréiert] aus.` | visible-state adjective |

**Two-clause B1 frames** — the shape to prefer, because the n-drop stops at a
comma so a blank at a clause boundary is *safer* than one mid-clause

| Frame | Blanks drill |
|---|---|
| `Ech mengen, et ass [Wanter], well d'[Beem] keng [Blieder] hunn.` | season + evidence |
| `Wann d'Leit déck [Jacketten] undoen, ass et warscheinlech [kal].` | inversion after leading clause |
| `Et kéint en normalen Dag an der Woch sinn, well vill [Leit] ënnerwee sinn.` | evidence noun |
| `Ech weess net, ob dat [Schüler] sinn.` | uncertain-`ob` pattern |
| `Ech gesinn eng Fra, déi eng [Posch] an der Hand hält.` | relative clause + object |
| `Am Vierdergrond ass e Chantier an [dono] kommen d'[Butteker].` | connector + inversion |

The last two rows deliberately teach **inversion** — the half of the pattern
content usually omits. In the last one the blanked `dono` is what licenses the
inverted `kommen`, so the frame teaches the connecting-word rule directly.

**Rules these frames encode**, for adding more (mechanics and enforcement: the
skill's content contract):

1. **Blank the content word, never the grammar.** `d'[Riserad]` eliminates
   masculine tiles for free.
2. **That same rule defuses the Eifeler Regel.** `gesinn ech e [Chantier]` is safe
   because the article intervenes; a frame ending `Ech gesinn [___]` is *unfixable*.
3. **Two blanks need different word classes or a forced order** — `fofzeg bis
   siechzeg` is ascending; `kuerz donkel Hoer` is length-before-colour and swapping
   is wrong Luxembourgish. **Anything joined by `a`/`an` with both sides blanked is
   interchangeable by construction** and breaks the promise — nouns (`vill [X] a
   [Y]`) and predicative adjectives (`si [laang] a [brong]`) alike. Blank one side
   only, or pick words whose article differs. This one cost a rewrite in
   sub-lesson 02.
4. **`villäicht` / `Ech géif soen` / `Ech sinn net sécher, mee …` / `Et kéint …
   sinn` / `Et gesäit no … aus` / `Ech mengen` are six distinct hedges** and real
   samples use all six. Teach them as **frames, not `@word` entries** — a hedge is a
   pattern, and `@word` reduces it to a lexical item the learner cannot deploy.
5. **Never use one hedge as another hedge's distractor.** Because all six are
   mutually substitutable, `sécher` in the `[warscheinlech]` blank is a *second
   correct answer*, not a wrong one — it was authored, shipped nowhere, and caught
   only by dumping the builder's tiles. In a hedge blank, distractors must be a
   different word class (nouns before a bare noun) or contradict the stated evidence
   (`net` against a `well`-clause). Full account: [[fill-in-words-exercise]].

## LOD-verified vocabulary and its traps

Recording the *misses* so the next person-description sub-lesson doesn't repeat
the lookups. Verification procedure: [[lod-mcp]].

**Recurring spelling traps — the German cognate pulls the wrong way:**

| Wrong (German-shaped) | Correct |
|---|---|
| `Virdergrond` | **`Vierdergrond`** — recurs constantly |
| `wahrscheinlech` | **`warscheinlech`** (no `h`) |
| `Risenrad` | **`Riserad`** |
| `Bréll` | **`Brëll`** |

**Not lemmas** (`found: 0`, no usable suggestion — don't keep hunting):
`Aen`/`Aa` (eyes), `Hemd`, `Sandale`, `Bluse`, `Handtäsch`, `Kleeder`, `Schouen`,
`Getränk`.

**Resolve but mean the wrong thing:** `Kleedchen` is a vest/undergarment, not a
dress (`Kleed` is the dress); `Polo` glosses only the sport; `Buuscht` is
colloquial for a mop of hair; `Aarm` (m, arm) is a homograph of `aarm` "poor";
`schéngen` is both "to shine" and "to seem", so the gloss must disambiguate;
`Wand` (m, wind) collides with `Wand` (f, wall).

**`Bauzonk` — flagged, not corrected.** `found: 0`, and LOD's suggestions
(`Bauzon`/`Bauzone`) don't mean a fence. But `Zonk` (m) *is* "fence", so `Bauzonk`
is a plausible compound and the suggestions are near-miss noise. Safe rewrite if
ever needed: `e Chantier mat engem Zonk`.

**Confirmed and available.** Appearance: `Hoer` (n), `Posch` (f), `Box` (f —
trousers *and* shorts), `Jeans` (f), `T-Shirt` (m), `Schung` (m), `Hand` (f),
`Brëll`, `Sonnebrëll`, `Gesiicht` (n), `Jackett` (f), `Kleed` (n), `Kap` (f),
`Faarf` (f), `Kapp` (m), `Schëller` (f), `donkel`, `hell`, `laang`, `kuerz`,
`jonk`, `beige`, `halen`, `lächelen`, `laachen`, `ausgesinn`, `droen`.
Weather/season: `Wieder` (n), `Himmel` (m), `Sonn` (f), `Wollek` (f), `Reen` (m),
`Schiet` (m), `sonneg`, `waarm`, `dréchen`, `kal`, `naass`, `Summer` (m),
`Fréijoer` (n), `Hierscht` (m), `Wanter` (m), `Joreszäit` (f), `Loft` (f),
`Temperatur` (f), `Grad` (m), `reenen`, `mengen`.
Urban scene: `Foussgängerzon` (f), `Groussgaass` (proper noun — LOD lists it as the
Luxembourgish name of the Grand-Rue, so it is safe as a named place), `Buttek` (m,
pl. `Butteker`), `Geschäft` (n), `Gebai` (n), `Stroosseluucht` (f), `Schëld` (n),
`Reklamm` (f), `Chantier` (m), `Zonk` (m), `Rucksak` (m), `Akafstut` (f),
`Kommissioun` (f), `Täsch` (f), `Persoun` (f), `Schüler` (m), `Mantel` (m),
`Schal` (m), `déck`, `schick`, `rosa`, `konzentréiert`, `undoen` (→ `ugedoen`).
Function words the frames need: `villäicht`, `ausserdeem`, `ongeféier`, `wéineg`,
`verschidden`, `lass`, `ënnerwee`, `sécher`, `Beispill` (n), `Hannergrond` (m),
`Vierdergrond` (m), `mëttes`, `nomëttes`, `dobaussen`, `bedeckt`, `Woch` (f),
`Blat` (n, pl. `Blieder`), `Mëttegpaus` (f), `treffen`, `heemgoen`, `akafen`.

**Plurals are separate `@word` entries** where a sentence uses the plural — the
assembled tile must be a word the learner was actually taught. Corollary: teach
**only** the number a sentence actually uses. An unused singular is a free Element
standing between the learner and the 100% gate.

## Converting a `@question` block to plain description

Three patterns, worth reusing rather than deleting already-verified content:

- **Answer was already a description** → drop the `@question` line, keep the rest.
- **Answer was a yes/no reply** → restate as an assertion (`Nee, hir Hoer sinn net
  kuerz.` → `Hir Hoer sinn net kuerz.`). Dropping `Jo`/`Nee` also removes a free
  first tile that made those items easier than the rest.
- **Answer was attitude** → cut entirely.

**Converted blocks need `@distractor-en` added.** `@question` blocks are
direction-locked to en→lu so they typically carry only `@distractor-lu`, but a
plain `@sentence` is presented both ways and would otherwise have zero distractors
in lu→en. **The file still parses**, so nothing warns you.

## Images: pipeline and layout

Originals are dropped into a **gitignored staging folder** (`public/assets/tmp/`)
for review — never committed, never referenced by a `.letz` file (nothing there is
served), and never deleted by an agent (it's the user's working copy).

**Optimization is mandatory and test-enforced:** WebP, pre-cropped 16:9, ≤880px
wide (2× the largest iPhone logical width). To show the scale of what this is for:
the first photo's source PNG was 5.2 MB and its shipped WebP ~76 KB — a ~68×
reduction at a size no learner can tell apart on a phone.
Recipe and bounds are in the skill's format reference. Watch for source artifacts
when cropping: this scan had a page-number badge the first crop left in.

Implementation facts worth not rediscovering:

- **`AtImageAlt` must precede `AtImage` in the token list.** Chevrotain is
  maximal-munch over an ordered list, so the reverse order lexes `@image-alt` as
  `AtImage` + a stray `-alt` Text run. There is a regression test; the same trap
  applies to any future `@x-y` token.
- **Values must be quoted.** A bare `=` inside unquoted `Text` terminates the run,
  so an unquoted path with a query string fails to parse.
- **Both directives fold onto `meta` in `visitLesson`, not inside the header rule**,
  so they are order-independent. Absent fields are **omitted** rather than set to
  `undefined` (conditional spread) — that is what keeps existing
  `toEqual({id,title,level})` assertions passing. Don't "simplify" it.
- **One producer feeds both render sites** (`toLessonImageView`), returning a
  `photo | placeholder | null` union, so the theme path and the Session share one
  placeholder rule and cannot diverge. `@image-alt` doubles as the placeholder
  caption, so it is load-bearing content, not just a11y text.
- **The full-size image renders outside the keyed Exercise components.** Inside
  them it would remount on every Slot transition, and a photo the learner is
  mid-description of must not flicker.
- **`max-w-none` is load-bearing on the photo branch.** Tailwind preflight sets
  `img { max-width: 100% }`, which silently clamped the full-bleed back to the
  content box. It bit only the `<img>`, not the placeholder `<div>`, so while no
  photo was committed the bug was invisible.
- **Full-bleed cancels the shell's horizontal padding** via a `-mx-6` / `+3rem`
  pair. **If `<main>`'s padding changes, change these together.** Borders live in
  the size table so full-bleed gets `border-y-2` only — rounded corners flush
  against the phone-frame edge read as a rendering glitch.
- **The tightened gaps elsewhere are a consequence, not taste.** At 428px the photo
  is ~28% of the scroll viewport; before tightening, a word-match Slot under it
  overflowed by 47px. **Don't restore roomier spacing without re-measuring in the
  430×932 frame.** The `min-h` reserves were halved, not deleted: they stop the
  token pool jumping as chips move between rows.

Related: [[exam-track]], [[fill-in-words-exercise]], [[lod-mcp]],
[[frontend-decisions]].
