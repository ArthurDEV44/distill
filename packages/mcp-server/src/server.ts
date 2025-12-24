/**
 * CtxOpt MCP Server
 *
 * Main server implementation with middleware architecture.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// State management
import {
  createSessionState,
  setProject,
  cleanupStaleEntries,
  type SessionState,
} from "./state/session.js";

// Middleware
import { createMiddlewareChain, type MiddlewareChain } from "./middleware/chain.js";
import { createLoggingMiddleware } from "./middleware/logging.js";
import { createStatsMiddleware } from "./middleware/stats.js";

// Tools
import { createToolRegistry, type ToolRegistry } from "./tools/registry.js";
import { analyzeContext, analyzeContextSchema } from "./tools/analyze-context.js";
import { getStats, getStatsSchema } from "./tools/get-stats.js";
import { optimizationTips, optimizationTipsSchema } from "./tools/optimization-tips.js";
import { sessionStatsTool } from "./tools/session-stats.js";
import { analyzeBuildOutputTool } from "./tools/analyze-build-output.js";
import { detectRetryLoopTool } from "./tools/detect-retry-loop.js";
import { compressContextTool } from "./tools/compress-context.js";
import { smartFileReadTool } from "./tools/smart-file-read.js";
import { deduplicateErrorsTool } from "./tools/deduplicate-errors.js";
import { summarizeLogsTool } from "./tools/summarize-logs.js";
import { autoOptimizeTool } from "./tools/auto-optimize.js";
import { smartCacheTool } from "./tools/smart-cache-tool.js";
import { semanticCompressTool } from "./tools/semantic-compress.js";
import { contextBudgetTool } from "./tools/context-budget.js";
import { codeSkeletonTool } from "./tools/code-skeleton.js";
import { conversationCompressTool } from "./tools/conversation-compress.js";
import { diffCompressTool } from "./tools/diff-compress.js";
import { smartPipelineTool } from "./tools/smart-pipeline.js";
import { registerModelTool } from "./tools/register-model.js";

// Utils
import { detectProject } from "./utils/project-detector.js";

export interface ServerConfig {
  verbose?: boolean;
}

export interface ServerInstance {
  server: Server;
  state: SessionState;
  middleware: MiddlewareChain;
  tools: ToolRegistry;
}

/**
 * Create and configure the MCP server
 */
export function createServer(config: ServerConfig = {}): ServerInstance {
  // Initialize session state
  const state = createSessionState({
    verbose: config.verbose ?? false,
  });

  // Detect project
  const project = detectProject();
  if (project) {
    setProject(state, project);
    if (config.verbose) {
      console.error(`[ctxopt] Detected project: ${project.name} (${project.type})`);
    }
  }

  // Create middleware chain
  const middleware = createMiddlewareChain();
  middleware.use(createLoggingMiddleware({ verbose: config.verbose ?? false }));
  middleware.use(createStatsMiddleware({ verbose: config.verbose ?? false }));

  // Create tool registry
  const tools = createToolRegistry();
  tools.setMiddlewareChain(middleware);

  // Register tools
  tools.register({
    name: "analyze_context",
    description:
      "Analyze a prompt or context for token usage and optimization opportunities. Returns token count, estimated cost, and suggestions for improvement.",
    inputSchema: analyzeContextSchema,
    execute: async (args, _state) => analyzeContext(args, config),
  });

  tools.register({
    name: "get_stats",
    description: "Get usage statistics for the current session or project. Shows token usage, costs, and trends.",
    inputSchema: getStatsSchema,
    execute: async (args, _state) => getStats(args, config),
  });

  tools.register({
    name: "optimization_tips",
    description:
      "Get context engineering best practices and optimization tips based on your usage patterns.",
    inputSchema: optimizationTipsSchema,
    execute: async (args, _state) => optimizationTips(args, config),
  });

  tools.register(sessionStatsTool);
  tools.register(analyzeBuildOutputTool);
  tools.register(detectRetryLoopTool);
  tools.register(compressContextTool);
  tools.register(smartFileReadTool);
  tools.register(deduplicateErrorsTool);
  tools.register(summarizeLogsTool);
  tools.register(autoOptimizeTool);
  tools.register(smartCacheTool);
  tools.register(semanticCompressTool);
  tools.register(contextBudgetTool);
  tools.register(codeSkeletonTool);
  tools.register(conversationCompressTool);
  tools.register(diffCompressTool);
  tools.register(smartPipelineTool);
  tools.register(registerModelTool);

  // Create MCP server
  const server = new Server(
    {
      name: "@ctxopt/mcp-server",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Handle ListTools request
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.getToolDefinitions(),
  }));

  // Handle CallTool request
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const result = await tools.execute(name, args, state);

    return {
      content: result.content,
      isError: result.isError,
    };
  });

  return {
    server,
    state,
    middleware,
    tools,
  };
}

/**
 * Cleanup session state before exit
 * Returns a cleanup function that can be called manually (e.g., on server close)
 */
function setupCleanupHooks(state: SessionState, verbose: boolean): () => Promise<void> {
  let isCleaningUp = false;

  const cleanup = async () => {
    // Prevent double cleanup
    if (isCleaningUp) return;
    isCleaningUp = true;

    const { errorsRemoved, patternsRemoved } = cleanupStaleEntries(state);
    if (verbose && (errorsRemoved > 0 || patternsRemoved > 0)) {
      console.error(
        `[ctxopt] Cleanup: removed ${errorsRemoved} errors, ${patternsRemoved} patterns`
      );
    }
  };

  // Run cleanup on process exit
  process.on("beforeExit", () => {
    cleanup();
  });

  process.on("SIGINT", () => {
    cleanup().finally(() => process.exit(0));
  });

  process.on("SIGTERM", () => {
    cleanup().finally(() => process.exit(0));
  });

  // Handle stdin close (when parent process closes the connection)
  process.stdin.on("close", () => {
    if (verbose) {
      console.error("[ctxopt] stdin closed");
    }
    cleanup().finally(() => process.exit(0));
  });

  return cleanup;
}

/**
 * Run the MCP server on stdio transport
 */
export async function runServer(config: ServerConfig = {}): Promise<void> {
  const { server, state } = createServer(config);

  // Setup cleanup hooks for graceful shutdown
  const cleanup = setupCleanupHooks(state, config.verbose ?? false);

  const transport = new StdioServerTransport();

  // Handle server close event (when transport disconnects)
  server.onclose = async () => {
    if (config.verbose) {
      console.error("[ctxopt] Server connection closed");
    }
    await cleanup();
    process.exit(0);
  };

  await server.connect(transport);

  if (config.verbose) {
    console.error(`[ctxopt] MCP Server started (session: ${state.sessionId})`);
    if (state.project) {
      console.error(`[ctxopt] Project: ${state.project.name} (${state.project.type})`);
    }
  } else {
    console.error("CtxOpt MCP Server running on stdio");
  }
}
