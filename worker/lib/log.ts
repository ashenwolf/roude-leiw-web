type LogLevel = "info" | "warn" | "error";

type LogProps = Record<string, string | number | boolean | null | undefined>;

/**
 * Emits one JSON line per event. Cloudflare Workers Logs auto-ingests `console.log` JSON.
 *
 * Do not pass PII (email, name, raw IP). `userId` is the opaque UUID, safe to log.
 */
const emit = (level: LogLevel, event: string, props: LogProps = {}) => {
  const line = { ts: new Date().toISOString(), level, event, ...props };
  if (level === "error") console.error(JSON.stringify(line));
  else if (level === "warn") console.warn(JSON.stringify(line));
  else console.log(JSON.stringify(line));
};

export const log = {
  info: (event: string, props?: LogProps) => emit("info", event, props),
  warn: (event: string, props?: LogProps) => emit("warn", event, props),
  error: (event: string, props?: LogProps) => emit("error", event, props),
};
