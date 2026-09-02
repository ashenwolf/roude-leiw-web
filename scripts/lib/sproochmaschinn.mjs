/**
 * Sproochmaschinn TTS client + the sequential batch runner both audio
 * generators share.
 *
 * Sproochmaschinn (https://sproochmaschinn.lu) is the free TTS/STT service run
 * by the Zenter fir d'Lëtzebuerger Sprooch (ZLS). Its voices are purpose-built
 * Luxembourgish models. There is NO API key: every request is authenticated by
 * a short-lived session id. Non-commercial use only — for commercial
 * deployment, ZLS asks to be contacted directly (see the in-app API docs).
 *
 * API flow (documented inside the sproochmaschinn.lu SPA under "API"):
 *   POST /api/session                 -> { session_id }   (expires after 10 min idle)
 *   POST /api/tts/{session_id}        -> { request_id }   (json: { text, model })
 *   GET  /api/result/{request_id}     -> poll until status "completed";
 *                                        result.data is base64 WAV
 * Rate limit: 10 TTS requests per minute per session. A result is deleted
 * 30 seconds after it is first retrieved.
 *
 * The API returns WAV (22.05 kHz mono PCM); mp3 is produced locally via
 * ffmpeg, which must be on PATH.
 *
 * Used by:
 *   - scripts/generate-audio.mjs           (@lu sentence phrases)
 *   - scripts/generate-question-audio.mjs  (@question examiner prompts)
 */
import { spawn, spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import process from "node:process";

import { pathExists } from "./letz-audio.mjs";

const BASE_URL = "https://sproochmaschinn.lu";

export const VOICE_MODELS = ["claude", "max", "maxine"];
export const DEFAULT_MODEL = "claude";

const REQUEST_INTERVAL_MS = 6500;      // TTS is limited to 10 requests/min/session
const POLL_INTERVAL_MS = 1000;         // result polling cadence
const RESULT_TIMEOUT_MS = 5 * 60 * 1000; // same bound the web client uses
const MAX_RETRIES = 5;                 // for 429 / 5xx / expired session
const RETRY_BASE_DELAY_MS = 1000;      // exponential backoff base

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------

const createSession = async () => {
  const response = await fetch(`${BASE_URL}/api/session`, { method: "POST" });
  if (!response.ok) throw new Error(`session creation failed: HTTP ${response.status}`);
  const { session_id: sessionId } = await response.json();
  return sessionId;
};

/**
 * Submit one phrase for synthesis. A 404 means the session expired (10 min
 * idle) — recreate it and resubmit, mirroring the web client. 429/5xx retry
 * with `Retry-After` when present, exponential backoff otherwise. Returns the
 * request id plus whichever session id is now live.
 */
const submitTts = async (sessionId, text, model, attempt = 0) => {
  const response = await fetch(`${BASE_URL}/api/tts/${sessionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, model }),
  });

  if (response.ok) {
    const { request_id: requestId } = await response.json();
    return { requestId, sessionId };
  }

  if (attempt >= MAX_RETRIES - 1) {
    throw new Error(`Sproochmaschinn TTS failed after ${MAX_RETRIES} attempts (HTTP ${response.status})`);
  }

  if (response.status === 404) {
    return submitTts(await createSession(), text, model, attempt + 1);
  }

  if (response.status === 429 || response.status >= 500) {
    const retryAfterHeader = parseFloat(response.headers.get("retry-after") ?? "");
    const delay = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
      ? retryAfterHeader * 1000
      : RETRY_BASE_DELAY_MS * 2 ** attempt;
    console.log(
      `   ⏳ HTTP ${response.status} — retrying in ${Math.round(delay)}ms ` +
        `(attempt ${attempt + 1}/${MAX_RETRIES})`,
    );
    await sleep(delay);
    return submitTts(sessionId, text, model, attempt + 1);
  }

  const errorText = await response.text();
  throw new Error(`Sproochmaschinn TTS error ${response.status}: ${errorText}`);
};

/**
 * Poll until the request completes, then return the result payload
 * (`{ data, format, duration, ... }` — `data` is base64-encoded WAV).
 * Async recursion keeps the stack flat; the deadline bounds the whole wait.
 */
const pollResult = async (requestId, deadline = Date.now() + RESULT_TIMEOUT_MS) => {
  if (Date.now() > deadline) {
    throw new Error(`timed out waiting for result ${requestId}`);
  }
  const response = await fetch(`${BASE_URL}/api/result/${requestId}`);
  if (!response.ok) throw new Error(`result fetch failed: HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.status === "completed") return payload.result;
  if (payload.status === "failed" || payload.status === "error") {
    throw new Error(`synthesis failed: ${payload.error ?? "unknown error"}`);
  }
  await sleep(POLL_INTERVAL_MS);
  return pollResult(requestId, deadline);
};

// ---------------------------------------------------------------------------
// WAV → mp3 (ffmpeg, fully piped — no temp files)
// ---------------------------------------------------------------------------

const wavToMp3 = (wav) =>
  new Promise((resolvePromise, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-hide_banner", "-loglevel", "error",
      "-i", "pipe:0",
      "-codec:a", "libmp3lame", "-qscale:a", "4",
      "-f", "mp3", "pipe:1",
    ]);
    const out = [];
    const err = [];
    ffmpeg.stdout.on("data", (chunk) => out.push(chunk));
    ffmpeg.stderr.on("data", (chunk) => err.push(chunk));
    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) =>
      code === 0
        ? resolvePromise(Buffer.concat(out))
        : reject(new Error(`ffmpeg exited ${code}: ${Buffer.concat(err).toString().trim()}`)),
    );
    ffmpeg.stdin.end(wav);
  });

export const assertFfmpeg = () => {
  const probe = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (probe.error || probe.status !== 0) {
    console.error("ffmpeg not found on PATH — required to convert Sproochmaschinn WAV output to mp3.");
    console.error("Install it with: brew install ffmpeg");
    process.exit(1);
  }
};

// ---------------------------------------------------------------------------
// Batch runner
// ---------------------------------------------------------------------------

/** Synthesize one phrase end-to-end; returns mp3 bytes and the live session id. */
const synthesizeMp3 = async (sessionId, text, model) => {
  const { requestId, sessionId: liveSessionId } = await submitTts(sessionId, text, model);
  const result = await pollResult(requestId);
  const mp3 = await wavToMp3(Buffer.from(result.data, "base64"));
  return { mp3, sessionId: liveSessionId };
};

/**
 * Generate mp3s for `tasks` = [{ text, outputPath, label }] sequentially.
 * Existing files are skipped, so re-running only fetches what's missing.
 *
 * Sequential on purpose: the rate limit is per session and the queue is a
 * shared public resource. The session id threads through the accumulator so
 * an expiry-triggered recreation carries over to the next phrase. Returns
 * `{ generated, skipped, failed }`.
 */
export const generateAll = async (tasks, model) => {
  const initialSessionId = await createSession();

  const { generated, skipped, failed } = await tasks.reduce(
    async (statePromise, { text, outputPath, label }, i) => {
      const state = await statePromise;
      const prefix = `[${i + 1}/${tasks.length}]`;

      if (await pathExists(outputPath)) {
        console.log(`${prefix} • skip   ${label}   (${text})`);
        return { ...state, skipped: state.skipped + 1 };
      }

      try {
        // Space real submissions to stay under 10 requests/min/session.
        if (state.generated + state.failed > 0) await sleep(REQUEST_INTERVAL_MS);
        const { mp3, sessionId } = await synthesizeMp3(state.sessionId, text, model);
        await writeFile(outputPath, mp3);
        console.log(`${prefix} ✓ saved  ${label}   (${text})`);
        return { ...state, sessionId, generated: state.generated + 1 };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`${prefix} ✗ error  ${label}   (${text})  — ${msg}`);
        return { ...state, failed: state.failed + 1 };
      }
    },
    Promise.resolve({ sessionId: initialSessionId, generated: 0, skipped: 0, failed: 0 }),
  );

  return { generated, skipped, failed };
};
