import type { SessionData } from "../types.ts";

const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days

/**
 * Cookie name picks `__Host-session` over HTTPS — the prefix forces the browser to
 * reject any Set-Cookie missing Secure/Path=/ or carrying a Domain attribute,
 * which closes off subdomain-cookie injection. In local HTTP dev the prefix
 * would prevent the cookie from being set at all, so we fall back to `session`.
 */
const cookieName = (appUrl: string) =>
  appUrl.startsWith("https") ? "__Host-session" : "session";

const buildCookie = (appUrl: string, value: string, maxAge: number) => {
  const isSecure = appUrl.startsWith("https");
  return [
    `${cookieName(appUrl)}=${value}`,
    "HttpOnly",
    "Path=/",
    `Max-Age=${maxAge}`,
    "SameSite=Lax",
    ...(isSecure ? ["Secure"] : []),
  ].join("; ");
};

export const createSession = async (kv: KVNamespace, userId: string) => {
  const sessionId = crypto.randomUUID();
  const data: SessionData = { userId, createdAt: Date.now() };
  await kv.put(`session:${sessionId}`, JSON.stringify(data), { expirationTtl: SESSION_TTL });
  return sessionId;
};

export const getSession = async (kv: KVNamespace, sessionId: string) => {
  const raw = await kv.get(`session:${sessionId}`);
  return raw ? (JSON.parse(raw) as SessionData) : null;
};

export const deleteSession = async (kv: KVNamespace, sessionId: string) => {
  await kv.delete(`session:${sessionId}`);
};

export const sessionCookie = (sessionId: string, appUrl: string) =>
  buildCookie(appUrl, sessionId, SESSION_TTL);

export const clearSessionCookie = (appUrl: string) => buildCookie(appUrl, "", 0);

/** Reads the session cookie under either name (__Host-session in prod, session in dev). */
export const parseSessionId = (cookieHeader: string | null) => {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)(?:__Host-session|session)=([^;]+)/);
  return match?.[1] || null;
};

// --- OAuth state binding cookie ---
// A short-lived cookie set on /api/auth/google and verified on /callback.
// Prevents login-CSRF: even if an attacker captures a `state` param, they
// can't forge the HttpOnly cookie from the victim's browser.

const OAUTH_STATE_TTL = 60 * 10; // 10 minutes
const oauthStateCookieName = (appUrl: string) =>
  appUrl.startsWith("https") ? "__Host-oauth-state" : "oauth-state";

export const oauthStateCookie = (state: string, appUrl: string) => {
  const isSecure = appUrl.startsWith("https");
  return [
    `${oauthStateCookieName(appUrl)}=${state}`,
    "HttpOnly",
    "Path=/",
    `Max-Age=${OAUTH_STATE_TTL}`,
    "SameSite=Lax",
    ...(isSecure ? ["Secure"] : []),
  ].join("; ");
};

export const clearOauthStateCookie = (appUrl: string) => {
  const isSecure = appUrl.startsWith("https");
  return [
    `${oauthStateCookieName(appUrl)}=`,
    "HttpOnly",
    "Path=/",
    "Max-Age=0",
    "SameSite=Lax",
    ...(isSecure ? ["Secure"] : []),
  ].join("; ");
};

export const parseOauthState = (cookieHeader: string | null) => {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)(?:__Host-oauth-state|oauth-state)=([^;]+)/);
  return match?.[1] || null;
};
