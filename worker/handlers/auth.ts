import { createSession, deleteSession, sessionCookie, clearSessionCookie, parseSessionId } from "../lib/session.ts";
import { getUser, saveUser, createNewUser, findUserIdByEmail, linkEmailToUser, computeStreak } from "../lib/user.ts";
import { getAuthorizationUrl, exchangeCode } from "../lib/oauth/google.ts";

import type { RouteContext } from "../router.ts";
import type { UserData } from "../types.ts";

const googleConfig = (env: RouteContext["env"]) => ({
  clientId: env.GOOGLE_CLIENT_ID,
  clientSecret: env.GOOGLE_CLIENT_SECRET,
  redirectUri: `${env.APP_URL}/api/auth/callback`,
});

export const handleGoogleAuth = async ({ env }: RouteContext) => {
  const state = `google:${crypto.randomUUID()}`;
  await env.KV.put(`csrf:${state}`, "google", { expirationTtl: 600 });

  return Response.redirect(getAuthorizationUrl(googleConfig(env), state), 302);
};

export const handleCallback = async ({ request, env }: RouteContext) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return Response.redirect(`${env.APP_URL}?error=missing_params`, 302);
  }

  const storedProvider = await env.KV.get(`csrf:${state}`);
  if (!storedProvider) {
    return Response.redirect(`${env.APP_URL}?error=invalid_state`, 302);
  }
  await env.KV.delete(`csrf:${state}`);

  const userInfo = await exchangeCode(googleConfig(env), code);

  // Find or create user
  const existingUserId = await findUserIdByEmail(env.KV, userInfo.email);
  const userId = existingUserId ?? crypto.randomUUID();
  const existingUser = existingUserId ? await getUser(env.KV, existingUserId) : null;

  const userData: UserData = existingUser ?? createNewUser({
    id: userId,
    email: userInfo.email,
    name: userInfo.name,
    avatarUrl: userInfo.avatarUrl,
    provider: userInfo.provider,
    providerId: userInfo.providerId,
    currentLevel: "A1",
    createdAt: new Date().toISOString(),
  });

  // Refresh profile fields on each login (name/avatar may change)
  const updatedUser: UserData = {
    ...userData,
    profile: { ...userData.profile, name: userInfo.name, avatarUrl: userInfo.avatarUrl },
  };

  await saveUser(env.KV, updatedUser);
  if (!existingUserId) {
    await linkEmailToUser(env.KV, userInfo.email, userId);
  }

  const sessionId = await createSession(env.KV, userId);

  return new Response(null, {
    status: 302,
    headers: {
      Location: env.APP_URL,
      "Set-Cookie": sessionCookie(sessionId, env.APP_URL),
    },
  });
};

export const handleMe = async ({ env, userId }: RouteContext) => {
  if (!userId) return Response.json({ user: null });

  const userData = await getUser(env.KV, userId);
  if (!userData) return Response.json({ user: null });

  const today = new Date().toISOString().slice(0, 10);

  return Response.json({
    user: userData.profile,
    words: userData.words,
    dailySessions: userData.dailySessions,
    streak: computeStreak(userData.dailySessions, today),
  });
};

export const handleLogout = async ({ request, env }: RouteContext) => {
  const sessionId = parseSessionId(request.headers.get("Cookie"));
  if (sessionId) {
    await deleteSession(env.KV, sessionId);
  }

  return new Response(null, {
    status: 200,
    headers: { "Set-Cookie": clearSessionCookie(env.APP_URL) },
  });
};
