/**
 * Layer 1 — answer-text comparison and joining.
 *
 * These two functions decide what counts as the same text across the whole app:
 * tile identity, answer grading, and the `@fill`/`@sentence` disjointness rule.
 * They live here rather than inside one Exercise's folder because Layer-1
 * builders and BOTH Layer-2 mechanics need them — from `SentenceBuilder/` they
 * were being imported upward and sideways, against the layering rule.
 */

/**
 * The single comparison function for answer text.
 *
 * Strips punctuation, collapses whitespace, folds case. Consequences worth
 * knowing when reasoning about tile distinctness:
 * - **Case is folded** — `Sonn` and `sonn` are the same tile.
 * - **Apostrophes are stripped** — `d'Bild` → `dbild`, so an apostrophe cannot be
 *   the only thing distinguishing two tiles.
 * - **Hyphens and diacritics are kept** — `T-Shirt` keeps its hyphen, and
 *   `Wollek` ≠ `Wolleken`.
 */
export const normalizeAnswer = (s: string): string =>
  s
    .replace(/[.,!?;:'"''"]+/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

/**
 * Joins assembled tiles back into a sentence, with no space across an apostrophe
 * boundary — `d'` + `Mamm` is one word, not two.
 */
export const joinAssembled = (tokens: string[]): string =>
  tokens.reduce((acc, token, i) => {
    if (i === 0) return token;
    const glue = token.startsWith("'") || token.startsWith("'") || acc.endsWith("'") || acc.endsWith("'")
      ? ""
      : " ";
    return acc + glue + token;
  }, "");
