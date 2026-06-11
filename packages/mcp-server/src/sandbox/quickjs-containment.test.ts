/**
 * QuickJS runtime containment smoke tests (US-015).
 *
 * These tests assert the EXECUTION-LEVEL security boundary — that obfuscated
 * escape vectors which slip past the static `analyzeCode` layer are still
 * contained by the QuickJS WASM sandbox + host-bridge path validation. They
 * are deliberately distinct from `code-analyzer.test.ts` (which tests the
 * static layer): a `reachedRuntime()` helper asserts a vector was NOT merely
 * rejected by the static analyzer ("Blocked patterns: …") but actually ran
 * inside QuickJS and was contained there.
 *
 * NOTE on the empirical model (verified June 2026 against @sebastianwessel/
 * quickjs@3.0.0): the original US-015 acceptance text assumed aliased `eval`
 * would throw ReferenceError. It does NOT — QuickJS provides a *sandboxed*
 * eval/Function. The stronger property these tests prove is the one that
 * actually matters: code executed via that sandboxed eval/Function cannot
 * reach HOST objects (no real `process` env, no `require`/fs module loader,
 * the raw host bridge still enforces path validation, `fetch` is disabled).
 */

import { describe, it, expect } from "vitest";
import { executeSandbox } from "./executor.js";
import { DEFAULT_LIMITS } from "./types.js";

const LIMITS = {
  workingDir: process.cwd(),
  timeout: 5000,
  memoryLimit: DEFAULT_LIMITS.memoryLimit,
  maxOutputTokens: DEFAULT_LIMITS.maxOutputTokens,
};

const run = (code: string) => executeSandbox(code, LIMITS);

/** True when execution was NOT short-circuited by the static analyzer (layer 1)
 *  — i.e. the vector actually entered the QuickJS runtime (layer 2). */
const reachedRuntime = (error?: string): boolean => !(error ?? "").includes("Blocked patterns");

// Reconstruct a reference to the QuickJS global + its `process` shim WITHOUT
// writing any statically-blocked literal (`Function(`, `process`, `globalThis`).
const GLOBAL = 'var f = Function; var g = f("return this")();';
const PROC = `${GLOBAL} var p = g[["proc","ess"].join("")];`;

describe("QuickJS runtime containment (US-015)", () => {
  describe("static analyzer (layer 1) still rejects literal escapes", () => {
    it("blocks literal eval(", async () => {
      const r = await run('return eval("1+1")');
      expect(r.success).toBe(false);
      expect(r.error ?? "").toContain("Blocked patterns");
    });

    it("blocks literal process", async () => {
      const r = await run("return process.env.HOME");
      expect(r.success).toBe(false);
      expect(r.error ?? "").toContain("Blocked patterns");
    });
  });

  describe("obfuscated escapes bypass layer 1 but are contained by QuickJS (layer 2)", () => {
    it("aliased eval runs inside QuickJS but cannot reach `require`", async () => {
      // `var e = eval` is not matched by /\beval\s*\(/ — it reaches the runtime.
      const r = await run('var e = eval; return e("typeof " + ["req","uire"].join(""))');
      expect(r.success).toBe(true);
      expect(reachedRuntime(r.error)).toBe(true); // not a static rejection
      expect(r.output).toBe("undefined"); // no Node module loader in the sandbox
    });

    it("aliased eval cannot reach a filesystem API (`readFileSync`)", async () => {
      const r = await run('var e = eval; return e("typeof " + ["read","FileSync"].join(""))');
      expect(r.success).toBe(true);
      expect(reachedRuntime(r.error)).toBe(true);
      expect(r.output).toBe("undefined");
    });

    it("`this['ev'+'al'](...)` throws at runtime (top-level `this` is undefined)", async () => {
      const r = await run('return this["ev"+"al"]("1+1")');
      expect(r.success).toBe(false);
      expect(reachedRuntime(r.error)).toBe(true); // runtime TypeError, not static
    });

    it("`(0,eval)(...)` runs but the comma-eval result is still sandboxed", async () => {
      const r = await run("return (0,eval)(1)");
      expect(r.success).toBe(true);
      expect(reachedRuntime(r.error)).toBe(true);
      expect(r.output).toBe(1); // evaluates a numeric literal; no host reach
    });
  });

  describe("the `process` shim exposes no host environment", () => {
    it("does not leak the host HOME", async () => {
      const r = await run(`${PROC} return p ? String(p["e"+"nv"] && p["e"+"nv"]["HO"+"ME"]) : "no-proc"`);
      expect(r.success).toBe(true);
      expect(r.output).toBe("undefined"); // host $HOME is never visible to guest code
    });

    it("does not expose process.platform / process.exit", async () => {
      const r = await run(`${PROC} return p ? (typeof p["plat"+"form"]) + "," + (typeof p["ex"+"it"]) : "no-proc"`);
      expect(r.success).toBe(true);
      expect(r.output).toBe("undefined,undefined");
    });

    it("does not leak the host PATH", async () => {
      const r = await run(`${PROC} return String(p && p["e"+"nv"] && p["e"+"nv"]["PA"+"TH"])`);
      expect(r.success).toBe(true);
      expect(r.output).toBe("undefined");
    });
  });

  describe("host capabilities reachable by obfuscation remain inert", () => {
    it("the raw host file-read bridge still enforces path validation", async () => {
      // Even reaching the raw `__hostReadFile` bridge (defense in depth), an
      // absolute escape path is rejected — the bridge validates, not just the SDK.
      const r = await run(
        `${PROC} var rf = p["e"+"nv"]["__host"+"ReadFile"]; ` +
          `try { rf("/etc/pa"+"sswd"); return "READ"; } catch (e) { return "blocked"; }`
      );
      expect(r.success).toBe(true);
      expect(r.output).toBe("blocked"); // path validation throws → no host file read
    });

    it("the raw host bridge rejects traversal escapes too", async () => {
      const r = await run(
        `${PROC} var rf = p["e"+"nv"]["__host"+"ReadFile"]; ` +
          `try { rf("../".repeat(8) + "etc/pa"+"sswd"); return "READ"; } catch (e) { return "blocked"; }`
      );
      expect(r.success).toBe(true);
      expect(r.output).toBe("blocked");
    });

    it("fetch is disabled (no network egress)", async () => {
      const r = await run('try { fetch("http://example.com"); return "reached"; } catch (e) { return "blocked"; }');
      expect(r.success).toBe(true);
      expect(r.output).toBe("blocked"); // fetch stub throws "disabled for security"
    });

    it("no global object leaks through a function's `this` (strict mode)", async () => {
      const r = await run("var g = (function () { return this; })(); return typeof g");
      expect(r.success).toBe(true);
      expect(r.output).toBe("undefined");
    });
  });
});
