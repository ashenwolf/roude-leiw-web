import type { ProgressSyncRequest, WordResult } from "../types.ts";

export type ValidationOk<T> = { ok: true; value: T };
export type ValidationErr = { ok: false; reason: string };
export type ValidationResult<T> = ValidationOk<T> | ValidationErr;

const ok = <T>(value: T): ValidationOk<T> => ({ ok: true, value });
const err = (reason: string): ValidationErr => ({ ok: false, reason });

const MAX_WORD_RESULTS = 200;
const MAX_PART_LEN = 64;
const MAX_COUNT = 100;
const MAX_DURATION = 3600;
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
const WORD_KEY_RX = /^[^|]{1,64}\|[^|]{1,64}$/;
const PHRASE_KEY_RX = /^phrase:(?:en-lu|lu-en):[^|]{1,64}$/;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isBoundedInt = (v: unknown, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max;

const isValidKey = (v: unknown): v is string =>
  typeof v === "string" && (WORD_KEY_RX.test(v) || PHRASE_KEY_RX.test(v)) &&
  v.length <= "phrase:en-lu:".length + MAX_PART_LEN;

const validateWordResult = (raw: unknown, index: number): ValidationResult<WordResult> => {
  if (!isPlainObject(raw)) return err(`wordResults[${index}]: not an object`);
  if (!isValidKey(raw.key)) return err(`wordResults[${index}].key: invalid shape`);
  if (!isBoundedInt(raw.shown, MAX_COUNT)) return err(`wordResults[${index}].shown: not an int in [0,${MAX_COUNT}]`);
  if (!isBoundedInt(raw.correct, MAX_COUNT)) return err(`wordResults[${index}].correct: not an int in [0,${MAX_COUNT}]`);
  if (!isBoundedInt(raw.incorrect, MAX_COUNT)) return err(`wordResults[${index}].incorrect: not an int in [0,${MAX_COUNT}]`);
  return ok({ key: raw.key, shown: raw.shown, correct: raw.correct, incorrect: raw.incorrect });
};

const dateMs = (yyyymmdd: string) => Date.parse(`${yyyymmdd}T00:00:00Z`);
const DAY_MS = 86_400_000;

const isDateInWindow = (date: string, today: string) => {
  const dMs = dateMs(date);
  const tMs = dateMs(today);
  if (!Number.isFinite(dMs) || !Number.isFinite(tMs)) return false;
  const delta = dMs - tMs;
  return delta >= -2 * DAY_MS && delta <= 1 * DAY_MS;
};

/**
 * Validates a /api/progress/sync request body against the documented contract.
 * Pure — pass `today` (UTC YYYY-MM-DD) so tests can pin the clock.
 */
export const validateProgressSync = (
  body: unknown,
  today: string,
): ValidationResult<ProgressSyncRequest> => {
  if (!isPlainObject(body)) return err("body: not an object");
  if (typeof body.date !== "string" || !DATE_RX.test(body.date)) return err("date: not YYYY-MM-DD");
  if (!isDateInWindow(body.date, today)) return err("date: outside [today-2, today+1] UTC");
  if (!isBoundedInt(body.durationSeconds, MAX_DURATION)) return err(`durationSeconds: not an int in [0,${MAX_DURATION}]`);
  if (!Array.isArray(body.wordResults)) return err("wordResults: not an array");
  if (body.wordResults.length > MAX_WORD_RESULTS) return err(`wordResults: length > ${MAX_WORD_RESULTS}`);

  const validated = body.wordResults.reduce<ValidationResult<WordResult[]>>(
    (acc, raw, i) => {
      if (!acc.ok) return acc;
      const r = validateWordResult(raw, i);
      return r.ok ? ok([...acc.value, r.value]) : r;
    },
    ok([]),
  );

  return validated.ok
    ? ok({ date: body.date, durationSeconds: body.durationSeconds, wordResults: validated.value })
    : validated;
};
