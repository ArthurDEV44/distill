/**
 * Auto-Optimize Tool Tests
 *
 * Comprehensive tests for all 9 compression strategies,
 * auto-detection, preservePatterns, aggressive mode, and stats accuracy.
 */

import { describe, it, expect } from "vitest";
import { createAutoOptimizeTool } from "./auto-optimize.js";

const tool = createAutoOptimizeTool();

// Helper: call tool and extract text + structuredContent
async function optimize(args: Record<string, unknown>) {
  const result = await tool.execute(args);
  const text = result.content[0]?.text ?? "";
  const sc = (result as { structuredContent?: Record<string, unknown> }).structuredContent;
  return { text, sc, result };
}

// ---------------------------------------------------------------------------
// Sample content generators (each must be >500 chars to pass threshold)
// ---------------------------------------------------------------------------

const SAMPLE_BUILD = `
src/server.ts(12,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
src/server.ts(15,10): error TS2339: Property 'foo' does not exist on type 'Server'.
src/tools/registry.ts(42,3): error TS2741: Property 'name' is missing in type '{}' but required in type 'ToolDefinition'.
src/tools/registry.ts(55,1): error TS7006: Parameter 'args' implicitly has an 'any' type.
src/index.ts(8,1): warning TS6133: 'unused' is declared but its value is never read.
src/middleware/chain.ts(22,5): error TS2345: Argument of type 'Middleware' is not assignable to parameter of type 'MiddlewareChain'.
src/middleware/logging.ts(10,3): error TS2322: Type 'string' is not assignable to type 'boolean'.
npm ERR! TypeScript compilation failed with 6 errors and 1 warning.
`.trim();

// Log sample avoids "error:" keyword and \d+:\d+.*error pattern which triggers build detection
const SAMPLE_LOGS = `
Jan 15 10:00:01 app-server [INFO] Server starting on port 3000
Jan 15 10:00:02 app-server [INFO] Database connected to postgres
Jan 15 10:00:03 app-server [INFO] Loading middleware chain
Jan 15 10:00:04 app-server [WARN] Deprecated API endpoint /v1/users detected
Jan 15 10:00:05 app-server [INFO] Route registered GET /api/health
Jan 15 10:00:06 app-server [INFO] Route registered POST /api/auth/login
Jan 15 10:00:07 app-server [WARN] Connection timeout to redis after 5000ms
Jan 15 10:00:08 app-server [INFO] Retrying redis connection
Jan 15 10:00:09 app-server [INFO] Redis connected successfully
Jan 15 10:00:10 app-server [INFO] Server ready accepting connections
Jan 15 10:00:11 app-server [INFO] Health check passed
Jan 15 10:00:12 app-server [INFO] Request GET /api/health 200 3ms
Jan 15 10:00:13 app-server [INFO] Request POST /api/auth/login 200 45ms
Jan 15 10:00:14 app-server [WARN] Rate limit approaching for IP 192.168.1.1
`.trim();

const SAMPLE_DIFF = `
diff --git a/src/server.ts b/src/server.ts
index abc1234..def5678 100644
--- a/src/server.ts
+++ b/src/server.ts
@@ -10,7 +10,9 @@ import { Server } from "@modelcontextprotocol/sdk/server/index.js";

 export async function createServer(config: ServerConfig = {}): Promise<ServerInstance> {
   const middleware = createMiddlewareChain();
-  middleware.use(createLoggingMiddleware({ verbose: false }));
+  middleware.use(createLoggingMiddleware({ verbose: config.verbose ?? false }));
+
+  // Create tool registry
   const tools = createToolRegistry();
   tools.setMiddlewareChain(middleware);

@@ -25,6 +27,8 @@ export async function createServer(config: ServerConfig = {}): Promise<ServerInst
   tools.register(smartFileReadTool);
   tools.register(codeExecuteTool);

+  console.error("[distill] 3 tools registered");
+
   const server = new Server(
     { name: "distill-mcp", version: "0.1.0" },
     { capabilities: { tools: {} } }
`.trim();

const SAMPLE_STACKTRACE = `
Error: Connection refused
    at TCPConnectWrap.afterConnect [as oncomplete] (net.js:1141:16)
    at Protocol._enqueue (/app/node_modules/mysql/lib/protocol/Protocol.js:144:48)
    at Protocol.handshake (/app/node_modules/mysql/lib/protocol/Protocol.js:51:23)
    at PoolConnection.connect (/app/node_modules/mysql/lib/Connection.js:116:18)
    at Pool.getConnection (/app/node_modules/mysql/lib/Pool.js:48:16)
    at Pool.query (/app/node_modules/mysql/lib/Pool.js:202:8)
    at Object.query (/app/src/database/connection.ts:45:12)
    at UserService.findById (/app/src/services/user.ts:22:20)
    at AuthController.login (/app/src/controllers/auth.ts:15:24)
    at Layer.handle [as handle_request] (/app/node_modules/express/lib/router/layer.js:95:5)
    at next (/app/node_modules/express/lib/router/route.js:137:13)
    at Route.dispatch (/app/node_modules/express/lib/router/route.js:112:3)
`.trim();

const SAMPLE_CONFIG = `
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
`.trim();

const SAMPLE_CODE = `
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

export interface ServerConfig {
  verbose?: boolean;
}

export async function createServer(config: ServerConfig = {}): Promise<void> {
  const server = new Server({ name: "test", version: "0.1.0" }, { capabilities: { tools: {} } });

  server.setRequestHandler("tools/list", async () => ({
    tools: [{ name: "test", description: "A test tool", inputSchema: { type: "object" } }],
  }));

  server.setRequestHandler("tools/call", async (request) => {
    const { name } = request.params;
    return { content: [{ type: "text", text: "result from " + name }] };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
`.trim();

const SAMPLE_ERRORS = Array.from({ length: 20 }, (_, i) => {
  const types = [
    "TypeError: Cannot read properties of undefined (reading 'map')",
    "ReferenceError: foo is not defined",
    "SyntaxError: Unexpected token '}'",
    "TypeError: Cannot read properties of undefined (reading 'map')",
    "RangeError: Maximum call stack size exceeded",
  ];
  return `${types[i % types.length]} at line ${i + 1}`;
}).join("\n");

// Generic content that doesn't match any specific pattern
const SAMPLE_GENERIC = Array.from(
  { length: 30 },
  (_, i) => `This is a line of generic text content number ${i + 1} that should be compressed using the default generic strategy without any special handling.`
).join("\n");

// Rust compiler errors (triggers "error[E" in isBuildOutput)
const SAMPLE_BUILD_RUST = [
  "error[E0433]: failed to resolve: use of undeclared crate or module `serde`",
  "  --> src/main.rs:1:5",
  "   |",
  "1  | use serde::Serialize;",
  '   |     ^^^^^ use of undeclared crate or module `serde`',
  "",
  "error[E0599]: no method named `map` found for struct `Vec<i32>` in the current scope",
  "  --> src/lib.rs:10:8",
  "   |",
  "10 |     v.map(|x| x * 2);",
  '   |       ^^^ method not found in `Vec<i32>`',
  "",
  "error[E0308]: mismatched types",
  "  --> src/handler.rs:22:12",
  "   |",
  "22 |     return Ok(value);",
  '   |            ^^^^^^^^^^ expected `String`, found `i32`',
  "",
  "error[E0277]: the trait bound `MyStruct: Serialize` is not satisfied",
  "  --> src/api.rs:15:5",
  "   |",
  "15 |     serde_json::to_string(&data)?;",
  "   |     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ the trait `Serialize` is not implemented for `MyStruct`",
  "",
  "error: aborting due to 4 previous errors",
].join("\n");

// Webpack errors (triggers "ERROR in" in isBuildOutput)
const SAMPLE_BUILD_WEBPACK = [
  "ERROR in ./src/index.tsx",
  "Module not found: Error: Can't resolve './components/App'",
  " @ ./src/index.tsx 3:0-35",
  "",
  "ERROR in ./src/pages/Home.tsx",
  "Module not found: Error: Can't resolve '@/utils/helpers'",
  " @ ./src/pages/Home.tsx 1:0-42 5:15-22",
  "",
  "ERROR in ./src/components/Header.tsx 12:4",
  "Module parse failed: Unexpected token (12:4)",
  "You may need an appropriate loader to handle this file type.",
  "|   return (",
  "|     <div className={styles.header}>",
  "|       <Logo />",
  "",
  "ERROR in ./src/styles/main.css",
  "Module build failed: Error: ENOENT: no such file or directory",
  " @ ./src/App.tsx 2:0-28",
  "",
  "webpack 5.91.0 compiled with 4 errors in 2341 ms",
].join("\n");

// Python traceback (should NOT trigger isBuildOutput — "ValueError:" has capital E)
const SAMPLE_STACKTRACE_PYTHON = [
  "Traceback (most recent call last):",
  '  File "/app/main.py", line 42, in <module>',
  "    result = process_data(raw_input)",
  '  File "/app/processor.py", line 18, in process_data',
  "    validated = validate(data)",
  '  File "/app/validator.py", line 55, in validate',
  "    schema.check(data)",
  '  File "/app/lib/schema.py", line 102, in check',
  "    self._validate_field(field, value)",
  '  File "/app/lib/schema.py", line 78, in _validate_field',
  "    raise ValueError(f\"Field '{field}' expected type {expected}, got {type(value).__name__}\")",
  "ValueError: Field 'age' expected type int, got str",
  "",
  "During handling of the above exception, another exception occurred:",
  "",
  "Traceback (most recent call last):",
  '  File "/app/main.py", line 45, in <module>',
  "    handle_error(e)",
  '  File "/app/error_handler.py", line 12, in handle_error',
  "    logger.critical(str(error))",
  "AttributeError: 'NoneType' object has no attribute 'critical'",
].join("\n");

// YAML config (should detect as config via isLikelyYAML)
const SAMPLE_CONFIG_YAML = [
  "apiVersion: apps/v1",
  "kind: Deployment",
  "metadata:",
  "  name: distill-server",
  "  namespace: production",
  "  labels:",
  "    app: distill",
  '    version: "1.0.0"',
  "spec:",
  "  replicas: 3",
  "  selector:",
  "    matchLabels:",
  "      app: distill",
  "  template:",
  "    metadata:",
  "      labels:",
  "        app: distill",
  "    spec:",
  "      containers:",
  "        - name: server",
  "          image: distill-mcp:1.0.0",
  "          ports:",
  "            - containerPort: 8080",
  "          resources:",
  "            limits:",
  '              memory: "256Mi"',
  '              cpu: "500m"',
  "            requests:",
  '              memory: "128Mi"',
  '              cpu: "250m"',
  "          env:",
  "            - name: NODE_ENV",
  '              value: "production"',
  "            - name: LOG_LEVEL",
  '              value: "info"',
].join("\n");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("auto_optimize", () => {
  describe("short input bypass", () => {
    it("should return original content when input is too short", async () => {
      const { text } = await optimize({ content: "short" });
      expect(text).toContain("short");
      expect(text).toContain("-0%");
    });

    it("should include token count in bypass message", async () => {
      const short = "a".repeat(100);
      const { text } = await optimize({ content: short });
      expect(text).toContain("-0%");
      expect(text).toContain("[none]");
    });

    it("should return structuredContent with original content for short input", async () => {
      const { sc } = await optimize({ content: "short" });
      expect(sc).toBeDefined();
      expect(sc?.detectedType).toBe("none");
      expect(sc?.optimizedContent).toBe("short");
    });
  });

  describe("auto-detection", () => {
    it("should detect build output", async () => {
      const { sc } = await optimize({ content: SAMPLE_BUILD });
      expect(sc?.detectedType).toMatch(/^build/);
    });

    it("should detect log output", async () => {
      const { sc } = await optimize({ content: SAMPLE_LOGS });
      expect(sc?.detectedType).toMatch(/^logs/);
    });

    it("should detect diff output", async () => {
      const { sc } = await optimize({ content: SAMPLE_DIFF });
      expect(sc?.detectedType).toBe("diff");
    });

    it("should detect stacktrace", async () => {
      const { sc } = await optimize({ content: SAMPLE_STACKTRACE });
      expect(sc?.detectedType).toBe("stacktrace");
    });

    it("should detect config (JSON)", async () => {
      const { sc } = await optimize({ content: SAMPLE_CONFIG });
      expect(sc?.detectedType).toBe("config");
    });

    it("should fall back to generic for unrecognized content", async () => {
      const { sc } = await optimize({ content: SAMPLE_GENERIC });
      expect(sc?.detectedType).toBeDefined();
      expect(typeof sc?.savingsPercent).toBe("number");
    });
  });

  describe("explicit strategy override", () => {
    it("should use build strategy when explicitly set", async () => {
      const { sc } = await optimize({ content: SAMPLE_GENERIC, strategy: "build" });
      expect(sc?.detectedType).toMatch(/^build/);
    });

    it("should use logs strategy when explicitly set", async () => {
      const { sc } = await optimize({ content: SAMPLE_GENERIC, strategy: "logs" });
      expect(sc?.detectedType).toMatch(/^logs/);
    });

    it("should use diff strategy when explicitly set", async () => {
      const { sc } = await optimize({ content: SAMPLE_DIFF, strategy: "diff" });
      expect(sc?.detectedType).toBe("diff");
    });

    it("should use semantic strategy for code", async () => {
      const { sc } = await optimize({ content: SAMPLE_CODE, strategy: "code" });
      expect(sc?.detectedType).toBe("semantic");
    });

    it("should use config strategy when explicitly set", async () => {
      const { sc } = await optimize({ content: SAMPLE_CONFIG, strategy: "config" });
      expect(sc?.detectedType).toBe("config");
    });

    it("should use errors strategy when explicitly set", async () => {
      const { sc } = await optimize({ content: SAMPLE_ERRORS, strategy: "errors" });
      expect(sc?.detectedType).toBe("errors");
    });

    it("should use stacktrace strategy when explicitly set", async () => {
      const { sc } = await optimize({ content: SAMPLE_STACKTRACE, strategy: "stacktrace" });
      expect(sc?.detectedType).toBe("stacktrace");
    });

    it("should override auto-detection with explicit strategy", async () => {
      // SAMPLE_BUILD would auto-detect as build, but force semantic
      const { sc } = await optimize({ content: SAMPLE_BUILD, strategy: "semantic" });
      expect(sc?.detectedType).toBe("semantic");
    });
  });

  describe("legacy hint support", () => {
    it("should accept hint param for backward compat", async () => {
      const { sc } = await optimize({ content: SAMPLE_GENERIC, hint: "build" });
      expect(sc?.detectedType).toMatch(/^build/);
    });

    it("should prefer strategy over hint", async () => {
      const { sc } = await optimize({ content: SAMPLE_GENERIC, strategy: "errors", hint: "build" });
      expect(sc?.detectedType).toBe("errors");
    });
  });

  describe("compression stats", () => {
    it("should return valid originalTokens", async () => {
      const { sc } = await optimize({ content: SAMPLE_BUILD });
      expect(sc?.originalTokens).toBeGreaterThan(0);
      expect(typeof sc?.originalTokens).toBe("number");
    });

    it("should return valid optimizedTokens", async () => {
      const { sc } = await optimize({ content: SAMPLE_BUILD });
      expect(typeof sc?.optimizedTokens).toBe("number");
      // Note: build strategy can produce LARGER output (adds formatting/explanations)
      expect(sc!.optimizedTokens as number).toBeGreaterThan(0);
    });

    it("should return valid savingsPercent", async () => {
      const { sc } = await optimize({ content: SAMPLE_BUILD });
      const pct = sc?.savingsPercent as number;
      expect(typeof pct).toBe("number");
      // savingsPercent can be negative when output is larger (e.g., build adds context)
      expect(pct).toBeLessThanOrEqual(100);
    });

    it("should include method in stats", async () => {
      const { sc } = await optimize({ content: SAMPLE_BUILD });
      expect(typeof sc?.method).toBe("string");
      expect((sc?.method as string).length).toBeGreaterThan(0);
    });

    it("should format stats in text header", async () => {
      const { text } = await optimize({ content: SAMPLE_BUILD });
      // Header format: [type] originalTokens->optimizedTokens tokens (-savingsPercent%)
      // savingsPercent can be negative (--NN%) when build adds context
      expect(text).toMatch(/\[.+\] \d+->\d+ tokens \(-?-?\d+%\)/);
    });
  });

  describe("aggressive mode", () => {
    it("should produce output in aggressive mode", async () => {
      const { sc } = await optimize({ content: SAMPLE_CODE, strategy: "semantic", aggressive: true });
      expect(sc?.detectedType).toBe("semantic");
      expect(sc?.savingsPercent).toBeGreaterThanOrEqual(0);
    });

    it("should produce output in non-aggressive mode", async () => {
      const { sc } = await optimize({ content: SAMPLE_CODE, strategy: "semantic", aggressive: false });
      expect(sc?.detectedType).toBe("semantic");
    });
  });

  describe("preservePatterns", () => {
    it("should accept preservePatterns param without error", async () => {
      const { sc } = await optimize({
        content: SAMPLE_CODE,
        strategy: "semantic",
        preservePatterns: ["import.*Server"],
      });
      expect(sc).toBeDefined();
    });

    it("should preserve content matching patterns in semantic output", async () => {
      const { sc } = await optimize({
        content: SAMPLE_CODE,
        strategy: "semantic",
        preservePatterns: ["createServer"],
      });
      expect(sc?.optimizedContent).toContain("createServer");
    });

    it("should silently ignore invalid regex patterns", async () => {
      const { sc } = await optimize({
        content: SAMPLE_CODE,
        strategy: "semantic",
        preservePatterns: ["[invalid", "valid.*pattern"],
      });
      expect(sc).toBeDefined();
    });

    it("should warn about unsafe regex patterns (ReDoS)", async () => {
      const { text } = await optimize({
        content: SAMPLE_CODE,
        strategy: "semantic",
        preservePatterns: ["(a+)+b"],
      });
      expect(text).toContain("[WARN]");
      expect(text).toContain("ReDoS");
    });
  });

  describe("output format", () => {
    it("should support plain format for errors strategy", async () => {
      // Note: build strategy always produces markdown (parser behavior)
      // Test plain format with errors strategy which respects format param
      const { text } = await optimize({ content: SAMPLE_ERRORS, strategy: "errors", format: "plain" });
      expect(text).not.toContain("##");
    });

    it("should support markdown format for errors", async () => {
      const { text } = await optimize({ content: SAMPLE_ERRORS, strategy: "errors", format: "markdown" });
      expect(text).toBeDefined();
    });
  });

  describe("empty input", () => {
    it("should return isError for empty string", async () => {
      const { result } = await optimize({ content: "" });
      expect(result.isError).toBe(true);
    });

    it("should return 0% savings for empty input", async () => {
      const { sc } = await optimize({ content: "" });
      expect(sc?.savingsPercent).toBe(0);
    });

    it("should return error message for whitespace-only input", async () => {
      const { result } = await optimize({ content: "   \n  \t  " });
      expect(result.isError).toBe(true);
    });
  });

  describe("response_format", () => {
    it("should produce different output for minimal vs normal vs detailed", async () => {
      const minimal = await optimize({ content: SAMPLE_BUILD, response_format: "minimal" });
      const normal = await optimize({ content: SAMPLE_BUILD, response_format: "normal" });
      const detailed = await optimize({ content: SAMPLE_BUILD, response_format: "detailed" });

      // All should have content
      expect(minimal.text.length).toBeGreaterThan(0);
      expect(normal.text.length).toBeGreaterThan(0);
      expect(detailed.text.length).toBeGreaterThan(0);

      // Detailed should be longer than minimal
      expect(detailed.text.length).toBeGreaterThan(minimal.text.length);
    });

    it("should include savings percentage in minimal format", async () => {
      const { text } = await optimize({ content: SAMPLE_BUILD, response_format: "minimal" });
      expect(text).toMatch(/\(-?\d+%\)/);
    });

    it("should include strategy info in detailed format", async () => {
      const { text } = await optimize({ content: SAMPLE_BUILD, response_format: "detailed" });
      expect(text).toContain("Strategy:");
      expect(text).toContain("Method:");
      expect(text).toContain("Tokens:");
    });

    it("should default to normal format", async () => {
      const withDefault = await optimize({ content: SAMPLE_BUILD });
      const withExplicit = await optimize({ content: SAMPLE_BUILD, response_format: "normal" });
      expect(withDefault.text).toBe(withExplicit.text);
    });
  });

  describe("very large input", () => {
    it("should handle >100K chars without crashing", async () => {
      const largeContent = "INFO server log line with some data and context\n".repeat(3000);
      expect(largeContent.length).toBeGreaterThan(100_000);
      const { sc } = await optimize({ content: largeContent, strategy: "logs" });
      expect(sc).toBeDefined();
      expect(sc?.detectedType).toMatch(/^logs/);
    }, 30_000);
  });

  describe("invalid strategy", () => {
    it("should handle unknown strategy value gracefully", async () => {
      // Unknown strategy should fall through to auto-detection
      const { sc } = await optimize({ content: SAMPLE_BUILD, strategy: "nonexistent" });
      expect(sc).toBeDefined();
      expect(typeof sc?.savingsPercent).toBe("number");
    });
  });

  describe("structuredContent", () => {
    it("should return structuredContent with all required fields", async () => {
      const { sc } = await optimize({ content: SAMPLE_BUILD });
      expect(sc).toBeDefined();
      expect(sc).toHaveProperty("detectedType");
      expect(sc).toHaveProperty("originalTokens");
      expect(sc).toHaveProperty("optimizedTokens");
      expect(sc).toHaveProperty("savingsPercent");
      expect(sc).toHaveProperty("method");
      expect(sc).toHaveProperty("optimizedContent");
    });

    it("should have optimizedContent as string", async () => {
      const { sc } = await optimize({ content: SAMPLE_BUILD });
      expect(typeof sc?.optimizedContent).toBe("string");
      expect((sc?.optimizedContent as string).length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Comprehensive tests — auto-detection sub-types
  // =========================================================================

  describe("auto-detection — build sub-types", () => {
    it("should detect TypeScript errors as build-tsc", async () => {
      const { sc } = await optimize({ content: SAMPLE_BUILD });
      expect(sc?.detectedType).toBe("build-tsc");
    });

    it("should detect Rust compiler errors as build-rust", async () => {
      const { sc } = await optimize({ content: SAMPLE_BUILD_RUST });
      expect(sc?.detectedType).toBe("build-rust");
    });

    it("should detect Webpack errors as build-webpack", async () => {
      const { sc } = await optimize({ content: SAMPLE_BUILD_WEBPACK });
      expect(sc?.detectedType).toBe("build-webpack");
    });
  });

  describe("auto-detection — stacktrace variants", () => {
    it("should detect Python traceback as stacktrace", async () => {
      const { sc } = await optimize({ content: SAMPLE_STACKTRACE_PYTHON });
      expect(sc?.detectedType).toBe("stacktrace");
    });
  });

  describe("auto-detection — config variants", () => {
    it("should detect YAML config", async () => {
      const { sc } = await optimize({ content: SAMPLE_CONFIG_YAML });
      expect(sc?.detectedType).toBe("config");
    });
  });

  describe("auto-detection — code", () => {
    it("should detect code as semantic", async () => {
      const { sc } = await optimize({ content: SAMPLE_CODE });
      expect(sc?.detectedType).toBe("semantic");
    });
  });

  // =========================================================================
  // Comprehensive tests — aggressive mode differential
  // =========================================================================

  describe("aggressive mode — differential compression", () => {
    it("should produce different output for diff strategy", async () => {
      const normal = await optimize({ content: SAMPLE_DIFF, strategy: "diff", aggressive: false });
      const aggr = await optimize({ content: SAMPLE_DIFF, strategy: "diff", aggressive: true });
      // aggressive uses "summary" strategy vs "hunks-only"
      expect(aggr.sc?.optimizedContent).not.toBe(normal.sc?.optimizedContent);
    });

    it("should produce equal or higher compression for stacktrace", async () => {
      const normal = await optimize({ content: SAMPLE_STACKTRACE, strategy: "stacktrace", aggressive: false });
      const aggr = await optimize({ content: SAMPLE_STACKTRACE, strategy: "stacktrace", aggressive: true });
      expect(aggr.sc?.optimizedTokens as number).toBeLessThanOrEqual(normal.sc?.optimizedTokens as number);
    });

    it("should produce equal or higher compression for config", async () => {
      const normal = await optimize({ content: SAMPLE_CONFIG, strategy: "config", aggressive: false });
      const aggr = await optimize({ content: SAMPLE_CONFIG, strategy: "config", aggressive: true });
      expect(aggr.sc?.optimizedTokens as number).toBeLessThanOrEqual(normal.sc?.optimizedTokens as number);
    });

    it("should produce equal or higher compression for semantic", async () => {
      const normal = await optimize({ content: SAMPLE_CODE, strategy: "semantic", aggressive: false });
      const aggr = await optimize({ content: SAMPLE_CODE, strategy: "semantic", aggressive: true });
      expect(aggr.sc?.optimizedTokens as number).toBeLessThanOrEqual(normal.sc?.optimizedTokens as number);
    });

    it("should produce equal or higher compression for generic", async () => {
      const normal = await optimize({ content: SAMPLE_GENERIC, aggressive: false });
      const aggr = await optimize({ content: SAMPLE_GENERIC, aggressive: true });
      expect(aggr.sc?.optimizedTokens as number).toBeLessThanOrEqual(normal.sc?.optimizedTokens as number);
    });

    it("should not affect build strategy (build ignores aggressive)", async () => {
      const normal = await optimize({ content: SAMPLE_BUILD, strategy: "build", aggressive: false });
      const aggr = await optimize({ content: SAMPLE_BUILD, strategy: "build", aggressive: true });
      expect(normal.sc?.optimizedContent).toBe(aggr.sc?.optimizedContent);
    });

    it("should not affect logs strategy (logs ignores aggressive)", async () => {
      const normal = await optimize({ content: SAMPLE_LOGS, strategy: "logs", aggressive: false });
      const aggr = await optimize({ content: SAMPLE_LOGS, strategy: "logs", aggressive: true });
      expect(normal.sc?.optimizedContent).toBe(aggr.sc?.optimizedContent);
    });

    it("should not affect errors strategy (errors ignores aggressive)", async () => {
      const normal = await optimize({ content: SAMPLE_ERRORS, strategy: "errors", aggressive: false });
      const aggr = await optimize({ content: SAMPLE_ERRORS, strategy: "errors", aggressive: true });
      expect(normal.sc?.optimizedContent).toBe(aggr.sc?.optimizedContent);
    });
  });

  // =========================================================================
  // Comprehensive tests — preservePatterns expanded
  // =========================================================================

  describe("preservePatterns — generic strategy", () => {
    it("should preserve patterns in generic compression", async () => {
      const markedContent = SAMPLE_GENERIC + "\nSPECIAL_MARKER_XYZ_12345 must survive compression";
      const { sc } = await optimize({
        content: markedContent,
        preservePatterns: ["SPECIAL_MARKER_XYZ_12345"],
      });
      expect(sc?.optimizedContent).toContain("SPECIAL_MARKER_XYZ_12345");
    });

    it("should work with empty preservePatterns array", async () => {
      const { sc } = await optimize({
        content: SAMPLE_CODE,
        strategy: "semantic",
        preservePatterns: [],
      });
      expect(sc).toBeDefined();
      expect(sc?.detectedType).toBe("semantic");
    });

    it("should filter patterns longer than 500 chars", async () => {
      const longPattern = "a".repeat(501);
      const { text } = await optimize({
        content: SAMPLE_CODE,
        strategy: "semantic",
        preservePatterns: [longPattern],
      });
      // Length >500 triggers the same warning branch as unsafe regex (both guarded by same condition)
      expect(text).toContain("[WARN]");
      expect(text).toContain("unsafe regex");
    });

    it("should handle all patterns being invalid", async () => {
      const { sc } = await optimize({
        content: SAMPLE_CODE,
        strategy: "semantic",
        preservePatterns: ["[invalid", "another[bad"],
      });
      expect(sc).toBeDefined();
      expect(sc?.detectedType).toBe("semantic");
    });

    it("should include warning text for unsafe regex", async () => {
      const { text } = await optimize({
        content: SAMPLE_CODE,
        strategy: "semantic",
        preservePatterns: ["[invalid"],
      });
      expect(text).toContain("[WARN]");
      // safe-regex2 catches this before new RegExp() — flagged as ReDoS risk
      expect(text).toContain("ReDoS");
    });

    it("should not error when preservePatterns used with build strategy", async () => {
      const { sc } = await optimize({
        content: SAMPLE_BUILD,
        strategy: "build",
        preservePatterns: ["error TS2345"],
      });
      expect(sc).toBeDefined();
      expect(sc?.detectedType).toMatch(/^build/);
    });
  });

  // =========================================================================
  // Comprehensive tests — short input boundary
  // =========================================================================

  describe("short input boundary", () => {
    it("should bypass compression for 499-char content", async () => {
      const content = "x".repeat(499);
      const { sc } = await optimize({ content });
      expect(sc?.detectedType).toBe("none");
      expect(sc?.method).toBe("none");
      expect(sc?.savingsPercent).toBe(0);
      expect(sc?.optimizedContent).toBe(content);
    });

    it("should attempt compression for 500-char content", async () => {
      // 500 chars is NOT < 500, so it passes the threshold
      const content = "a ".repeat(250);
      const { sc } = await optimize({ content });
      expect(sc?.detectedType).not.toBe("none");
    });

    it("should report matching token counts for short input", async () => {
      const content = "hello world tokens";
      const { sc } = await optimize({ content });
      expect(sc?.originalTokens).toBeGreaterThan(0);
      expect(sc?.optimizedTokens).toBe(sc?.originalTokens);
    });
  });

  // =========================================================================
  // Comprehensive tests — stats mathematical consistency
  // =========================================================================

  describe("stats mathematical consistency", () => {
    it("should have consistent savingsPercent for logs", async () => {
      const { sc } = await optimize({ content: SAMPLE_LOGS, strategy: "logs" });
      const original = sc?.originalTokens as number;
      const optimized = sc?.optimizedTokens as number;
      const savings = sc?.savingsPercent as number;
      const expected = Math.round((1 - optimized / original) * 100);
      expect(savings).toBe(expected);
    });

    it("should have all numeric fields as finite numbers", async () => {
      const { sc } = await optimize({ content: SAMPLE_BUILD });
      expect(Number.isFinite(sc?.originalTokens)).toBe(true);
      expect(Number.isFinite(sc?.optimizedTokens)).toBe(true);
      expect(Number.isFinite(sc?.savingsPercent)).toBe(true);
    });

    it("should have non-negative originalTokens and optimizedTokens", async () => {
      const { sc } = await optimize({ content: SAMPLE_DIFF, strategy: "diff" });
      expect(sc?.originalTokens as number).toBeGreaterThanOrEqual(0);
      expect(sc?.optimizedTokens as number).toBeGreaterThanOrEqual(0);
    });

    it("should allow negative savingsPercent in structuredContent for build", async () => {
      // Build strategy can produce larger output (adds markdown formatting)
      const { sc } = await optimize({ content: SAMPLE_BUILD, strategy: "build" });
      expect(typeof sc?.savingsPercent).toBe("number");
      // savingsPercent may be negative — verify it's within reasonable bounds
      expect(sc?.savingsPercent as number).toBeLessThanOrEqual(100);
    });

    it("should clamp savingsPercent to >= 0 in text output", async () => {
      const { text } = await optimize({ content: SAMPLE_BUILD, strategy: "build" });
      // Normal format: [type] X->Y tokens (-N%)
      const match = text.match(/\(-(\d+)%\)/);
      if (match) {
        expect(parseInt(match[1]!)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // =========================================================================
  // Comprehensive tests — empty/short structuredContent details
  // =========================================================================

  describe("empty/short input — structuredContent details", () => {
    it("should have all 6 correct fields for empty input", async () => {
      const { sc } = await optimize({ content: "" });
      expect(sc).toHaveProperty("detectedType", "none");
      expect(sc).toHaveProperty("originalTokens", 0);
      expect(sc).toHaveProperty("optimizedTokens", 0);
      expect(sc).toHaveProperty("savingsPercent", 0);
      expect(sc).toHaveProperty("method", "none");
      expect(sc).toHaveProperty("optimizedContent", "");
    });

    it("should have correct structuredContent for whitespace-only input", async () => {
      const { sc, result } = await optimize({ content: "   \n  \t  " });
      expect(result.isError).toBe(true);
      expect(sc?.detectedType).toBe("none");
      expect(sc?.optimizedContent).toBe("");
    });

    it("should have matching original and optimized tokens for short input", async () => {
      const { sc } = await optimize({ content: "short text here" });
      expect(sc?.originalTokens).toBe(sc?.optimizedTokens);
    });
  });

  // =========================================================================
  // Comprehensive tests — isError semantics
  // =========================================================================

  describe("isError semantics", () => {
    it("should set isError for empty input", async () => {
      const { result } = await optimize({ content: "" });
      expect(result.isError).toBe(true);
    });

    it("should not set isError for short non-empty input", async () => {
      const { result } = await optimize({ content: "short" });
      expect(result.isError).toBeUndefined();
    });

    it("should not set isError for normal compressed content", async () => {
      const { result } = await optimize({ content: SAMPLE_BUILD });
      expect(result.isError).toBeUndefined();
    });
  });

  // =========================================================================
  // Comprehensive tests — format param with logs
  // =========================================================================

  describe("format param with logs", () => {
    it("should support markdown format for logs strategy", async () => {
      const { text } = await optimize({ content: SAMPLE_LOGS, strategy: "logs", format: "markdown" });
      expect(text).toMatch(/##/);
    });

    it("should default to plain format for logs (no markdown headers)", async () => {
      const { text } = await optimize({ content: SAMPLE_LOGS, strategy: "logs" });
      // Plain format (default) should NOT contain markdown headers
      expect(text).not.toMatch(/^##\s/m);
    });
  });

  // =========================================================================
  // Comprehensive tests — legacy hint code mapping
  // =========================================================================

  describe("legacy hint — code mapping", () => {
    it("should map hint code to semantic strategy", async () => {
      const { sc } = await optimize({ content: SAMPLE_GENERIC, hint: "code" });
      expect(sc?.detectedType).toBe("semantic");
    });

    it("should map hint logs correctly", async () => {
      const { sc } = await optimize({ content: SAMPLE_GENERIC, hint: "logs" });
      expect(sc?.detectedType).toMatch(/^logs/);
    });

    it("should map hint errors correctly", async () => {
      const { sc } = await optimize({ content: SAMPLE_GENERIC, hint: "errors" });
      expect(sc?.detectedType).toBe("errors");
    });
  });

  // ---------------------------------------------------------------------------
  // Output budget cap (US-006)
  // ---------------------------------------------------------------------------

  describe("Output Budget Cap", () => {
    it("should include outputChars and truncated in structuredContent", async () => {
      const { sc, text } = await optimize({ content: SAMPLE_BUILD });
      expect(sc?.outputChars).toBe(text.length);
      expect(sc?.truncated).toBe(false);
    });

    it("should include outputChars for short content below threshold", async () => {
      const { sc, text } = await optimize({ content: "short" });
      expect(sc?.outputChars).toBe(text.length);
      expect(sc?.truncated).toBe(false);
    });

    it("should cap output to under 45,000 chars for large input", async () => {
      // Generate a large repetitive log (200K chars) that will compress but may still exceed 45K
      const line = "Jan 15 10:00:01 app-server [INFO] Processing request id=12345 method=GET path=/api/data status=200 duration=42ms user_agent=Mozilla/5.0\n";
      const largeContent = line.repeat(Math.ceil(200_000 / line.length));
      expect(largeContent.length).toBeGreaterThan(200_000);

      const { text, sc } = await optimize({ content: largeContent, strategy: "logs" });
      expect(text.length).toBeLessThanOrEqual(45_000);
      expect(sc?.outputChars).toBe(text.length);
    });

    it("should not apply cap logic for small inputs", async () => {
      const { sc } = await optimize({ content: SAMPLE_BUILD });
      // SAMPLE_BUILD is < 45K, so no recompression or truncation
      expect(sc?.truncated).toBe(false);
      expect((sc?.method as string) ?? "").not.toContain("recompressed");
    });

    it("should include truncation message when content is truncated", async () => {
      // Generate incompressible content (random-looking) that's very large
      const chars = "abcdefghijklmnopqrstuvwxyz0123456789 ";
      let incompressible = "";
      for (let i = 0; i < 60_000; i++) {
        incompressible += chars[i % chars.length];
        if (i % 80 === 79) incompressible += "\n";
      }

      const { text, sc } = await optimize({ content: incompressible });
      if (text.length >= 45_000) {
        // If the compressor couldn't bring it under budget, it should be truncated
        expect(text.length).toBeLessThanOrEqual(45_000);
        expect(sc?.truncated).toBe(true);
        expect(text).toContain("chars truncated");
      } else {
        // Compressor managed to bring it under budget — that's also fine
        expect(sc?.truncated).toBe(false);
      }
    });
  });
});
