/**
 * The one definition of "same text": tile identity, answer grading, and
 * `@fill`/`@sentence` disjointness all compare through this.
 *
 * Consequences when judging whether two tiles are distinct — case folds, so `Sonn`
 * and `sonn` are one tile; apostrophes are stripped, so `d'Bild` and `dBild` are
 * too; hyphens and diacritics are kept, so `Wollek` ≠ `Wolleken`.
 */
export const normalizeAnswer = (s: string): string =>
  s
    .replace(/[.,!?;:'"''"]+/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

/** No space across an apostrophe: `d'` + `Mamm` is one word. */
export const joinAssembled = (tokens: string[]): string =>
  tokens.reduce((acc, token, i) => {
    if (i === 0) return token;
    const glue = token.startsWith("'") || token.startsWith("'") || acc.endsWith("'") || acc.endsWith("'")
      ? ""
      : " ";
    return acc + glue + token;
  }, "");
