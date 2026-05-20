import {
  getUser,
  saveUser,
  mergeWordResults,
  mergeDailySession,
  mergeUnlockedLessons,
} from "../lib/user.ts";
import { validateProgressSync } from "../lib/validators.ts";
import { log } from "../lib/log.ts";

import type { RouteContext } from "../router.ts";
import type { UserData } from "../types.ts";

export const handleProgressSync = async ({ request, env, userId }: RouteContext) => {
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const rawBody = await request.json().catch(() => null);
  const today = new Date().toISOString().slice(0, 10);
  const validation = validateProgressSync(rawBody, today);
  if (!validation.ok) {
    log.warn("progress_sync_rejected", { userId, reason: validation.reason });
    return new Response("Bad Request", { status: 400 });
  }
  const { wordResults, date, durationSeconds, newlyUnlockedLessons } = validation.value;

  const userData = await getUser(env.KV, userId);
  if (!userData) return new Response("User not found", { status: 404 });

  const baseVersion = userData.version ?? 0;
  const updatedUser: UserData = {
    ...userData,
    words: mergeWordResults(userData.words, wordResults),
    dailySessions: mergeDailySession(userData.dailySessions, date, durationSeconds, wordResults),
    unlockedLessons: mergeUnlockedLessons(userData.unlockedLessons, newlyUnlockedLessons ?? []),
    version: baseVersion + 1,
  };

  await saveUser(env.KV, updatedUser);

  // Best-effort lost-update detection: if a concurrent sync raced us, the post-write
  // read will reveal a version that isn't the one we just wrote. Log-only for now —
  // gathers signal before we invest in retry logic or Durable Object serialization.
  const reread = await getUser(env.KV, userId);
  if (reread && reread.version !== updatedUser.version) {
    log.warn("lost_update_detected", {
      userId,
      expectedVersion: updatedUser.version,
      observedVersion: reread.version,
    });
  }

  return Response.json({ ok: true });
};
