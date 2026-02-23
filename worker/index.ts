import { createRouter } from "./router.ts";
import { handleGoogleAuth, handleCallback, handleMe, handleLogout } from "./handlers/auth.ts";
import { handleProgressSync } from "./handlers/progress.ts";

import type { Env } from "./types.ts";

const route = createRouter([
  { method: "GET", path: "/api/auth/google", handler: handleGoogleAuth },
  { method: "GET", path: "/api/auth/callback", handler: handleCallback },
  { method: "GET", path: "/api/auth/me", handler: handleMe },
  { method: "POST", path: "/api/auth/logout", handler: handleLogout },
  { method: "POST", path: "/api/progress/sync", handler: handleProgressSync },
]);

export default {
  fetch: (request: Request, env: Env) => route(request, env),
} satisfies ExportedHandler<Env>;
