/**
 * Code Execute Tool
 *
 * Executes TypeScript code with ctxopt SDK in a sandboxed environment.
 * Reduces MCP token overhead by ~98% compared to individual tool calls.
 */

import type { ToolDefinition } from "./registry.js";
import { executeSandbox, DEFAULT_LIMITS } from "../sandbox/index.js";

/**
 * Minimal schema for token efficiency
 */
const codeExecuteSchema = {
  type: "object" as const,
  properties: {
    code: { type: "string" },
    timeout: { type: "number" },
  },
  required: ["code"],
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
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const { code, timeout = DEFAULT_LIMITS.timeout } = args as CodeExecuteArgs;

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
    return {
      content: [
        {
          type: "text",
          text: `[ERR] ${result.error}\n\nExecution time: ${result.stats.executionTimeMs}ms`,
        },
      ],
      isError: true,
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

  return {
    content: [
      {
        type: "text",
        text: `${header}\n\n${output}`,
      },
    ],
  };
}

/**
 * Tool description with SDK reference
 */
const DESCRIPTION = `Execute TypeScript with ctxopt SDK. 98% fewer tokens than tool calls.

SDK (ctx):
  compress: auto(content,hint?) logs(logs) diff(diff) semantic(content,ratio?)
  code: parse(content,lang) extract(content,lang,{type,name}) skeleton(content,lang)
  files: read(path) exists(path) glob(pattern)
  utils: countTokens(text) detectType(content) detectLanguage(path)

Example: return ctx.compress.auto(ctx.files.read("logs.txt"))`;

export const codeExecuteTool: ToolDefinition = {
  name: "code_execute",
  description: DESCRIPTION,
  inputSchema: codeExecuteSchema,
  execute: executeCodeExecute,
};
