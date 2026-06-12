/**
 * Distill MCP Server
 *
 * Main server implementation with 3 always-loaded tools:
 * auto_optimize, smart_file_read, code_execute.
 *
 * US-017: the 3 tools are registered through the idiomatic high-level
 * `McpServer.registerTool` API (SDK v1.25) — the SDK owns CallTool dispatch,
 * Zod argument validation, annotations and `_meta` plumbing. ONE thing is
 * deliberately NOT delegated: the `tools/list` serialization. `McpServer`'s
 * serializer (mcp.js:75-85) re-renders every `inputSchema` through
 * `zodToJsonSchema` (adding `$schema`, `additionalProperties`, a `type` on each
 * enum) AND injects an `execution:{taskSupport}` field on every tool — ~+120
 * tokens/API call of framework boilerplate that Claude Code's MCP client
 * ignores (CLAUDE.md appendix row #3). Distill's entire value is a minimal wire
 * for these always-loaded tools, so we override `tools/list` to emit the
 * hand-tuned, token-optimized schema verbatim — byte-identical to the
 * pre-migration wire. See `tasks/prd-distill-v011-audit-remediation.md` US-017.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// Tools
import { createToolRegistry, type ToolRegistry } from "./tools/registry.js";
import { autoOptimizeTool } from "./tools/auto-optimize.js";
import { smartFileReadTool } from "./tools/smart-file-read.js";
import { codeExecuteTool } from "./tools/code-execute.js";
// Reuse smart_file_read's own full Zod input schema for SDK-side validation so
// no accepted field is stripped before the tool sees it.
import { inputSchema as smartFileReadInput } from "./tools/smart-file-read/support.js";

// Prompts (US-012 / US-013)
import { buildPromptMessage, findPrompt, listPromptsMetadata } from "./prompts.js";

export interface ServerConfig {
  verbose?: boolean;
}

export interface ServerInstance {
  /** The underlying low-level `Server` (McpServer.server) — owns the transport. */
  server: Server;
  tools: ToolRegistry;
}

/**
 * `_meta` emitted on every tool in `tools/list`. Only `anthropic/alwaysLoad` is
 * set — `anthropic/searchHint` is intentionally absent (ToolSearch uses it only
 * as a scoring signal and the deferred-tools prompt renders the name alone per
 * claude-code/tools/ToolSearchTool/prompt.ts:112-116; for alwaysLoad tools it is
 * unreachable, so emitting it would waste bytes).
 */
const ALWAYS_LOAD_META = { "anthropic/alwaysLoad": true } as const;

/**
 * Zod input schemas handed to `registerTool` for SDK-side argument validation
 * and to satisfy the US-017 acceptance criterion (each config carries a Zod
 * `inputSchema`). `registerTool` consumes the raw `.shape` (below) and rebuilds
 * a plain `z.object(shape)` via the SDK's `objectFromShape`
 * (@modelcontextprotocol/sdk/server/zod-compat.js) — which strips unknown keys
 * by default. A `.passthrough()` here would be a no-op: the modifier lives on
 * the ZodObject instance, not on `.shape`, so it is dropped on the rebuild.
 * Consequence: these schemas MUST enumerate every field each tool actually
 * reads, or the SDK strips it from `request.params.arguments` before the handler
 * runs (a silent behavioral change vs. the pre-migration raw-args path). They
 * therefore mirror each tool's own accepted-args contract — including
 * auto_optimize's legacy `hint` alias (consumed by detect.ts:resolveStrategy).
 * These are NOT the model-facing wire schema (that is the hand-tuned JSON emitted
 * by the tools/list override below).
 */
const autoOptimizeInput = z.object({
  content: z.string(),
  strategy: z
    .enum(["auto", "logs", "build", "diff", "stacktrace", "code", "semantic", "config", "errors"])
    .optional(),
  // Legacy strategy alias kept for back-compat callers; not advertised on the
  // wire schema, but the handler still reads it, so it must survive validation.
  hint: z.enum(["build", "logs", "errors", "code", "auto"]).optional(),
  response_format: z.enum(["minimal", "normal", "detailed"]).optional(),
  aggressive: z.boolean().optional(),
  preservePatterns: z.array(z.string()).optional(),
  format: z.enum(["plain", "markdown"]).optional(),
  // F2: query-aware compression hint. Must be enumerated here or registerTool's
  // objectFromShape strips it before the handler runs (same contract as `hint`).
  task: z.string().optional(),
});

const codeExecuteInput = z.object({
  code: z.string(),
  timeout: z.number().optional(),
});

/**
 * Create and configure the MCP server
 */
export async function createServer(config: ServerConfig = {}): Promise<ServerInstance> {
  // Create tool registry (verbose-mode logging inlined there)
  const tools = createToolRegistry(config.verbose ?? false);

  // Register the 3 core tools
  tools.register(autoOptimizeTool);
  tools.register(smartFileReadTool);
  tools.register(codeExecuteTool);

  // Server-level instructions for Claude Code's ToolSearch discovery.
  // Static content only — no timestamps, versions, or dynamic data (breaks prompt caching).
  const instructions =
    "Distill optimizes LLM token usage through 3 tools:\n" +
    "- auto_optimize: Compress large tool output (build logs, diffs, errors) before it enters context. Use after any command producing >500 chars.\n" +
    "- smart_file_read: Read code with AST extraction — get functions, classes, signatures without full file. Use instead of Read for supported languages (TS, JS, Python, Go, Rust, PHP, Swift).\n" +
    "- code_execute: Run TypeScript in sandbox with ctx.* SDK. Batch 5-10 operations (read, compress, git, search) in one call to save ~80% token overhead.\n" +
    "\n" +
    "Usage guidance:\n" +
    "- Prefer smart_file_read over Read for TS/JS/Python/Go/Rust/PHP/Swift — saves ~60% tokens.\n" +
    "- Always pipe build/test output through auto_optimize — saves 80-95% tokens.\n" +
    "- code_execute batches 5-10 tool calls into 1, saving ~500 tokens overhead per avoided call.";

  // High-level MCP server. prompts capability is declared up front (the prompt
  // handlers below are set on the underlying server); the tools capability +
  // listChanged are registered by registerTool.
  const mcp = new McpServer(
    {
      name: "distill-mcp",
      version: "0.11.1",
    },
    {
      capabilities: {
        prompts: {},
      },
      instructions,
    }
  );

  // Register each tool via the idiomatic registerTool API. The callback returns
  // ONLY { content, isError } — structuredContent is intentionally not on the
  // wire (Claude Code stashes it in mcpMeta and never sends it to the model;
  // see CLAUDE.md appendix row #6). outputSchema is intentionally omitted so it
  // never appears in tools/list.
  const dispatch =
    (name: string) =>
    async (args: Record<string, unknown>): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> => {
      const result = await tools.execute(name, args);
      return { content: result.content, isError: result.isError };
    };

  mcp.registerTool(
    autoOptimizeTool.name,
    {
      description: autoOptimizeTool.description,
      inputSchema: autoOptimizeInput.shape,
      annotations: autoOptimizeTool.annotations,
      _meta: ALWAYS_LOAD_META,
    },
    dispatch(autoOptimizeTool.name)
  );

  mcp.registerTool(
    smartFileReadTool.name,
    {
      description: smartFileReadTool.description,
      inputSchema: smartFileReadInput.shape,
      annotations: smartFileReadTool.annotations,
      _meta: ALWAYS_LOAD_META,
    },
    dispatch(smartFileReadTool.name)
  );

  mcp.registerTool(
    codeExecuteTool.name,
    {
      description: codeExecuteTool.description,
      inputSchema: codeExecuteInput.shape,
      annotations: codeExecuteTool.annotations,
      _meta: ALWAYS_LOAD_META,
    },
    dispatch(codeExecuteTool.name)
  );

  // Override tools/list to emit the hand-tuned, token-optimized schema verbatim
  // (US-017). `registerTool` already installed an SDK serializer; setRequestHandler
  // overwrites it (Server.setRequestHandler does not call assertCanSetRequestHandler,
  // so this is a clean override, not a throw). This keeps the wire byte-identical to
  // the pre-migration output: hand-tuned inputSchema (no $schema / additionalProperties
  // / per-enum type), no execution field, alwaysLoad in _meta, outputSchema absent.
  mcp.server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: tools.getToolDefinitions().map((tool) => ({
      ...tool,
      _meta: ALWAYS_LOAD_META,
    })),
  }));

  // US-012: MCP prompts → slash commands (mcp__distill-mcp__<name>).
  // Registry + lookup live in `./prompts.ts` (extracted for unit-test
  // coverage per US-013). Handlers are set on the underlying server (we don't
  // use registerPrompt) to match the inline-handler pattern (CLAUDE.md row #8).
  mcp.server.setRequestHandler(ListPromptsRequestSchema, () => ({
    prompts: listPromptsMetadata(),
  }));

  // Handle prompts/get — unknown names surface as -32602 Invalid params.
  mcp.server.setRequestHandler(GetPromptRequestSchema, (request) => {
    const { name } = request.params;
    const prompt = findPrompt(name);
    if (!prompt) {
      throw new McpError(ErrorCode.InvalidParams, `Unknown prompt: ${name}`);
    }
    return {
      description: prompt.description,
      messages: buildPromptMessage(prompt),
    };
  });

  // Set up notification for tool list changes.
  // Wrapped in try/catch because notification may fire before stdio transport is connected.
  tools.onToolsChanged(() => {
    // Notification may fire before stdio transport is connected. The try/catch
    // guards a synchronous throw; the `.catch` guards an async rejection — both
    // are ignored (US-008: no floating promise).
    try {
      mcp.server
        .notification({ method: "notifications/tools/list_changed" })
        .catch(() => {
          // Ignore — transport may not be connected yet during startup registration
        });
    } catch {
      // Ignore — transport may not be connected yet during startup registration
    }
  });

  return {
    server: mcp.server,
    tools,
  };
}

/**
 * Run the MCP server on stdio transport
 */
export async function runServer(config: ServerConfig = {}): Promise<void> {
  const { server } = await createServer(config);

  const transport = new StdioServerTransport();

  // Handle server close event. Non-async (the body awaits nothing) so it
  // matches the expected `() => void` handler shape (US-008: no-misused-promises).
  server.onclose = () => {
    if (config.verbose) {
      console.error("[distill] Server connection closed");
    }
    process.exit(0);
  };

  await server.connect(transport);

  console.error("Distill MCP Server running on stdio");
}
