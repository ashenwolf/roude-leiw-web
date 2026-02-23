import { getSession, parseSessionId } from "./lib/session.ts";

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

export const createRouter = (entries: RouteEntry[]) => {
  const routeMap = new Map(
    entries.map(({ method, path, handler }) => [`${method} ${path}`, handler]),
  );

  return async (request: Request, env: Env): Promise<Response> => {
    const { pathname } = new URL(request.url);
    const handler = routeMap.get(`${request.method} ${pathname}`);
    if (!handler) return new Response("Not Found", { status: 404 });

    const userId = await resolveUserId(request, env.KV);
    return handler({ request, env, userId });
  };
};
