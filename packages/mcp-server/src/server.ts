/**
 * CtxOpt MCP Server
 *
 * Main server implementation with middleware architecture.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// Middleware
import { createMiddlewareChain, type MiddlewareChain } from "./middleware/chain.js";
import { createLoggingMiddleware } from "./middleware/logging.js";

// Tools
import { createToolRegistry, type ToolRegistry } from "./tools/registry.js";
import { analyzeContext, analyzeContextSchema } from "./tools/analyze-context.js";
import { optimizationTips, optimizationTipsSchema } from "./tools/optimization-tips.js";
import { analyzeBuildOutputTool } from "./tools/analyze-build-output.js";
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

export interface ServerConfig {
  verbose?: boolean;
}

export interface ServerInstance {
  server: Server;
  middleware: MiddlewareChain;
  tools: ToolRegistry;
}

/**
 * Create and configure the MCP server
 */
export function createServer(config: ServerConfig = {}): ServerInstance {
  // Create middleware chain
  const middleware = createMiddlewareChain();
  middleware.use(createLoggingMiddleware({ verbose: config.verbose ?? false }));

  // Create tool registry
  const tools = createToolRegistry();
  tools.setMiddlewareChain(middleware);

  // Register tools
  tools.register({
    name: "analyze_context",
    description:
      "Analyze a prompt or context for token usage and optimization opportunities. Returns token count, estimated cost, and suggestions for improvement.",
    inputSchema: analyzeContextSchema,
    execute: async (args) => analyzeContext(args, config),
  });

  tools.register({
    name: "optimization_tips",
    description:
      "Get context engineering best practices and optimization tips based on your usage patterns.",
    inputSchema: optimizationTipsSchema,
    execute: async (args) => optimizationTips(args, config),
  });

  tools.register(analyzeBuildOutputTool);
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

    const result = await tools.execute(name, args);

    return {
      content: result.content,
      isError: result.isError,
    };
  });

  return {
    server,
    middleware,
    tools,
  };
}

/**
 * Run the MCP server on stdio transport
 */
export async function runServer(config: ServerConfig = {}): Promise<void> {
  const { server } = createServer(config);

  const transport = new StdioServerTransport();

  // Handle server close event
  server.onclose = async () => {
    if (config.verbose) {
      console.error("[ctxopt] Server connection closed");
    }
    process.exit(0);
  };

  await server.connect(transport);

  console.error("CtxOpt MCP Server running on stdio");
}
