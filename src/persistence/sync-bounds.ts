/**
 * The server's per-request bounds, mirrored from `worker/lib/validators.ts`.
 *
 * Kept by hand rather than imported — `worker/` is a separate bundle — so a
 * change there must be reflected here in the same commit. Getting this wrong is
 * not graceful degradation: `validateProgressSync` rejects the **whole batch**,
 * so one out-of-bounds field silently loses every word result in that Session.
 */
export const SYNC_BOUNDS = {
  maxWordResults: 200,
  maxCountPerResult: 100,
  maxDurationSeconds: 3600,
  maxXP: 500,
} as const;

/**
 * The `durationSeconds` value a sync may carry.
 *
 * `useActivityTimer` accumulates up to `IDLE_THRESHOLD_S` of think time per
 * interaction with no ceiling, and a Session's slots are summed, so a long or
 * low-accuracy Session (whose failed slots re-queue into the correction Block)
 * can accumulate far more than an hour of credited think time. Unclamped, that
 * fails the server's `durationSeconds` bound and takes all of the Session's word
 * progress down with it.
 *
 * Clamping, not splitting: this is a live Session, and the only thing lost is
 * time-studied above an hour, whereas the guest→auth migration must be lossless
 * and therefore splits across chunks (`migration.ts`).
 */
export const clampSyncDuration = (durationSeconds: number): number =>
  Math.max(0, Math.min(SYNC_BOUNDS.maxDurationSeconds, Math.round(durationSeconds)));
