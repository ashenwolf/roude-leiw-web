import {
  createSession,
  deleteSession,
  sessionCookie,
  clearSessionCookie,
  parseSessionId,
  oauthStateCookie,
  clearOauthStateCookie,
  parseOauthState,
} from "../lib/session.ts";
import { getUser, saveUser, createNewUser, findUserIdByEmail, linkEmailToUser, computeStreak } from "../lib/user.ts";
import { getAuthorizationUrl, exchangeCode } from "../lib/oauth/google.ts";
import { log } from "../lib/log.ts";

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

  return new Response(null, {
    status: 302,
    headers: {
      Location: getAuthorizationUrl(googleConfig(env), state),
      "Set-Cookie": oauthStateCookie(state, env.APP_URL),
    },
  });
};

export const handleCallback = async ({ request, env }: RouteContext) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return Response.redirect(`${env.APP_URL}?error=missing_params`, 302);
  }

  // Two independent state checks must both pass:
  //   1. KV-bound state (prevents replay across browsers / forged states)
  //   2. Cookie-bound state (prevents login-CSRF — attacker can't set our cookie)
  const cookieState = parseOauthState(request.headers.get("Cookie"));
  if (!cookieState || cookieState !== state) {
    log.warn("oauth_state_cookie_mismatch", {});
    return Response.redirect(`${env.APP_URL}?error=invalid_state`, 302);
  }

  const storedProvider = await env.KV.get(`csrf:${state}`);
  if (!storedProvider) {
    return Response.redirect(`${env.APP_URL}?error=invalid_state`, 302);
  }
  await env.KV.delete(`csrf:${state}`);

  const userInfo = await exchangeCode(googleConfig(env), code).catch((e) => {
    log.warn("oauth_exchange_failed", { reason: e instanceof Error ? e.message : "unknown" });
    return null;
  });
  if (!userInfo) {
    return Response.redirect(`${env.APP_URL}?error=oauth_failed`, 302);
  }

  // Resolve userId with best-effort race protection on the email→userId link.
  // KV has no compare-and-swap, so we: (1) look up existing, (2) if none, claim
  // the email by writing our candidate id, (3) re-read and accept whichever id
  // the email row points to as the winner. Concurrent first-time logins thus
  // converge on one userId; the loser's candidate uuid is silently discarded.
  const existingUserId = await findUserIdByEmail(env.KV, userInfo.email);
  const resolvedUserId = await (async () => {
    if (existingUserId) return existingUserId;
    const candidateId = crypto.randomUUID();
    await linkEmailToUser(env.KV, userInfo.email, candidateId);
    const winnerId = await findUserIdByEmail(env.KV, userInfo.email);
    return winnerId ?? candidateId;
  })();

  const existingUser = await getUser(env.KV, resolvedUserId);
  const userData: UserData = existingUser ?? createNewUser({
    id: resolvedUserId,
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

  const sessionId = await createSession(env.KV, resolvedUserId);

  const headers = new Headers({ Location: env.APP_URL });
  headers.append("Set-Cookie", sessionCookie(sessionId, env.APP_URL));
  headers.append("Set-Cookie", clearOauthStateCookie(env.APP_URL));
  return new Response(null, { status: 302, headers });
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
    unlockedLessons: userData.unlockedLessons ?? [],
    totalXP: userData.totalXP ?? 0,
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
