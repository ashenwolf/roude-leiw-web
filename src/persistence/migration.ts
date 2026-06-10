/**
 * Pure producer: splits a guest's lifetime accumulated progress into a sequence
 * of /api/progress/sync payloads that each individually satisfy the server's
 * per-request validation bounds. The server merge is additive, so the sum of
 * the chunks reconstructs the exact guest totals — no clamping, no data loss.
 *
 * Limitation (by API contract, not fixable client-side): per-day history and
 * therefore the guest's streak cannot be migrated — the server validator only
 * accepts dates in [today-2, today+1] UTC, so all guest progress is folded
 * into today's date on the server.
 */
import type { WordStats } from "../context/auth";
import type { WordResultMap } from "../exercise/WordMatch/types";
import type { GuestData } from "./hooks/use-guest-progress";

// Server-side per-request bounds, mirrored from worker/lib/validators.ts.
// Kept in sync by hand — do not import from worker/ (separate bundle).
const MAX_WORD_RESULTS_PER_CHUNK = 200;
const MAX_COUNT_PER_RESULT = 100;
const MAX_DURATION_PER_CHUNK = 3600;
const MAX_XP_PER_CHUNK = 500;

export type MigrationChunk = {
  wordResults: WordResultMap;
  durationSeconds: number;
  xpEarned: number;
  newlyUnlockedLessons: string[];
};

/** Piece i of a total split into consecutive slices of at most `max`. */
const slice = (total: number, max: number, i: number): number =>
  Math.max(0, Math.min(max, total - i * max));

/**
 * Split one key's lifetime stats into pieces where every counter is an integer
 * in [0, MAX_COUNT_PER_RESULT]. Summing the pieces reconstructs the original.
 */
const splitStats = (stats: WordStats): WordStats[] => {
  const shown = Math.round(stats.shown);
  const correct = Math.round(stats.correct);
  const incorrect = Math.round(stats.incorrect);
  const pieceCount = Math.max(
    1,
    Math.ceil(Math.max(shown, correct, incorrect) / MAX_COUNT_PER_RESULT),
  );
  return Array.from({ length: pieceCount }, (_, i) => ({
    shown: slice(shown, MAX_COUNT_PER_RESULT, i),
    correct: slice(correct, MAX_COUNT_PER_RESULT, i),
    incorrect: slice(incorrect, MAX_COUNT_PER_RESULT, i),
  }));
};

const chunkArray = <T>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );

/**
 * Build the ordered list of sync payloads for the guest→auth migration.
 * Each chunk respects every server bound; posting them all (in any order,
 * but exactly once each) reproduces the guest totals on the server.
 * Returns [] when there is literally nothing to migrate.
 */
export const buildMigrationChunks = (guestData: GuestData): MigrationChunk[] => {
  const keyPieces = Object.entries(guestData.words).map(
    ([key, stats]) => [key, splitStats(stats)] as const,
  );
  const roundCount = keyPieces.reduce((max, [, pieces]) => Math.max(max, pieces.length), 0);

  // Round r carries piece r of every key that has one. Pieces of the same key
  // land in different rounds (hence different chunks), so each chunk's
  // WordResultMap has unique keys and the additive merge loses nothing.
  const wordResultGroups = Array.from({ length: roundCount }, (_, round) =>
    keyPieces
      .filter(([, pieces]) => pieces[round] !== undefined)
      .map(([key, pieces]) => [key, pieces[round]] as const),
  ).flatMap((roundEntries) => chunkArray(roundEntries, MAX_WORD_RESULTS_PER_CHUNK));

  const totalDuration = Math.round(
    Object.values(guestData.dailySessions).reduce((sum, s) => sum + s.durationSeconds, 0),
  );
  const totalXP = Math.round(
    Object.values(guestData.dailySessions).reduce((sum, s) => sum + (s.xp ?? 0), 0),
  );
  const unlockedLessons = guestData.unlockedLessons ?? [];

  // If wordResults alone don't yield enough chunks to carry the full duration
  // and XP within per-chunk bounds, extra chunks with empty wordResults are
  // emitted to absorb the remainder.
  const chunkCount = Math.max(
    wordResultGroups.length,
    Math.ceil(totalDuration / MAX_DURATION_PER_CHUNK),
    Math.ceil(totalXP / MAX_XP_PER_CHUNK),
    unlockedLessons.length > 0 ? 1 : 0,
  );

  return Array.from({ length: chunkCount }, (_, i) => ({
    wordResults: Object.fromEntries(wordResultGroups[i] ?? []),
    durationSeconds: slice(totalDuration, MAX_DURATION_PER_CHUNK, i),
    xpEarned: slice(totalXP, MAX_XP_PER_CHUNK, i),
    newlyUnlockedLessons: i === 0 ? unlockedLessons : [],
  }));
};
