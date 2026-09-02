/**
 * Slug derivation for pre-generated audio files.
 *
 * MUST stay byte-identical to `slugify` in `scripts/lib/letz-audio.mjs` — the
 * generator names files with the script's copy, the app derives URLs with this
 * one, and any divergence is a silent 404. The parity test
 * (tests/src/lib/audio-slug.test.ts) imports both and compares them across the
 * real question corpus.
 *
 * Duplicated rather than shared because the scripts are deliberately plain
 * ESM Node with no build step, and importing `.mjs` from the app's
 * bundler-targeted TS tree would poke a hole in that separation for ~10 lines.
 */

/**
 * Convert a Luxembourgish phrase into a filesystem-safe slug consisting only
 * of lowercase ASCII letters, digits, and single hyphens.
 *
 *   "Wéi geet et?"  -> "wei-geet-et"
 *   "d'Schockela"   -> "d-schockela"
 */
export const audioSlug = (input: string): string =>
  input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * URL of a question's pre-generated audio, given the directory its .letz file
 * was served from (e.g. `/assets/exam/topic/tourism`). Returns undefined for a
 * question that slugifies to nothing — such a file was never generated.
 */
export const questionAudioUrl = (letzDir: string, question: string): string | undefined => {
  const slug = audioSlug(question);
  return slug.length > 0 ? `${letzDir}/audio/questions/${slug}.mp3` : undefined;
};
