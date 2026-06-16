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

/** Spellchecker suggestions for a (possibly misspelled) word. */
export async function suggest(word, locale = DEFAULT_LOCALE) {
  const data = await apiGet(`/spellchecker/suggestions/${encodeURIComponent(word)}`, locale);
  return Array.isArray(data) ? data : [];
}
