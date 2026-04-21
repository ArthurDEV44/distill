/**
 * Distill MCP Server
 *
 * Main server implementation with 3 always-loaded tools:
 * auto_optimize, smart_file_read, code_execute.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// Tools
import { createToolRegistry, type ToolRegistry } from "./tools/registry.js";
import { autoOptimizeTool } from "./tools/auto-optimize.js";
import { smartFileReadTool } from "./tools/smart-file-read.js";
import { codeExecuteTool } from "./tools/code-execute.js";

export interface ServerConfig {
  verbose?: boolean;
}

export interface ServerInstance {
  server: Server;
  tools: ToolRegistry;
}

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

  // Create MCP server
  const server = new Server(
    {
      name: "distill-mcp",
      version: "0.8.1",
    },
    {
      capabilities: {
        tools: {},
      },
      instructions,
    }
  );

  // Per-tool searchHint for Claude Code's ToolSearch discovery
  // No newlines — Claude Code collapses whitespace but newlines inject lines into the system prompt.
  const searchHints: Record<string, string> = {
    auto_optimize: "compress optimize token reduce build logs diff errors stacktrace",
    smart_file_read: "read code file AST extract function class skeleton signature",
    code_execute: "execute typescript sandbox batch SDK script multi-operation",
  };

  // Handle ListTools request — include _meta for always-load and search hints only.
  // NOTE: maxResultSizeChars is intentionally NOT set. Claude Code reads this property from the
  // top-level Tool object (not _meta) and clamps all tools to DEFAULT_MAX_RESULT_SIZE_CHARS=50_000
  // regardless of what the server declares — so emitting it has no effect. The MCP SDK's ToolSchema
  // also strips unknown top-level properties via Zod, making _meta the only place it could live,
  // and Claude Code doesn't look there. Output size enforcement is handled in-tool via the 45K
  // budget cap (see auto-optimize and smart-file-read MAX_OUTPUT_CHARS).
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.getToolDefinitions().map((tool) => ({
      ...tool,
      _meta: {
        "anthropic/alwaysLoad": true,
        "anthropic/searchHint": searchHints[tool.name] ?? "",
      },
    })),
  }));

  // Handle CallTool request
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (!tools.get(name)) {
      return {
        content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    const result = await tools.execute(name, args);

    const response: Record<string, unknown> = {
      content: result.content,
      isError: result.isError,
    };

    // Include structuredContent when available (MCP 2025-06-18)
    if (result.structuredContent) {
      response.structuredContent = result.structuredContent;
    }

    return response;
  });

  // Set up notification for tool list changes
  // Wrapped in try/catch because notification may fire before stdio transport is connected
  tools.onToolsChanged(() => {
    try {
      server.notification({
        method: "notifications/tools/list_changed",
      });
    } catch {
      // Ignore — transport may not be connected yet during startup registration
    }
  });

  return {
    server,
    tools,
  };
}

/**
 * Run the MCP server on stdio transport
 */
export async function runServer(config: ServerConfig = {}): Promise<void> {
  const { server } = await createServer(config);

  const transport = new StdioServerTransport();

  // Handle server close event
  server.onclose = async () => {
    if (config.verbose) {
      console.error("[distill] Server connection closed");
    }
    process.exit(0);
  };

  await server.connect(transport);

  console.error("Distill MCP Server running on stdio");
}
