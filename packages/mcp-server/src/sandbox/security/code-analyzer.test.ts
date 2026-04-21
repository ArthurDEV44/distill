/**
 * Code Analyzer Tests
 *
 * Focused coverage for US-002: the `.constructor(` / `["constructor"]`
 * sandbox-escape chain. The broader analyzer surface (eval, process, loops…)
 * is covered by `sandbox.test.ts`.
 */

import { describe, it, expect } from "vitest";
import { analyzeCode, sanitizeError } from "./code-analyzer.js";

const CONSTRUCTOR_CHAIN_REASON = "blocked: constructor-chain access is not allowed";

describe("analyzeCode — constructor-chain escapes", () => {
  describe("positive cases (must be blocked)", () => {
    it("rejects the canonical this.constructor.constructor chain", () => {
      const result = analyzeCode(`this.constructor.constructor("return process")()`);
      expect(result.safe).toBe(false);
      expect(result.blockedPatterns).toContain(CONSTRUCTOR_CHAIN_REASON);
    });

    it("rejects ({}).constructor.constructor(…)()", () => {
      const result = analyzeCode(`({}).constructor.constructor("return 1")()`);
      expect(result.safe).toBe(false);
      expect(result.blockedPatterns).toContain(CONSTRUCTOR_CHAIN_REASON);
    });

    it("rejects bracket-string access: obj[\"constructor\"][\"constructor\"](…)()", () => {
      const result = analyzeCode(`obj["constructor"]["constructor"]("x")()`);
      expect(result.safe).toBe(false);
      expect(result.blockedPatterns).toContain(CONSTRUCTOR_CHAIN_REASON);
    });

    it("rejects conservative read: Array.prototype.constructor (documented false positive)", () => {
      const result = analyzeCode(`const C = Array.prototype.constructor;`);
      expect(result.safe).toBe(false);
      expect(result.blockedPatterns).toContain(CONSTRUCTOR_CHAIN_REASON);
    });
  });

  describe("negative cases (must pass)", () => {
    it("accepts plain object property access", () => {
      const result = analyzeCode(`const obj = { key: "value" }; return obj.key;`);
      expect(result.safe).toBe(true);
      expect(result.blockedPatterns).not.toContain(CONSTRUCTOR_CHAIN_REASON);
    });

    it("accepts array map without constructor access", () => {
      const result = analyzeCode(`const arr = [1, 2, 3]; return arr.map(x => x * 2);`);
      expect(result.safe).toBe(true);
      expect(result.blockedPatterns).not.toContain(CONSTRUCTOR_CHAIN_REASON);
    });
  });

  describe("unhappy path (obfuscated)", () => {
    it("still blocks when the payload contains the literal substring `process`", () => {
      // Concat-obfuscated constructor names bypass the .constructor regex,
      // but the inner payload still triggers the existing `process` pattern.
      const obfuscated = `this["con"+"structor"]["con"+"structor"]("return process")()`;
      const result = analyzeCode(obfuscated);
      expect(result.safe).toBe(false);
      expect(result.blockedPatterns).toContain("process is not allowed");
    });
  });
});

describe("analyzeCode — keyword reconstruction & reflection (CVE-2025-68613 defence in depth)", () => {
  const STRING_FROMCHARCODE_REASON =
    "String.fromCharCode is not allowed (keyword reconstruction vector)";
  const REFLECT_OWNKEYS_REASON = "Reflect.ownKeys is not allowed";
  const REFLECT_GET_REASON = "Reflect.get is not allowed";
  const REFLECT_GENERIC_REASON = "Reflect is not allowed";

  describe("positive cases (must be blocked)", () => {
    it("rejects the CVE-2025-68613 byte-reconstruction chain using String.fromCharCode", () => {
      // `this[String.fromCharCode(99,111,110,…)]…("return process")()` —
      // rebuilds "constructor" at runtime. The fromCharCode regex catches
      // it before the payload ever reaches QuickJS.
      const payload = `this[String.fromCharCode(99,111,110,115,116,114,117,99,116,111,114)]("x")`;
      const result = analyzeCode(payload);
      expect(result.safe).toBe(false);
      expect(result.blockedPatterns).toContain(STRING_FROMCHARCODE_REASON);
    });

    it("rejects Reflect.ownKeys(...) and also surfaces the generic Reflect reason", () => {
      const result = analyzeCode(`const keys = Reflect.ownKeys(obj);`);
      expect(result.safe).toBe(false);
      // Specific + general both fire; both should be present for triage.
      expect(result.blockedPatterns).toContain(REFLECT_OWNKEYS_REASON);
      expect(result.blockedPatterns).toContain(REFLECT_GENERIC_REASON);
    });

    it("rejects Reflect.get(target, key) and also surfaces the generic Reflect reason", () => {
      const result = analyzeCode(`Reflect.get(target, "constructor")`);
      expect(result.safe).toBe(false);
      expect(result.blockedPatterns).toContain(REFLECT_GET_REASON);
      expect(result.blockedPatterns).toContain(REFLECT_GENERIC_REASON);
    });

    it("blocks legitimate String.fromCharCode(65) utility use (conservative false positive, accepted)", () => {
      // Documented in the comment block of code-analyzer.ts above the
      // BLOCKED_PATTERNS entry. Intended behaviour.
      const result = analyzeCode(`const a = String.fromCharCode(65);`);
      expect(result.safe).toBe(false);
      expect(result.blockedPatterns).toContain(STRING_FROMCHARCODE_REASON);
    });
  });

  describe("unhappy path — fallback to generic Reflect pattern", () => {
    it("catches Reflect.apply via the broader \\bReflect\\b pattern", () => {
      // Reflect.apply is not in the specific block; the generic pattern is
      // the defence-in-depth backstop.
      const result = analyzeCode(`Reflect.apply(fn, thisArg, args)`);
      expect(result.safe).toBe(false);
      expect(result.blockedPatterns).toContain(REFLECT_GENERIC_REASON);
    });

    it("catches Reflect.has via the broader \\bReflect\\b pattern", () => {
      const result = analyzeCode(`Reflect.has(o, "x")`);
      expect(result.safe).toBe(false);
      expect(result.blockedPatterns).toContain(REFLECT_GENERIC_REASON);
    });
  });

  describe("negative cases (must pass — baseline regression)", () => {
    it("accepts plain string operations that do not touch String.fromCharCode or Reflect", () => {
      const result = analyzeCode(`const n = "hello world".length;`);
      expect(result.safe).toBe(true);
      expect(result.blockedPatterns).not.toContain(STRING_FROMCHARCODE_REASON);
      expect(result.blockedPatterns).not.toContain(REFLECT_GENERIC_REASON);
    });

    it("accepts String.prototype.charCodeAt (opposite direction, not a reconstruction vector)", () => {
      const result = analyzeCode(`const c = "A".charCodeAt(0);`);
      expect(result.safe).toBe(true);
      expect(result.blockedPatterns).not.toContain(STRING_FROMCHARCODE_REASON);
    });

    it("accepts usage of the identifier `reflect` (lowercase, not the global)", () => {
      // Word-boundary check prevents false positives on lowercase identifiers.
      const result = analyzeCode(`const reflect = (x) => x; reflect(42);`);
      expect(result.safe).toBe(true);
      expect(result.blockedPatterns).not.toContain(REFLECT_GENERIC_REASON);
    });
  });
});

describe("sanitizeError — workingDir metacharacter escaping (SEC-1)", () => {
  it("strips host paths even when workingDir contains regex metacharacters", () => {
    // Pre-fix, `new RegExp("/tmp/my+project", "g")` would match `/tmp/myyy…project`
    // or throw on unbalanced `(`, silently leaking the host path back to the guest.
    const workingDir = "/tmp/my+project (v2)";
    const err = new Error(`Failed to read ${workingDir}/src/foo.ts`);

    const result = sanitizeError(err, workingDir);

    expect(result).not.toContain(workingDir);
    expect(result).toContain("<workdir>");
  });

  it("does not throw when workingDir contains unbalanced regex groups", () => {
    const workingDir = "/tmp/weird(dir";
    const err = new Error("boom");

    expect(() => sanitizeError(err, workingDir)).not.toThrow();
  });

  it("still redacts a simple POSIX workingDir (no regression)", () => {
    const workingDir = "/home/user/project";
    const err = new Error(`ENOENT at ${workingDir}/missing.txt`);

    const result = sanitizeError(err, workingDir);

    expect(result).toContain("<workdir>");
    expect(result).not.toContain(workingDir);
  });
});
