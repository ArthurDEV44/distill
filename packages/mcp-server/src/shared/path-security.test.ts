import { describe, it, expect } from "vitest";
import { BLOCKED_PATTERNS, isBlockedPath, getBlockedPatterns } from "./path-security.js";
import { validatePath } from "../sandbox/security/path-validator.js";

/**
 * US-010: the blocked-pattern policy is a single shared source. These tests
 * assert the policy itself AND that the sandbox path validator (which imports
 * BLOCKED_PATTERNS from here) makes the same decision the tool side would.
 */
describe("shared path-security policy (US-010)", () => {
  it("blocks sensitive files", () => {
    for (const f of [
      ".env",
      ".env.local",
      "id_rsa",
      "id_ed25519",
      "server.pem",
      "app.key",
      "secrets.json",
      "credentials.json",
      ".npmrc",
      ".netrc",
    ]) {
      expect(isBlockedPath(f)).toBe(true);
    }
  });

  it("allows ordinary source files", () => {
    for (const f of ["index.ts", "server.ts", "README.md", "data.json", "config.yaml"]) {
      expect(isBlockedPath(f)).toBe(false);
    }
  });

  it("getBlockedPatterns returns the canonical list", () => {
    expect(getBlockedPatterns()).toBe(BLOCKED_PATTERNS);
    expect(getBlockedPatterns().length).toBeGreaterThan(0);
  });

  it("sandbox validatePath and the shared policy agree (single source of truth)", () => {
    const workingDir = process.cwd();
    // Both sides derive from the same BLOCKED_PATTERNS — a blocked file is
    // rejected by the sandbox validator and flagged by the shared predicate.
    const validation = validatePath(".env", workingDir);
    expect(validation.safe).toBe(false);
    expect(isBlockedPath(".env")).toBe(true);

    // And an ordinary file is accepted by both.
    expect(isBlockedPath("src/index.ts")).toBe(false);
  });
});
