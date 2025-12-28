/**
 * Sandbox Tests
 *
 * Tests for code execution SDK security and functionality.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { analyzeCode, sanitizeError } from "./security/index.js";
import { validatePath, validateGlobPattern } from "./security/path-validator.js";
import { executeSandbox } from "./executor.js";
import { DEFAULT_LIMITS } from "./types.js";

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
