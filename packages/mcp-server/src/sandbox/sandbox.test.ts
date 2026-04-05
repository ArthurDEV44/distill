/**
 * Sandbox Tests
 *
 * Tests for code execution SDK security and functionality.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { analyzeCode, sanitizeError } from "./security/index.js";
import { validatePath, validateGlobPattern } from "./security/path-validator.js";
import { executeSandbox, isQuickJSEnabled } from "./executor.js";
import { DEFAULT_LIMITS } from "./types.js";
import { createQuickJSRuntime, generateGuestSDKCode } from "./quickjs/index.js";

describe("Code Analyzer Security", () => {
  describe("analyzeCode", () => {
    it("should block eval", () => {
      const result = analyzeCode('const x = eval("1+1")');
      expect(result.safe).toBe(false);
      expect(result.blockedPatterns).toContain("eval() is not allowed");
    });

    it("should block require", () => {
      const result = analyzeCode('const fs = require("fs")');
      expect(result.safe).toBe(false);
      expect(result.blockedPatterns).toContain("require() is not allowed");
    });

    it("should block dynamic import", () => {
      const result = analyzeCode('const m = await import("./mod")');
      expect(result.safe).toBe(false);
      expect(result.blockedPatterns).toContain("dynamic import() is not allowed");
    });

    it("should block process access", () => {
      const result = analyzeCode("process.env.SECRET");
      expect(result.safe).toBe(false);
      expect(result.blockedPatterns).toContain("process is not allowed");
    });

    it("should block global access", () => {
      const result = analyzeCode("global.something = 1");
      expect(result.safe).toBe(false);
    });

    it("should block __proto__ access", () => {
      const result = analyzeCode("obj.__proto__.polluted = true");
      expect(result.safe).toBe(false);
    });

    it("should block Reflect", () => {
      const result = analyzeCode("Reflect.get(obj, key)");
      expect(result.safe).toBe(false);
    });

    it("should allow safe code", () => {
      const result = analyzeCode(`
        const x = 1 + 2;
        const arr = [1, 2, 3].map(n => n * 2);
        return arr;
      `);
      expect(result.safe).toBe(true);
      expect(result.blockedPatterns).toHaveLength(0);
    });

    it("should warn about infinite loops", () => {
      const result = analyzeCode("while(true) {}");
      expect(result.safe).toBe(true); // Not blocked, just warned
      expect(result.warnings).toContain("infinite loop detected");
    });
  });

  describe("sanitizeError", () => {
    it("should remove working directory from error", () => {
      const error = new Error("File not found: /home/user/project/file.ts");
      const sanitized = sanitizeError(error, "/home/user/project");
      expect(sanitized).not.toContain("/home/user/project");
      expect(sanitized).toContain("<workdir>");
    });

    it("should remove home paths", () => {
      const error = new Error("Error at /home/sauron/code/file.ts");
      const sanitized = sanitizeError(error, "/tmp");
      expect(sanitized).not.toContain("/home/sauron");
      expect(sanitized).toContain("<home>");
    });
  });
});

describe("Path Validator Security", () => {
  const workingDir = "/home/user/project";

  describe("validatePath", () => {
    it("should allow paths within working directory", () => {
      const result = validatePath("src/file.ts", workingDir);
      expect(result.safe).toBe(true);
      expect(result.resolvedPath).toBe("/home/user/project/src/file.ts");
    });

    it("should block path traversal", () => {
      const result = validatePath("../../../etc/passwd", workingDir);
      expect(result.safe).toBe(false);
      expect(result.error).toContain("working directory");
    });

    it("should block .env files", () => {
      const result = validatePath(".env", workingDir);
      expect(result.safe).toBe(false);
      expect(result.error).toContain("blocked");
    });

    it("should block .env.local files", () => {
      const result = validatePath(".env.local", workingDir);
      expect(result.safe).toBe(false);
    });

    it("should block private keys", () => {
      const result = validatePath("id_rsa", workingDir);
      expect(result.safe).toBe(false);
    });

    it("should block credentials files", () => {
      const result = validatePath("credentials.json", workingDir);
      expect(result.safe).toBe(false);
    });

    it("should allow normal source files", () => {
      const result = validatePath("src/index.ts", workingDir);
      expect(result.safe).toBe(true);
    });
  });

  describe("validateGlobPattern", () => {
    it("should allow relative patterns", () => {
      const result = validateGlobPattern("src/**/*.ts", workingDir);
      expect(result.safe).toBe(true);
    });

    it("should block path traversal in patterns", () => {
      const result = validateGlobPattern("../../**/*", workingDir);
      expect(result.safe).toBe(false);
    });

    it("should block absolute paths", () => {
      const result = validateGlobPattern("/etc/**/*", workingDir);
      expect(result.safe).toBe(false);
    });

    it("should block patterns matching sensitive files", () => {
      const result = validateGlobPattern("**/credentials.json", workingDir);
      expect(result.safe).toBe(false);
    });
  });
});

describe("Sandbox Executor", () => {
  const defaultContext = {
    workingDir: process.cwd(),
    timeout: 5000,
    memoryLimit: DEFAULT_LIMITS.memoryLimit,
    maxOutputTokens: DEFAULT_LIMITS.maxOutputTokens,
  };

  describe("executeSandbox", () => {
    it("should execute simple code", async () => {
      const result = await executeSandbox("return 1 + 1", defaultContext);
      expect(result.success).toBe(true);
      expect(result.output).toBe(2);
    });

    it("should execute code with ctx.utils", async () => {
      const result = await executeSandbox(
        'return ctx.utils.countTokens("hello world")',
        defaultContext
      );
      expect(result.success).toBe(true);
      expect(typeof result.output).toBe("number");
      expect(result.output).toBeGreaterThan(0);
    });

    it("should block dangerous code", async () => {
      const result = await executeSandbox('eval("1+1")', defaultContext);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Blocked patterns");
    });

    it("should block setTimeout usage", async () => {
      const result = await executeSandbox(
        "setTimeout(() => {}, 100); return 'done'",
        { ...defaultContext, timeout: 1000 }
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("Blocked patterns");
    });

    it("should track execution time", async () => {
      const result = await executeSandbox("return 42", defaultContext);
      expect(result.stats.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("should handle code returning an object", async () => {
      const result = await executeSandbox("return { x: 1, y: 2 }", defaultContext);
      expect(result.success).toBe(true);
      expect(result.output).toEqual({ x: 1, y: 2 });
    });

    it("should terminate infinite loop within timeout in default (QuickJS) mode", async () => {
      const start = Date.now();
      const result = await executeSandbox(
        "while(true) {}",
        { ...defaultContext, timeout: 500 }
      );
      const elapsed = Date.now() - start;
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      // Should terminate reasonably close to the timeout, not hang
      expect(elapsed).toBeLessThan(5000);
    }, 10000);
  });
});

describe("SDK Functions", () => {
  const defaultContext = {
    workingDir: process.cwd(),
    timeout: 5000,
    memoryLimit: DEFAULT_LIMITS.memoryLimit,
    maxOutputTokens: DEFAULT_LIMITS.maxOutputTokens,
  };

  it("should detect content type", async () => {
    const code = `
      const type = ctx.utils.detectType("error: something failed\\nwarning: deprecated");
      return type;
    `;
    const result = await executeSandbox(code, defaultContext);
    expect(result.success).toBe(true);
  });

  it("should detect language from path", async () => {
    const code = `
      const lang = ctx.utils.detectLanguage("src/server.ts");
      return lang;
    `;
    const result = await executeSandbox(code, defaultContext);
    expect(result.success).toBe(true);
    expect(result.output).toBe("typescript");
  });

  it("should compress content", async () => {
    const code = `
      const text = "error error error error warning warning info info";
      const compressed = ctx.compress.auto(text);
      return compressed.stats.reductionPercent;
    `;
    const result = await executeSandbox(code, defaultContext);
    expect(result.success).toBe(true);
  });
});

describe("QuickJS Sandbox Isolation", () => {
  const workingDir = process.cwd();

  describe("createQuickJSRuntime", () => {
    it("should create a runtime with correct options", async () => {
      const runtime = await createQuickJSRuntime({
        timeout: 5000,
        memoryLimit: 128,
        workingDir,
      });

      expect(runtime).toBeDefined();
      expect(typeof runtime.execute).toBe("function");
    });

    it("should execute simple code in sandbox", async () => {
      const runtime = await createQuickJSRuntime({
        timeout: 5000,
        memoryLimit: 128,
        workingDir,
      });

      const result = await runtime.execute(
        "export default 1 + 1",
        {} as any
      );

      expect(result.ok).toBe(true);
      expect(result.data).toBe(2);
    });

    it("should capture console logs", async () => {
      const runtime = await createQuickJSRuntime({
        timeout: 5000,
        memoryLimit: 128,
        workingDir,
      });

      const result = await runtime.execute(
        `console.log("hello"); export default "done"`,
        {} as any
      );

      expect(result.ok).toBe(true);
      expect(result.logs).toBeDefined();
      expect(result.logs?.some((log) => log.includes("hello"))).toBe(true);
    });
  });

  describe("generateGuestSDKCode", () => {
    it("should generate valid SDK code", () => {
      const code = generateGuestSDKCode();

      expect(code).toContain("const ctx");
      expect(code).toContain("files:");
      expect(code).toContain("compress:");
      expect(code).toContain("code:");
      expect(code).toContain("utils:");
      expect(code).toContain("git:");
      expect(code).toContain("search:");
      expect(code).toContain("analyze:");
      expect(code).toContain("pipeline:");
    });
  });

  describe("Isolation Security", () => {
    it("should not have access to real global object", async () => {
      const runtime = await createQuickJSRuntime({
        timeout: 5000,
        memoryLimit: 128,
        workingDir,
      });

      const result = await runtime.execute(
        "export default typeof global",
        {} as any
      );

      expect(result.ok).toBe(true);
      // QuickJS has no Node.js global
      expect(result.data).toBe("undefined");
    });

    it("should not have access to real process.env", async () => {
      const runtime = await createQuickJSRuntime({
        timeout: 5000,
        memoryLimit: 128,
        workingDir,
      });

      // Try to access real environment variables (should fail or be empty)
      const result = await runtime.execute(
        `
          let hasRealEnv = false;
          try {
            // Real Node process.env has PATH, HOME, etc
            hasRealEnv = process && process.env && (process.env.PATH || process.env.HOME);
          } catch (e) {
            hasRealEnv = false;
          }
          export default hasRealEnv ? "leaked" : "safe";
        `,
        {} as any
      );

      expect(result.ok).toBe(true);
      expect(result.data).toBe("safe");
    });

    it("should not have access to require", async () => {
      const runtime = await createQuickJSRuntime({
        timeout: 5000,
        memoryLimit: 128,
        workingDir,
      });

      const result = await runtime.execute(
        "export default typeof require",
        {} as any
      );

      expect(result.ok).toBe(true);
      expect(result.data).toBe("undefined");
    });

    it("should not be able to use Buffer to access filesystem", async () => {
      const runtime = await createQuickJSRuntime({
        timeout: 5000,
        memoryLimit: 128,
        workingDir,
      });

      // Try to use Buffer for file operations (should fail)
      const result = await runtime.execute(
        `
          let canAccessFS = false;
          try {
            // Try to create buffer from file (would work in real Node)
            const fs = require("fs");
            canAccessFS = true;
          } catch (e) {
            canAccessFS = false;
          }
          export default canAccessFS ? "leaked" : "safe";
        `,
        {} as any
      );

      expect(result.ok).toBe(true);
      expect(result.data).toBe("safe");
    });

    it("should not have access to Node.js native modules", async () => {
      const runtime = await createQuickJSRuntime({
        timeout: 5000,
        memoryLimit: 128,
        workingDir,
      });

      const result = await runtime.execute(
        `
          let canLoadNative = false;
          try {
            const child_process = require("child_process");
            canLoadNative = true;
          } catch (e) {}
          export default canLoadNative ? "leaked" : "safe";
        `,
        {} as any
      );

      expect(result.ok).toBe(true);
      expect(result.data).toBe("safe");
    });
  });

  describe("Resource Limits", () => {
    it("should enforce execution timeout", async () => {
      const runtime = await createQuickJSRuntime({
        timeout: 100, // Very short timeout
        memoryLimit: 128,
        workingDir,
      });

      const result = await runtime.execute(
        `
          let i = 0;
          while(true) { i++; }
          export default i;
        `,
        {} as any
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("Feature Flag", () => {
    it("should report QuickJS status correctly", () => {
      const enabled = isQuickJSEnabled();
      expect(typeof enabled).toBe("boolean");

      // By default, QuickJS is enabled (default mode since v0.9.0)
      if (!process.env.DISTILL_LEGACY_EXECUTOR && !process.env.DISTILL_USE_QUICKJS) {
        expect(enabled).toBe(true);
      }
    });
  });
});
