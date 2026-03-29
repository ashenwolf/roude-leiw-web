import { describe, it, expect } from "vitest";

import { parseSessionId, sessionCookie, clearSessionCookie } from "../../../worker/lib/session.ts";

describe("parseSessionId", () => {
  it.each([
    ["null header", null, null],
    ["empty string", "", null],
    ["session only", "session=abc123", "abc123"],
    ["session first, others after", "session=abc123; other=y", "abc123"],
    ["other cookie first", "other=x; session=abc123", "abc123"],
    ["session in middle", "a=1; session=xyz; b=2", "xyz"],
    ["no session key", "nosession=abc", null],
    ["session key without value", "session=", null],
  ] as const)("%s", (_, input, expected) => {
    expect(parseSessionId(input)).toBe(expected);
  });
});

describe("sessionCookie", () => {
  it.each([
    ["http URL — no Secure flag", "http://localhost:3000", false],
    ["https URL — includes Secure flag", "https://example.com", true],
  ] as const)("%s", (_, appUrl, expectSecure) => {
    const cookie = sessionCookie("sid123", appUrl);
    expect(cookie).toContain("session=sid123");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=Lax");
    if (expectSecure) {
      expect(cookie).toContain("Secure");
    } else {
      expect(cookie).not.toContain("Secure");
    }
  });
});

describe("clearSessionCookie", () => {
  it.each([
    ["http URL — no Secure flag", "http://localhost:3000", false],
    ["https URL — includes Secure flag", "https://example.com", true],
  ] as const)("%s", (_, appUrl, expectSecure) => {
    const cookie = clearSessionCookie(appUrl);
    expect(cookie).toContain("session=");
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("HttpOnly");
    if (expectSecure) {
      expect(cookie).toContain("Secure");
    } else {
      expect(cookie).not.toContain("Secure");
    }
  });
});
