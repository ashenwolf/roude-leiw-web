import { getUser, saveUser, mergeWordResults, mergeDailySession } from "../lib/user.ts";

import type { RouteContext } from "../router.ts";
import type { ProgressSyncRequest, UserData } from "../types.ts";

export const handleProgressSync = async ({ request, env, userId }: RouteContext) => {
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const body = (await request.json()) as ProgressSyncRequest;
  const userData = await getUser(env.KV, userId);
  if (!userData) return new Response("User not found", { status: 404 });

  const updatedUser: UserData = {
    ...userData,
    words: mergeWordResults(userData.words, body.wordResults),
    dailySessions: mergeDailySession(userData.dailySessions, body.date, body.durationMs, body.wordResults),
  };

  await saveUser(env.KV, updatedUser);
  return Response.json({ ok: true });
};
