import { getSession, parseSessionId } from "./lib/session.ts";
import { log } from "./lib/log.ts";

import type { Env } from "./types.ts";

export type RouteContext = {
  request: Request;
  env: Env;
  userId: string | null;
};

type RouteHandler = (ctx: RouteContext) => Promise<Response>;

type RouteEntry = {
  method: string;
  path: string;
  handler: RouteHandler;
};

const resolveUserId = async (request: Request, kv: KVNamespace): Promise<string | null> => {
  const sessionId = parseSessionId(request.headers.get("Cookie"));
  if (!sessionId) return null;
  const session = await getSession(kv, sessionId);
  return session?.userId ?? null;
};

/**
 * Second-layer CSRF defense behind SameSite=Lax: any state-changing request must
 * carry an Origin header matching APP_URL. Browsers always send Origin on POST,
 * and an attacker page cannot forge it.
 */
const isOriginAllowed = (request: Request, appUrl: string) => {
  if (request.method === "GET" || request.method === "HEAD") return true;
  const origin = request.headers.get("Origin");
  return origin !== null && origin === appUrl;
};

export const createRouter = (entries: RouteEntry[]) => {
  const routeMap = new Map(
    entries.map(({ method, path, handler }) => [`${method} ${path}`, handler]),
  );

  return async (request: Request, env: Env): Promise<Response> => {
    const { pathname } = new URL(request.url);
    const handler = routeMap.get(`${request.method} ${pathname}`);
    if (!handler) return new Response("Not Found", { status: 404 });

    if (!isOriginAllowed(request, env.APP_URL)) {
      log.warn("origin_rejected", {
        path: pathname,
        method: request.method,
        origin: request.headers.get("Origin"),
      });
      return new Response("Forbidden", { status: 403 });
    }

    const userId = await resolveUserId(request, env.KV);
    return handler({ request, env, userId });
  };
};
