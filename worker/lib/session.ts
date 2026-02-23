import type { SessionData } from "../types.ts";

const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days
const COOKIE_NAME = "session";

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

export const sessionCookie = (sessionId: string, appUrl: string) => {
  const secure = appUrl.startsWith("https");
  return [
    `${COOKIE_NAME}=${sessionId}`,
    "HttpOnly",
    "Path=/",
    `Max-Age=${SESSION_TTL}`,
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
};

export const clearSessionCookie = (appUrl: string) => {
  const secure = appUrl.startsWith("https");
  return [
    `${COOKIE_NAME}=`,
    "HttpOnly",
    "Path=/",
    "Max-Age=0",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
};

export const parseSessionId = (cookieHeader: string | null) => {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
  return match?.[1] || null;
};
