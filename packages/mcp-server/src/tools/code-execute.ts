/**
 * Code Execute Tool
 *
 * Executes TypeScript code with Distill SDK in a sandboxed environment.
 * Reduces MCP token overhead by ~98% compared to individual tool calls.
 */

import { z } from "zod";
import type { ToolDefinition } from "./registry.js";
import { executeSandbox, DEFAULT_LIMITS, isQuickJSEnabled } from "../sandbox/index.js";

/**
 * Input schema with semantic descriptions
 */
const codeExecuteSchema = {
  type: "object" as const,
  properties: {
    code: {
      type: "string",
      description:
        "TypeScript code to execute. Use 'return' to output results. " +
        "Access SDK via 'ctx' object (ctx.files, ctx.compress, ctx.code, etc.)",
    },
    timeout: {
      type: "number",
      description: "Execution timeout in ms (1000-30000)",
      minimum: 1000,
      maximum: 30000,
      default: 5000,
    },
  },
  required: ["code"],
};

/**
 * Output schema per MCP 2025-06-18 spec
 */
const codeExecuteOutputSchema = {
  type: "object" as const,
  properties: {
    success: { type: "boolean", description: "Whether execution succeeded" },
    output: { type: "string", description: "Execution result or error message" },
    executionTimeMs: { type: "number", description: "Time taken in milliseconds" },
    tokensUsed: { type: "number", description: "Tokens in output" },
  },
  required: ["success", "output"],
};

interface CodeExecuteArgs {
  code: string;
  timeout?: number;
}

/**
 * Execute code in sandbox
 */
async function executeCodeExecute(
  args: unknown
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean; structuredContent?: Record<string, unknown> }> {
  const sandboxMode = isQuickJSEnabled() ? "quickjs" : "legacy";
  const parsed = z.object({
    code: z.string(),
    timeout: z.number().optional(),
  }).safeParse(args);

  if (!parsed.success) {
    const errText = `[ERR] Invalid input: ${parsed.error.message}`;
    return {
      content: [{ type: "text", text: errText }],
      isError: true,
      structuredContent: {
        success: false,
        output: `Invalid input: ${parsed.error.message}`,
        executionTimeMs: 0,
        tokensUsed: 0,
        sandboxMode: sandboxMode,
        outputChars: errText.length,
        truncated: false,
      },
    };
  }

  const { code, timeout = DEFAULT_LIMITS.timeout } = parsed.data;

  // Validate timeout
  const safeTimeout = Math.min(
    Math.max(timeout, 1000), // Min 1 second
    DEFAULT_LIMITS.maxTimeout // Max 30 seconds
  );

  // Execute in sandbox
  const result = await executeSandbox(code, {
    workingDir: process.cwd(),
    timeout: safeTimeout,
    memoryLimit: DEFAULT_LIMITS.memoryLimit,
    maxOutputTokens: DEFAULT_LIMITS.maxOutputTokens,
  });

  if (!result.success) {
    const errText = `[ERR] ${result.error}\n\nExecution time: ${result.stats.executionTimeMs}ms`;
    return {
      content: [{ type: "text", text: errText }],
      isError: true,
      structuredContent: {
        success: false,
        output: result.error ?? "Unknown error",
        executionTimeMs: result.stats.executionTimeMs,
        tokensUsed: result.stats.tokensUsed,
        sandboxMode: sandboxMode,
        outputChars: errText.length,
        truncated: false,
      },
    };
  }

  // Format output
  let output: string;
  if (typeof result.output === "string") {
    output = result.output;
  } else if (result.output === null || result.output === undefined) {
    output = "(no output)";
  } else {
    output = JSON.stringify(result.output, null, 2);
  }

  const header = `[OK] ${result.stats.executionTimeMs}ms, ${result.stats.tokensUsed} tokens`;
  const fullText = `${header}\n\n${output}`;

  return {
    content: [{ type: "text", text: fullText }],
    structuredContent: {
      success: true,
      output,
      executionTimeMs: result.stats.executionTimeMs,
      tokensUsed: result.stats.tokensUsed,
      sandboxMode: sandboxMode,
      outputChars: fullText.length,
      truncated: false,
    },
  };
}

/**
 * Tool description with SDK reference — Anthropic 3-element pattern
 */
const DESCRIPTION =
  "Execute TypeScript in a QuickJS sandbox — replace 5-10 tool calls with one script.\n\n" +
  "WHEN TO USE: When you need to chain multiple operations (read files, compress, search, git) " +
  "in a single call. Each separate MCP tool call adds ~500 tokens overhead; batching saves 80-90%.\n\n" +
  "HOW TO FORMAT:\n" +
  '- Compress a file: code_execute({ code: \'return ctx.compress.auto(ctx.files.read("build.log"))\' })\n' +
  "- Batch reads: code_execute({ code: 'return [\"a.ts\",\"b.ts\"].map(f => ctx.code.skeleton(ctx.files.read(f), \"typescript\"))' })\n" +
  '- Git + compress: code_execute({ code: \'return ctx.compress.diff(ctx.git.diff("HEAD~3"))\' })\n\n' +
  "SDK (ctx.* namespaces):\n" +
  "- ctx.compress: auto(content,hint?), logs(logs), diff(diff), semantic(content,ratio?)\n" +
  "- ctx.code: parse(content,lang), extract(content,lang,{type,name}), skeleton(content,lang)\n" +
  "- ctx.files: read(path), exists(path), glob(pattern)\n" +
  "- ctx.git: diff(ref?), log(limit?), blame(file,line), status(), branch()\n" +
  "- ctx.search: grep(pattern,glob?), symbols(query,glob?), files(pattern), references(symbol,glob?)\n" +
  "- ctx.analyze: dependencies(file), callGraph(fn,file,depth?), exports(file), structure(dir,depth?)\n" +
  "- ctx.pipeline: steps(arr), codebaseOverview(dir?), findUsages(symbol,glob?), analyzeDeps(file,depth?)\n" +
  "- ctx.utils: countTokens(text), detectType(content), detectLanguage(path)\n\n" +
  "WHAT TO EXPECT: Execution result with timing stats. Use 'return' to output results. " +
  "Timeout default 5s (max 30s). Memory limit 128MB. Output auto-compressed if >4000 tokens.";

export const codeExecuteTool: ToolDefinition = {
  name: "code_execute",
  description: DESCRIPTION,
  inputSchema: codeExecuteSchema,
  outputSchema: codeExecuteOutputSchema,
  annotations: {
    title: "Code Execute",
    readOnlyHint: false, // Can modify files via ctx.files
    destructiveHint: true, // Can write/delete files via ctx.files, mutate state
    idempotentHint: false, // Results depend on filesystem state
    openWorldHint: false, // Sandboxed: no network, no external systems
    longRunningHint: true, // May take up to 30s
  },
  execute: executeCodeExecute,
};
