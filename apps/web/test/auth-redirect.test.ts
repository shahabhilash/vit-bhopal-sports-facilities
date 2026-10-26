import { describe, expect, it } from "vitest";
import { classifyOAuthError, safeNext } from "../lib/auth-redirect";

describe("safeNext", () => {
  it.each(["/", "/book?sport=turf", "/my-bookings", "/admin#blocks"])("keeps same-site path %j", (path) => {
    expect(safeNext(path)).toBe(path);
  });

  it.each([
    null,
    "",
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    "javascript:alert(1)",
    "book",
    `/${"a".repeat(600)}`,
  ])("falls back to / for %j", (value) => {
    expect(safeNext(value)).toBe("/");
  });
});

describe("classifyOAuthError", () => {
  it("recognises the college-domain rejection from the sign-up hook", () => {
    expect(classifyOAuthError("server_error", "Use your @vitbhopal.ac.in email address.")).toBe("domain");
  });

  it("recognises a cancelled Google prompt", () => {
    expect(classifyOAuthError("access_denied", "The user denied access")).toBe("cancelled");
  });

  it("treats anything else as a generic failure", () => {
    expect(classifyOAuthError("server_error", "Unexpected failure")).toBe("failed");
    expect(classifyOAuthError(null, null)).toBe("failed");
  });
});
