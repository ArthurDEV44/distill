/**
 * CtxOpt MCP Server
 *
 * Main server implementation with middleware architecture.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// State management
import { createSessionState, setProject, type SessionState } from "./state/session.js";

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

// Utils
import { detectProject } from "./utils/project-detector.js";

export interface ServerConfig {
  apiKey?: string;
  apiBaseUrl?: string;
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
    apiKey: config.apiKey,
    apiBaseUrl: config.apiBaseUrl,
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
 * Run the MCP server on stdio transport
 */
export async function runServer(config: ServerConfig = {}): Promise<void> {
  const { server, state } = createServer(config);

  const transport = new StdioServerTransport();
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
