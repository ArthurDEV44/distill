/**
 * Distill MCP Server
 *
 * Main server implementation with 3 always-loaded tools:
 * auto_optimize, smart_file_read, code_execute.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

// Tools
import { createToolRegistry, type ToolRegistry } from "./tools/registry.js";
import { autoOptimizeTool } from "./tools/auto-optimize.js";
import { smartFileReadTool } from "./tools/smart-file-read.js";
import { codeExecuteTool } from "./tools/code-execute.js";

// Prompts (US-012 / US-013)
import { buildPromptMessage, findPrompt, listPromptsMetadata } from "./prompts.js";

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
      version: "0.10.0",
    },
    {
      capabilities: {
        tools: {},
        prompts: {},
      },
      instructions,
    }
  );

  // Handle ListTools request — emit only anthropic/alwaysLoad in _meta.
  // anthropic/searchHint is intentionally NOT emitted: ToolSearch uses it only as a scoring
  // signal, and the deferred-tools prompt renders the tool name alone per
  // claude-code/tools/ToolSearchTool/prompt.ts:112-116 — so for alwaysLoad:true tools (which
  // never hit ToolSearch) the hint is unreachable. Emitting an empty-string would waste bytes
  // without enabling any downstream behavior.
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.getToolDefinitions().map((tool) => ({
      ...tool,
      _meta: {
        "anthropic/alwaysLoad": true,
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

    return {
      content: result.content,
      isError: result.isError,
    };
  });

  // US-012: MCP prompts → slash commands (mcp__distill-mcp__<name>).
  // Registry + lookup live in `./prompts.ts` (extracted for unit-test
  // coverage per US-013). Handlers stay inline here to match the
  // tool-registration pattern (see CLAUDE.md appendix row #8).
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: listPromptsMetadata(),
  }));

  // Handle prompts/get — unknown names surface as -32602 Invalid params.
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
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
