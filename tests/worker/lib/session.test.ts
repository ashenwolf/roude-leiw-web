import { describe, it, expect } from "vitest";

import {
  parseSessionId,
  sessionCookie,
  clearSessionCookie,
  oauthStateCookie,
  clearOauthStateCookie,
  parseOauthState,
} from "../../../worker/lib/session.ts";

describe("parseSessionId", () => {
  it.each([
    ["null header", null, null],
    ["empty string", "", null],
    ["bare session only", "session=abc123", "abc123"],
    ["__Host-session only", "__Host-session=abc123", "abc123"],
    ["session first, others after", "session=abc123; other=y", "abc123"],
    ["__Host-session first, others after", "__Host-session=abc123; other=y", "abc123"],
    ["other cookie first then session", "other=x; session=abc123", "abc123"],
    ["other cookie first then __Host-session", "other=x; __Host-session=abc123", "abc123"],
    ["session in middle", "a=1; session=xyz; b=2", "xyz"],
    ["no session key", "nosession=abc", null],
    ["session key without value", "session=", null],
  ] as const)("%s", (_, input, expected) => {
    expect(parseSessionId(input)).toBe(expected);
  });
});

describe("sessionCookie", () => {
  it("uses __Host-session prefix and Secure flag on https", () => {
    const cookie = sessionCookie("sid123", "https://example.com");
    expect(cookie).toContain("__Host-session=sid123");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
    expect(cookie).not.toContain("Domain=");
  });

  it("uses plain `session` name and omits Secure on http (dev)", () => {
    const cookie = sessionCookie("sid123", "http://localhost:3000");
    expect(cookie).toContain("session=sid123");
    expect(cookie).not.toContain("__Host-");
    expect(cookie).not.toContain("Secure");
  });
});

describe("clearSessionCookie", () => {
  it("clears __Host-session on https", () => {
    const cookie = clearSessionCookie("https://example.com");
    expect(cookie).toContain("__Host-session=");
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("Secure");
  });

  it("clears bare session on http", () => {
    const cookie = clearSessionCookie("http://localhost:3000");
    expect(cookie).toContain("session=");
    expect(cookie).not.toContain("Secure");
  });
});

describe("oauth state cookie", () => {
  it("uses __Host-oauth-state and Secure on https", () => {
    const cookie = oauthStateCookie("abc", "https://example.com");
    expect(cookie).toContain("__Host-oauth-state=abc");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("Max-Age=600");
  });

  it("falls back to oauth-state on http (dev)", () => {
    const cookie = oauthStateCookie("abc", "http://localhost:3000");
    expect(cookie).toContain("oauth-state=abc");
    expect(cookie).not.toContain("__Host-");
    expect(cookie).not.toContain("Secure");
  });

  it("clear cookie sets Max-Age=0", () => {
    expect(clearOauthStateCookie("https://example.com")).toContain("Max-Age=0");
  });

  it("parses both cookie names", () => {
    expect(parseOauthState("__Host-oauth-state=xyz")).toBe("xyz");
    expect(parseOauthState("oauth-state=xyz")).toBe("xyz");
    expect(parseOauthState("a=1; __Host-oauth-state=xyz; b=2")).toBe("xyz");
    expect(parseOauthState(null)).toBeNull();
    expect(parseOauthState("foo=bar")).toBeNull();
  });
});
