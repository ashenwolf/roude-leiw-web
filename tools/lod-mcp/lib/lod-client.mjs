/**
 * Pure client for the LOD (Lëtzebuerger Online Dictionnaire) public API.
 *
 *   https://lod.lu/api/doc   (OpenAPI: https://lod.lu/api/doc.json)
 *
 * Two-step lookup, mirrored from the lod.lu front-end:
 *   1. GET /api/{locale}/advanced-search?query=<word>  → results[].id (lod_id)
 *   2. GET /api/{locale}/entry/<lod_id>                 → full article
 *
 * The article's translations live at
 *   entry.microStructures[].grammaticalUnits[].meanings[].targetLanguages[lang].parts[]
 * where each part has a `type` ("translation", "semanticClarifier", "example", …).
 *
 * No MCP, no I/O wiring here — just `fetch` against the public API and plain
 * data out. Keep it dependency-free (Node 18+ global `fetch`).
 */

const BASE = "https://lod.lu/api";
const LOCALES = new Set(["lb", "de", "fr", "en", "pt", "nl"]);
const DEFAULT_LOCALE = "en";

const requestInit = {
  headers: { Accept: "application/json", "User-Agent": "roude-leiw-lod-mcp/1.0" },
};

const normalizeLocale = (locale) =>
  LOCALES.has(locale) ? locale : DEFAULT_LOCALE;

async function apiGet(path, locale) {
  const url = `${BASE}/${normalizeLocale(locale)}${path}`;
  const res = await fetch(url, requestInit);
  if (!res.ok) {
    throw new Error(`LOD ${res.status} ${res.statusText} for ${url}`);
  }
  return res.json();
}

/** SUBST+M → "m", SUBST+F → "f", SUBST+N → "n", else null. */
const genderOf = (partOfSpeechLabel) => {
  const tail = String(partOfSpeechLabel ?? "").split("+")[1];
  return tail === "M" || tail === "F" || tail === "N" ? tail.toLowerCase() : null;
};

/** Pull the parts of a given `type` for one target language out of a meaning. */
const partsOfType = (meaning, locale, type) =>
  (meaning.targetLanguages?.[locale]?.parts ?? [])
    .filter((p) => p.type === type)
    .map((p) => p.content);

/** Flatten one entry into the meanings we care about for the target `locale`. */
const meaningsFor = (entry, locale) =>
  (entry.microStructures ?? []).flatMap((ms) =>
    (ms.grammaticalUnits ?? []).flatMap((gu) =>
      (gu.meanings ?? []).map((m) => ({
        number: m.number ?? null,
        declensionInfo: m.declensionInfo ?? null,
        translations: partsOfType(m, locale, "translation"),
        clarifiers: partsOfType(m, locale, "semanticClarifier"),
        examples: partsOfType(m, locale, "example"),
      })),
    ),
  );

/** Raw search → [{ id, word_lb, pos }]. */
export async function search(word, locale = DEFAULT_LOCALE) {
  const data = await apiGet(`/advanced-search?query=${encodeURIComponent(word)}`, locale);
  return (data.results ?? []).map((r) => ({
    id: r.id,
    word_lb: r.word_lb,
    pos: r.pos,
  }));
}

/** Full entry by lod_id, projected to the shape consumers want. */
export async function getEntry(lodId, locale = DEFAULT_LOCALE) {
  const data = await apiGet(`/entry/${encodeURIComponent(lodId)}`, locale);
  const entry = data.entry ?? {};
  return {
    lod_id: entry.lod_id ?? lodId,
    lemma: entry.lemma ?? null,
    partOfSpeech: entry.partOfSpeechLabel ?? entry.partOfSpeech ?? null,
    gender: genderOf(entry.partOfSpeechLabel),
    ipa: entry.ipa ?? null,
    meanings: meaningsFor(entry, normalizeLocale(locale)),
  };
}

/**
 * One-call convenience: search a word, then resolve up to `maxEntries`
 * matching articles into full projected entries.
 * Returns { word, locale, found, entries }.
 */
export async function lookup(word, { locale = DEFAULT_LOCALE, maxEntries = 3 } = {}) {
  const hits = await search(word, locale);
  const chosen = hits.slice(0, Math.max(1, maxEntries));
  const entries = await Promise.all(chosen.map((h) => getEntry(h.id, locale)));
  return { word, locale: normalizeLocale(locale), found: entries.length, entries };
}

/** One raw call to the spellchecker endpoint. Non-array bodies → []. */
async function suggestOnce(word, locale) {
  const data = await apiGet(`/spellchecker/suggestions/${encodeURIComponent(word)}`, locale);
  return Array.isArray(data) ? data : [];
}

/** How many times to ask before believing an empty suggestion list. */
export const SUGGEST_ATTEMPTS = 3;

/**
 * Spellchecker suggestions for a (possibly misspelled) word.
 *
 * ⚠️ The upstream endpoint is **nondeterministic**: identical word, identical
 * locale, HTTP 200 both times, but the body alternates between the real answer
 * and `[]`. Measured on `Lëtzebuesch` — 6/12 empty, with a clean bimodal
 * latency split (~349 ms → `[]`, ~436 ms → `["Lëtzebuergesch"]`), which points
 * at an inconsistent backend node behind lod.lu's nginx rather than anything we
 * send. It is not a normalization or encoding issue: the request is identical
 * across runs.
 *
 * This matters because the authoring contract reads a *empty* suggestion list
 * as "legitimate inflected form, not an error" (`Kanner`, `Beem`). A flaky
 * empty therefore doesn't degrade gracefully — it silently converts a real
 * misspelling into an all-clear.
 *
 * So: retry while empty. Measured recovery on the flaky word — 1 attempt 36%,
 * 2 → 64%, 3 → 93%. Words that genuinely have no suggestions still return `[]`
 * (verified on `Kanner`/`Beem`/`Kaffi`), so retrying costs a few hundred ms on
 * a true negative and never invents a suggestion.
 */
export const suggest = (word, locale = DEFAULT_LOCALE, attempts = SUGGEST_ATTEMPTS) =>
  retryWhileEmpty(() => suggestOnce(word, locale), attempts);

/**
 * Call `fetchList` until it yields a non-empty array, at most `attempts` times.
 * Separated from `suggest` so the retry policy is testable with a plain stub
 * function — no network, no mocks.
 */
export async function retryWhileEmpty(fetchList, attempts = SUGGEST_ATTEMPTS) {
  return Array.from({ length: Math.max(1, attempts) }).reduce(async (accPromise) => {
    const acc = await accPromise;
    return acc.length > 0 ? acc : fetchList();
  }, Promise.resolve([]));
}

// --- Slim projection -------------------------------------------------------
//
// `getEntry` returns everything the API offers. For the dominant use case —
// verifying an `@word` gloss and its gender while authoring `.letz` content —
// most of that is dead weight in an LLM's context window:
//
//   · `examples` is empty for every entry in every locale (measured), so it
//     costs tokens and carries no signal.
//   · `ipa`, `declensionInfo` and `number` are never consulted to pick a gloss.
//   · translations repeat across senses ("coffee" ×4 for `Kaffi`).
//
// `clarifiers` are the exception and must survive: they are what distinguishes
// `coffee (beans)` from `breakfast`, i.e. exactly the polysemy trap that makes
// a first-sense-wins reading wrong. Pass `verbose: true` for the full shape.

/** Collapse one meaning into "coffee (beans)". Empty translations → null. */
const senseText = (meaning) => {
  const translations = meaning.translations.join(", ");
  if (!translations) return null;
  const clarifier = meaning.clarifiers.join(", ");
  return clarifier ? `${translations} (${clarifier})` : translations;
};

/** Full entry → { lemma, pos, gender, senses[] }, senses deduplicated. */
export const slimEntry = (entry) => ({
  lemma: entry.lemma,
  pos: entry.partOfSpeech,
  gender: entry.gender,
  senses: [...new Set(entry.meanings.map(senseText).filter(Boolean))],
});

// --- Argument coercion -----------------------------------------------------

/**
 * Accept either `words: [...]` or the single-word `word` form, in one list.
 * Lives here rather than in the server so it is testable without starting the
 * stdio loop.
 */
export const wordList = ({ words, word } = {}) => {
  const list = (Array.isArray(words) ? words : [])
    .concat(typeof word === "string" ? [word] : [])
    .map((w) => String(w).trim())
    .filter(Boolean);
  if (list.length === 0) throw new Error('Provide `words: [...]` or `word: "..."`.');
  return list;
};

// --- Batch lookup ----------------------------------------------------------

const MAX_CONCURRENCY = 6;

const chunk = (items, size) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, i * size + size),
  );

/** Concurrency-bounded `Promise.all`: batches of `limit` run in sequence. */
const mapLimit = (items, limit, fn) =>
  chunk(items, limit).reduce(async (accPromise, group) => {
    const acc = await accPromise;
    return [...acc, ...(await Promise.all(group.map(fn)))];
  }, Promise.resolve([]));

/**
 * Look up one word, projecting to the slim shape unless `verbose`.
 *
 * A miss auto-runs the spellchecker, because the authoring contract reads
 * "0 results **with** suggestions" as the error signal while "0 results with
 * **no** suggestions" is a legitimate inflected form (`Kanner`, `Beem`). Doing
 * it here collapses that two-call recovery dance into one round trip.
 */
async function lookupOne(word, { locale, maxEntries, verbose }) {
  try {
    const { entries } = await lookup(word, { locale, maxEntries });
    if (entries.length === 0) {
      return { word, found: 0, suggestions: await suggest(word, locale) };
    }
    return { word, found: entries.length, entries: verbose ? entries : entries.map(slimEntry) };
  } catch (e) {
    // Isolate the failure: one unreachable word must not void the whole batch.
    return { word, error: String(e?.message ?? e) };
  }
}

/**
 * Look up many words in one call — the batching that keeps a 30-word
 * verification pass from costing 30 model round trips.
 * Returns { locale, results: [{ word, found, entries|suggestions|error }] }.
 */
export async function lookupMany(words, { locale = DEFAULT_LOCALE, maxEntries = 3, verbose = false } = {}) {
  const unique = [...new Set(words)];
  const results = await mapLimit(unique, MAX_CONCURRENCY, (word) =>
    lookupOne(word, { locale, maxEntries, verbose }),
  );
  return { locale: normalizeLocale(locale), results };
}

/**
 * Spellcheck many words in one call — same batching rationale as `lookupMany`.
 * Errors are isolated per word so one failure can't void the batch.
 * Returns { locale, results: [{ word, suggestions }|{ word, error }] }.
 */
export async function suggestMany(words, { locale = DEFAULT_LOCALE } = {}) {
  const unique = [...new Set(words)];
  const results = await mapLimit(unique, MAX_CONCURRENCY, async (word) => {
    try {
      return { word, suggestions: await suggest(word, locale) };
    } catch (e) {
      return { word, error: String(e?.message ?? e) };
    }
  });
  return { locale: normalizeLocale(locale), results };
}
